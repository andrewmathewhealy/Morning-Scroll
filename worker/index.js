// Origins allowed to call this worker. Add your production domain(s) here
// once deployed (e.g. "https://morning-scroll.pages.dev").
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
]);

// Reflected back on responses. The actual security gate is isAllowedOrigin()
// below — these headers just unblock the browser for legitimate callers.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  // No Origin header = non-browser request (curl, server-to-server). Block
  // these too — legitimate clients always send Origin.
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

// ── DAILY PROMPTS (edit freely) ────────────────────────────
const COSMIC_BRIEF_PROMPT = `You are the editor of The Cosmic Brief, a single daily dispatch reporting on the nature of reality in the style of a straight-faced wire service.

Your reader is already in on the joke. They know they are a spiritual being having a human experience. They know the material world is temporary and a little absurd. You are not teaching them — you are sharing a knowing look with them.

The core duality: spiritual (infinite, eternal, vast) vs. material (mundane, biological, bureaucratic). The humor is never constructed. It comes entirely from the act of reporting eternal or cosmic truths in a straight wire service format. Do not write jokes. Do not add punchlines. Do not editorialize. Simply report. The format is the humor.

Worldview: The Cosmic Brief operates from the perspective that all conscious beings are already complete, already free, and already home. The great irony it reports on — gently, without judgment — is that human civilization collectively organizes enormous effort toward the external world, while the one thing that would end all seeking requires nothing, costs nothing, and is available in any moment. This is not reported as a criticism. It is the central, loving joke of existence — that God went looking for God, using increasingly sophisticated equipment. The goal is not to be clever. The goal is to give the reader a brief moment of genuine expansion — a reminder of their connection to something larger than their daily concerns. Warmth is more important than wit. If a headline makes someone feel something, it has succeeded. If it only makes them think something, it has missed.

Format: one headline, then a short 3-4 sentence article in the same deadpan wire service tone.

Rules:
- Report plainly. The absurdity is inherent, not constructed.
- No complex scientific or technical language.
- The joke is never on the reader or on humans generally.
- Third person only.
- No specific religious figures (Jesus, Mohammed, etc.). God, the universe, consciousness, awareness, the infinite are all fine.
- No references to death or dying.
- No nihilism. The underlying note is always warmth and okayness.
- Single clean headline. No dateline, no quote marks.
- The APOD image title and description below may loosely inspire the theme. Do not force it.

Today's NASA APOD image:
Title: [APOD_TITLE]
Description: [APOD_DESCRIPTION]

Generate one headline and one short article.`;

const JOURNAL_PROMPT_INSTRUCTIONS = `You generate a single daily journal prompt for a morning app.

The prompt should be light, playful, and imaginative. It requires no spiritual knowledge, no self-improvement mindset, and no deep reflection. It should be genuinely answerable in one or two sentences.

Formats to rotate between freely:
- A preference between two random things
- A hypothetical scenario with no real stakes
- A memory prompt
- A completely random question about life, food, travel, animals, music, movies, or anything ordinary

Rules:
- No politics, no news, no self-improvement language
- No prompts about death, loss, or hardship
- Should feel like a question a friend texts you randomly
- One sentence only. No explanation, no context.

Generate one prompt.`;

// ── EDGE CACHE HELPER ──────────────────────────────────────
// Wrap a handler with Cloudflare's persistent edge cache (caches.default).
// Unlike in-memory Maps, this survives deploys and is shared across regions.
//
// ttl: seconds to cache
// keySuffix: optional string appended to the cache-key URL (e.g. today's date
//   for endpoints whose request URL doesn't uniquely identify the content)
async function withEdgeCache(request, ctx, handler, ttl, keySuffix) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  if (keySuffix) cacheUrl.searchParams.set("_k", keySuffix);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return new Response(body, {
      status: cached.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const res = await handler();
  // Only cache successful JSON responses
  if (res.ok) {
    const body = await res.clone().text();
    const cacheable = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttl}`,
      },
    });
    const put = cache.put(cacheKey, cacheable);
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return res;
}

const todayUTC = () => new Date().toISOString().slice(0, 10);

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      // Preflight: only respond with CORS headers if the origin is allowed
      if (!isAllowedOrigin(request)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!isAllowedOrigin(request)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Each endpoint's TTL reflects how stale its data can be.
    if (path === "/weather")            return withEdgeCache(request, ctx, () => handleWeather(request, env, url),          600);            // 10 min
    if (path === "/sports")             return withEdgeCache(request, ctx, () => handleSports(request, env, url),           600);            // 10 min
    if (path === "/wikipedia")          return withEdgeCache(request, ctx, () => handleWikipedia(request, env),             86400, todayUTC()); // daily
    if (path === "/journal-prompt")     return withEdgeCache(request, ctx, () => handleJournalPrompt(request, env),         86400, todayUTC()); // daily
    if (path === "/youtube")            return withEdgeCache(request, ctx, () => handleYouTube(request, env, url),          10800);          // 3 hours
    if (path === "/youtube/channel")    return withEdgeCache(request, ctx, () => handleYouTubeChannel(request, env, url),   86400);          // 1 day
    if (path === "/youtube/live-status")return withEdgeCache(request, ctx, () => handleYouTubeLiveStatus(request, env, url),300);            // 5 min
    if (path === "/api/videos")         return handleVideosFeed(request, env);
    if (path === "/api/daily")          return handleDaily(request, env, ctx); // has its own cache logic

    return json({ error: "Not found" }, 404);
  },

  // Cron trigger — refreshes the video feed cache daily at 6am UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshVideosFeed(env));
  },
};

async function handleWeather(request, env, url) {
  try {
    const apiKey = env.WEATHER_API_KEY;
    if (!apiKey) return json({ error: "WEATHER_API_KEY not configured" }, 500);

    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    if (!lat || !lon) return json({ error: "lat and lon params required" }, 400);

    // Visual Crossing Timeline API — current + today's hours for forecast strip
    const upstream = new URL(
      `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lon}/today`
    );
    upstream.searchParams.set("unitGroup",   "us");              // Fahrenheit
    upstream.searchParams.set("include",     "current,hours,days");   // current + hourly
    upstream.searchParams.set("contentType", "json");
    upstream.searchParams.set("key",         apiKey);

    const response = await fetch(upstream.toString());
    const body = await response.json();
    return json(body, response.status);
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

// --- Sports Scores (TheSportsDB) ---
// League IDs: NFL=4391, NBA=4387, MLB=4424, NHL=4380
const LEAGUES = {
  nfl:  4391,
  nba:  4387,
  mlb:  4424,
  nhl:  4380,
};

async function handleSports(request, env, url) {
  try {
    const apiKey = env.SPORTSDB_API_KEY || "123";
    const base = `https://www.thesportsdb.com/api/v1/json/${apiKey}`;

    // ?league=nba,nfl  (comma-sep, defaults to all)
    // ?type=live|recent|upcoming  (defaults to all three)
    // ?date=2026-03-21  (for eventsday, defaults to today)
    const leagueParam = url.searchParams.get("league");
    const typeParam = url.searchParams.get("type");
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const requestedLeagues = leagueParam
      ? leagueParam.toLowerCase().split(",").filter(l => LEAGUES[l])
      : Object.keys(LEAGUES);

    const types = typeParam
      ? typeParam.toLowerCase().split(",")
      : ["live", "recent", "upcoming"];

    const fetches = [];

    for (const league of requestedLeagues) {
      const leagueId = LEAGUES[league];

      for (const type of types) {
        let endpoint;
        if (type === "live") {
          endpoint = `${base}/eventsday.php?d=${date}&l=${leagueId}`;
        } else if (type === "recent") {
          endpoint = `${base}/eventspastleague.php?id=${leagueId}`;
        } else if (type === "upcoming") {
          endpoint = `${base}/eventsnextleague.php?id=${leagueId}`;
        } else {
          continue;
        }

        fetches.push(
          fetch(endpoint, { headers: { "User-Agent": "MorningScroll/1.0" } })
            .then(r => r.json())
            .then(body => ({ league, type, data: body.events || [] }))
            .catch(() => ({ league, type, data: [] }))
        );
      }
    }

    const results = await Promise.all(fetches);

    // Group by league, then by type
    const grouped = {};
    for (const { league, type, data } of results) {
      if (!grouped[league]) grouped[league] = {};
      grouped[league][type] = data.map(e => ({
        id:           e.idEvent,
        name:         e.strEvent,
        league:       e.strLeague,
        sport:        e.strSport,
        homeTeam:     e.strHomeTeam,
        awayTeam:     e.strAwayTeam,
        homeScore:    e.intHomeScore,
        awayScore:    e.intAwayScore,
        homeBadge:    e.strHomeTeamBadge || null,
        awayBadge:    e.strAwayTeamBadge || null,
        status:       e.strStatus || null,
        date:         e.dateEvent,
        time:         e.strTime,
        venue:        e.strVenue,
        round:        e.intRound,
        season:       e.strSeason,
      }));
    }

    return json({ date, leagues: grouped });
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

// --- Wikipedia "On This Day" + AI curation ---
async function handleWikipedia(request, env) {
  try {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    // 1. Fetch raw Wikipedia "On This Day" events
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
      { headers: { "User-Agent": "MorningScroll/1.0" } }
    );
    const wikiData = await wikiRes.json();
    const events = (wikiData.events || []).slice(0, 12);

    if (!events.length) {
      return json({ error: "No events found for today" }, 404);
    }

    // Build event summaries with URLs for the AI
    const eventsWithUrls = events.map(e => ({
      year: e.year,
      text: e.text,
      url: e.pages?.[0]?.content_urls?.desktop?.page || null,
    }));
    const summaries = events.map(e => `Year ${e.year}: ${e.text}`).join("\n");
    const dateLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

    // 2. If no Anthropic key, fall back to a simple random pick
    const anthropicKey = env.Claude;
    if (!anthropicKey) {
      const pick = events[Math.floor(Math.random() * Math.min(events.length, 5))];
      const fallback = {
        year: String(pick.year),
        text: pick.text,
        location: pick.pages?.[0]?.description || null,
        wiki_url: pick.pages?.[0]?.content_urls?.desktop?.page || null,
      };
      return json(fallback);
    }

    // 3. Send to Anthropic for curation
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system:
          "You are a curator for a feel-good morning digest app. From the historical events listed, pick the single most uplifting, wondrous, or genuinely fascinating one. STRICT RULES: Never pick events involving deaths, disasters, wars, violence, accidents, crimes, or any tragedy — even if historically significant. Prioritize: scientific breakthroughs, artistic milestones, exploration firsts, humanitarian achievements, cultural celebrations. Respond ONLY with valid JSON in this exact format: {\"year\":\"YYYY\",\"text\":\"One engaging sentence, 20-35 words.\",\"location\":\"City or region where it happened\",\"wiki_url\":\"URL\"} — no markdown, no explanation, no extra fields.",
        messages: [
          {
            role: "user",
            content: `Today is ${dateLabel}. Pick the best uplifting event (no deaths, no disasters, no violence):\n\n${summaries}\n\nAlso include the Wikipedia URL and a short location for each: ${JSON.stringify(eventsWithUrls)}`,
          },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const event = JSON.parse(cleaned);
    return json(event);
  } catch (err) {
    // Fallback: return a random pick so the widget never breaks
    try {
      const now = new Date();
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${now.getUTCMonth() + 1}/${now.getUTCDate()}`,
        { headers: { "User-Agent": "MorningScroll/1.0" } }
      );
      const wikiData = await wikiRes.json();
      const events = (wikiData.events || []).slice(0, 5);
      const pick = events[Math.floor(Math.random() * events.length)];
      return json({
        year: String(pick.year),
        text: pick.text,
        location: pick.pages?.[0]?.description || null,
        wiki_url: pick.pages?.[0]?.content_urls?.desktop?.page || null,
      });
    } catch {
      return json({ error: "Worker exception", detail: err.message }, 500);
    }
  }
}

// --- Journal Prompt (Anthropic) ---
async function handleJournalPrompt(request, env) {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

    const anthropicKey = env.Claude;

    // Collect recent prompts passed as query param to avoid repetition
    const url = new URL(request.url);
    const recentPromptsParam = url.searchParams.get("recent") || "";
    const recentPrompts = recentPromptsParam
      ? decodeURIComponent(recentPromptsParam).split("|||").filter(Boolean)
      : [];

    const recentSection = recentPrompts.length
      ? `\n\nHere are the last ${recentPrompts.length} prompts — do NOT repeat or closely resemble any of them:\n${recentPrompts.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`
      : "";

    if (!anthropicKey) {
      // Fallback without AI
      return json({
        date: today,
        prompt: "What's one small thing you're looking forward to today?",
      });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 60,
        system: `You generate a single daily journal prompt for a morning app.

The prompt should be light, playful, and imaginative. It requires no spiritual knowledge, no self-improvement mindset, and no deep reflection. It should be genuinely answerable in one or two sentences.

Formats to rotate between freely:
- A preference between two random things
- A hypothetical scenario with no real stakes
- A memory prompt
- A completely random question about life, food, travel, animals, music, movies, or anything ordinary

Rules:
- No politics, no news, no self-improvement language
- No prompts about death, loss, or hardship
- Should feel like a question a friend texts you randomly
- One sentence only. No explanation, no context.

Generate one prompt.${recentSection}`,
        messages: [
          { role: "user", content: `Generate a morning journal prompt for ${dateLabel}.` },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const prompt = (aiData.content?.[0]?.text || "").trim();

    if (!prompt) {
      return json({ date: today, prompt: "What's one small thing you're looking forward to today?" });
    }

    return json({ date: today, prompt });
  } catch (err) {
    return json({
      date: new Date().toISOString().slice(0, 10),
      prompt: "What's one small thing you're looking forward to today?",
    });
  }
}

// --- YouTube RSS + Channel Lookup ---
async function handleYouTube(request, env, url) {
  try {
    const channelIds = url.searchParams.get("channels");
    if (!channelIds) return json({ error: "channels param required" }, 400);

    const ids = channelIds.split(",").filter(Boolean);
    const results = {};

    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
          { headers: { "User-Agent": "MorningScroll/1.0" } }
        );
        const xml = await res.text();

        // Parse XML entries — extract title, videoId, published
        const videos = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(xml)) !== null && videos.length < 10) {
          const entry = match[1];
          const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
          const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
          const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
          if (videoId && title) {
            videos.push({
              videoId,
              title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
              published,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            });
          }
        }

        results[id] = videos;
      } catch {
        results[id] = [];
      }
    }));

    return json({ channels: results });
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

async function handleYouTubeChannel(request, env, url) {
  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) return json({ error: "YOUTUBE_API_KEY not configured" }, 500);

    const input = url.searchParams.get("q");
    if (!input) return json({ error: "q param required" }, 400);

    // Determine if input is a channel ID, handle/username, or URL
    let channelId = null;
    let searchQuery = input.trim();

    // Direct channel ID
    if (/^UC[\w-]{22}$/.test(searchQuery)) {
      channelId = searchQuery;
    }

    // URL parsing
    const urlMatch = searchQuery.match(/youtube\.com\/(channel\/(UC[\w-]{22})|(@[\w.-]+)|c\/([\w.-]+)|user\/([\w.-]+))/);
    if (urlMatch) {
      if (urlMatch[2]) channelId = urlMatch[2];
      else searchQuery = urlMatch[3] || urlMatch[4] || urlMatch[5] || searchQuery;
    }

    // Handle format @name
    if (searchQuery.startsWith("@")) {
      searchQuery = searchQuery;
    }

    // If we have a channel ID, fetch directly
    if (channelId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`,
        { headers: { "User-Agent": "MorningScroll/1.0" } }
      );
      const data = await res.json();
      const ch = data.items?.[0];
      if (!ch) return json({ error: "Channel not found" }, 404);
      return json({
        channelId: ch.id,
        name: ch.snippet.title,
        avatar: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url,
      });
    }

    // Search by name/handle
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=1&key=${apiKey}`,
      { headers: { "User-Agent": "MorningScroll/1.0" } }
    );
    const data = await res.json();
    const ch = data.items?.[0];
    if (!ch) return json({ error: "Channel not found" }, 404);

    return json({
      channelId: ch.snippet.channelId,
      name: ch.snippet.channelTitle,
      avatar: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url,
    });
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

// Check which video IDs are currently live. Cached 5 min at the edge.
async function handleYouTubeLiveStatus(request, env, url) {
  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) return json({ error: "YOUTUBE_API_KEY not configured" }, 500);

    const idsParam = url.searchParams.get("ids");
    if (!idsParam) return json({ error: "ids param required" }, 400);

    const ids = idsParam.split(",").filter(Boolean).slice(0, 50);

    const upstream = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids.join(",")}&key=${apiKey}`;
    const res = await fetch(upstream, { headers: { "User-Agent": "MorningScroll/1.0" } });
    const data = await res.json();

    const status = {};
    for (const id of ids) status[id] = { live: false };
    for (const item of (data.items || [])) {
      const isLive = item.snippet?.liveBroadcastContent === "live"
        || (item.liveStreamingDetails?.actualStartTime && !item.liveStreamingDetails?.actualEndTime);
      status[item.id] = {
        live: !!isLive,
        thumbnail: item.snippet?.thumbnails?.medium?.url || null,
      };
    }

    return json({ status });
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

// ── /api/daily — APOD + Cosmic Brief + Journal Prompt ─────
async function handleDaily(request, env, ctx) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = ""; // ignore query for cache key
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  // Try cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Re-emit with CORS headers (cached responses preserve original headers)
    const body = await cached.text();
    return new Response(body, {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  try {
    // 1. NASA APOD (with fallback to previous days if today's fails)
    const nasaKey = env.NASA_API_KEY || "DEMO_KEY";
    const fetchApod = async (dateParam) => {
      const url = `https://api.nasa.gov/planetary/apod?api_key=${nasaKey}${dateParam ? `&date=${dateParam}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const raw = await r.json();
      // Only accept image results with a usable url
      if (!raw?.url) return null;
      if (raw.media_type && raw.media_type !== "image" && raw.media_type !== "video") return null;
      return {
        url: raw.url,
        title: raw.title || "",
        explanation: raw.explanation || "",
        media_type: raw.media_type || "image",
      };
    };

    let apod = await fetchApod(null);
    if (!apod) {
      // Try the previous 3 days as fallback
      for (let i = 1; i <= 3 && !apod; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        apod = await fetchApod(d.toISOString().slice(0, 10));
      }
    }
    if (!apod) {
      apod = { url: null, title: "", explanation: "", media_type: "image" };
    }

    // 2. Two Claude calls in parallel
    const anthropicKey = env.Claude;
    if (!anthropicKey) {
      return json({ error: "Claude key not configured" }, 500);
    }

    const callClaude = async (system, userMsg, maxTokens) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      const data = await res.json();
      return (data.content?.[0]?.text || "").trim();
    };

    const cosmicSystem = COSMIC_BRIEF_PROMPT
      .replace("[APOD_TITLE]", apod.title)
      .replace("[APOD_DESCRIPTION]", apod.explanation);

    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

    const [cosmicRaw, journalPrompt] = await Promise.all([
      callClaude(cosmicSystem, "Generate today's Cosmic Brief.", 400),
      callClaude(JOURNAL_PROMPT_INSTRUCTIONS, `Generate a morning journal prompt for ${dateLabel}.`, 60),
    ]);

    // 3. Parse cosmic brief: first line = headline, rest = article
    const firstBreak = cosmicRaw.indexOf("\n");
    const stripMd = (s) => s.replace(/\*\*/g, "").replace(/^#+\s*/, "").replace(/^["']|["']$/g, "").trim();
    const headline = stripMd(firstBreak === -1 ? cosmicRaw : cosmicRaw.slice(0, firstBreak));
    const article = stripMd(firstBreak === -1 ? "" : cosmicRaw.slice(firstBreak + 1));

    const payload = {
      apod,
      cosmic_brief: { headline, article },
      journal_prompt: journalPrompt,
    };

    const fresh = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "MISS",
      },
    });

    if (ctx?.waitUntil) {
      ctx.waitUntil(cache.put(cacheKey, fresh.clone()));
    } else {
      await cache.put(cacheKey, fresh.clone());
    }
    return fresh;
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

// ── YOUTUBE VIDEO FEED ───────────────────────────────────
// Curated channels per category. Add more channels/categories here.
const VIDEO_CHANNELS = {
  animals: [
    { channelId: "UCINb0wqPz-A0dV9nARjJlOQ", name: "The Dodo" },
  ],
};

const VIDEOS_CACHE_KEY = "videos_feed";
const VIDEOS_CACHE_TTL = 86400; // 24 hours in seconds

// Fetch videos for a single channel. Returns an array of video objects.
// If no videos in the last 24h, falls back to the 3 most recent uploads.
async function fetchChannelVideos(channelId, channelName, apiKey) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("order", "date");
  url.searchParams.set("type", "video");
  url.searchParams.set("publishedAfter", twentyFourHoursAgo);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error(`YouTube API error for ${channelName}: ${res.status}`);
    return [];
  }

  let data = await res.json();
  let items = data.items || [];

  // Fallback: if no videos in last 24h, fetch the 3 most recent (no date filter)
  if (items.length === 0) {
    const fallbackUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    fallbackUrl.searchParams.set("part", "snippet");
    fallbackUrl.searchParams.set("channelId", channelId);
    fallbackUrl.searchParams.set("maxResults", "3");
    fallbackUrl.searchParams.set("order", "date");
    fallbackUrl.searchParams.set("type", "video");
    fallbackUrl.searchParams.set("key", apiKey);

    const fallbackRes = await fetch(fallbackUrl.toString());
    if (fallbackRes.ok) {
      data = await fallbackRes.json();
      items = data.items || [];
    }
  }

  return items.map(item => ({
    video_id: item.id.videoId,
    title: item.snippet.title,
    thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/maxresdefault.jpg`,
    channel: item.snippet.channelTitle,
    published_at: item.snippet.publishedAt,
    embed_url: `https://www.youtube.com/embed/${item.id.videoId}?playsinline=1&rel=0`,
  }));
}

// Fetch recent videos from the YouTube Data API for all curated channels.
// Channels are fetched in parallel (Promise.all) for speed.
async function fetchVideosFeed(env) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured");

  const feed = {};

  for (const [category, channels] of Object.entries(VIDEO_CHANNELS)) {
    // Fetch all channels in this category in parallel
    const results = await Promise.all(
      channels.map(ch => fetchChannelVideos(ch.channelId, ch.name, apiKey))
    );

    const categoryVideos = results.flat();
    // Sort newest first
    categoryVideos.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    feed[category] = categoryVideos;
  }

  return { ...feed, cached_at: new Date().toISOString() };
}

// Called by cron trigger — fetches fresh data and writes to KV
async function refreshVideosFeed(env) {
  try {
    const feed = await fetchVideosFeed(env);
    await env.FEED_CACHE.put(VIDEOS_CACHE_KEY, JSON.stringify(feed), {
      expirationTtl: VIDEOS_CACHE_TTL,
    });
    console.log("Video feed cache refreshed at", feed.cached_at);
  } catch (err) {
    console.error("Failed to refresh video feed:", err.message);
  }
}

// Serves /api/videos — reads from KV, falls back to live fetch if cache is empty
async function handleVideosFeed(request, env) {
  try {
    // Try KV cache first
    const cached = await env.FEED_CACHE.get(VIDEOS_CACHE_KEY);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Cache miss (first deploy, or KV expired) — fetch live and populate cache
    const feed = await fetchVideosFeed(env);
    const body = JSON.stringify(feed);

    // Store in KV for next request (non-blocking)
    env.FEED_CACHE.put(VIDEOS_CACHE_KEY, body, { expirationTtl: VIDEOS_CACHE_TTL });

    return new Response(body, {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    return json({ error: "Failed to fetch video feed", detail: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
