// Origins allowed to call this worker. Add your production domain(s) here
// once deployed (e.g. "https://morning-scroll.pages.dev").
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "https://localhost",
  "https://morningscroll.app",
]);

function isLocalNetwork(origin) {
  if (!origin) return false;
  return /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/.test(origin);
}

// Reflected back on responses. The actual security gate is isAllowedOrigin()
// below — these headers just unblock the browser for legitimate callers.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // native apps (Capacitor) may omit Origin
  return ALLOWED_ORIGINS.has(origin) || isLocalNetwork(origin);
}

const JOURNAL_PROMPT_INSTRUCTIONS = `Generate one morning journal prompt. One sentence, no explanation.

The question should be light, playful, and genuinely fun to answer — but it should quietly move the reader's attention away from what they have, what they need to do, and who they think they are, and toward what they notice, what they imagine, and what they already are. It should feel like a question a slightly unusual friend texts you at 7am.

The question should be immediately understood — no setup, no scenario the reader has to construct before they can start answering. The reward is in the answering, not in figuring out what's being asked. The best prompts either give the reader a pleasant glimpse of themselves they don't normally get, or briefly transport them somewhere their daily routine doesn't take them.

Rotate freely between: a question about something tiny they noticed or felt recently, a question that makes their identity or routine feel lighter than usual, a sense memory that takes them somewhere specific, a question about what they'd keep or let go of, a question about a place or moment that stuck with them.

What makes a bad prompt:
- Multi-part questions. Never ask two things at once. No "and what would you call it."
- Invention prompts. "Invent a new flavor / design a house / create a holiday" require effort with no emotional payoff. The reader is building something for no one.
- Wacky mashups. Combining two random things ("your favorite childhood cartoon + ice cream") feels like a party game, not a moment of quiet recognition.
- Anything that requires creativity as the point. The reader should be remembering, noticing, or choosing — not performing.

What makes a good prompt:
- "What's a place in your house where you feel slightly different than you do in the rest of it?"
- "What's something you believed was extremely important five years ago that you now never think about?"
- "What's a meal you ate years ago that you still think about?"

The difference: good prompts ask the reader to look inward at something already there. Bad prompts ask them to build something new.

Rules:
- No politics, no news, no self-improvement language
- No prompts about death, loss, or hardship
- No spiritual vocabulary — no "gratitude," "mindfulness," "presence," "inner self"
- No puzzles — nothing that requires building a scenario before answering
- One sentence only
- Should be answerable in one or two sentences
- Should make the reader smile slightly before they answer
- Do not wrap the prompt in quotation marks`;

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
    if (path === "/api/videos")         return handleVideosFeed(request, env, ctx);

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
        system: JOURNAL_PROMPT_INSTRUCTIONS + recentSection,
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

// ── YOUTUBE VIDEO FEED ───────────────────────────────────
// Default channels — used as fallback when KV config is empty.
// To update channels without redeploying, PUT JSON to KV key "video_channels".
const DEFAULT_VIDEO_CHANNELS = {
  animals: [
    { channelId: "UCINb0wqPz-A0dV9nARjJlOQ", name: "The Dodo" },
    { channelId: "UCwmZiChSryoWQCZMIQezgTg", name: "BBC Earth" },
    { channelId: "UCPIvT-zcQl2H0vabdXJGcpg", name: "The Pet Collective" },
    { channelId: "UCDPk9MG2RexnOMGTD-YnSnA", name: "Nat Geo Animals" },
    { channelId: "UCkEBDbzLyH-LbB2FgMoSMaQ", name: "Animal Planet" },
    { channelId: "UC7_VH_kj0aD9vhuHmFheUYQ", name: "GeoBeats Animals" },
  ],
  sports: [
    { channelId: "UCWJ2lWNubArHWmf3FIHbfcQ", name: "NBA" },
    { channelId: "UCG5qGWdu8nIRZqJ_GgDwQ-w", name: "Premier League" },
    { channelId: "UCblfuW_4rakIf2h6aqANefA", name: "Red Bull" },
    { channelId: "UC9-OpMMVoNP5o10_Iyq7Ndw", name: "Bleacher Report" },
    { channelId: "UCqQo7ewe87aYAe7ub5UqXMw", name: "House of Highlights" },
    { channelId: "UCET00YnetHT7tOpu12v8jxg", name: "CBS Sports Golazo" },
    { channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", name: "NFL" },
    { channelId: "UCoLrcjPV5PbUrUyXq5mjc_A", name: "MLB" },
    { channelId: "UChgDp_uE5PVqnpdV05xKOOA", name: "Chaz NBA" },
    { channelId: "UCWQXiB9DidR74rOPeupt8nQ", name: "Made the Cut" },
    { channelId: "UCl9E4Zxa8CVr2LBLD0_TaNg", name: "Jomboy Media" },
    { channelId: "UCGYYNGmyhZ_kwBF_lqqXdAQ", name: "Tifo Football" },
    { channelId: "UCZ7wY7MRDSygp63HIEfdQZA", name: "Sky Sports Football" },
  ],
  food: [
    { channelId: "UCJFp8uSYCjXOMnkUyb3CQ3Q", name: "Tasty" },
    { channelId: "UCcAd5Np7fO8SeejB1FVKcYw", name: "Best Ever Food Review Show" },
    { channelId: "UC8Y-jrV8oR3s2Ix4viDkZtA", name: "Food Network" },
    { channelId: "UCRzPUBhXUZHclB7B5bURFXw", name: "Eater" },
    { channelId: "UCaLfMkkHhSA_LaCta0BzyhQ", name: "Munchies" },
    { channelId: "UCJHA_jMfCvEnv-3kRjTCQXw", name: "Babish Culinary Universe" },
    { channelId: "UCbpMy0Fg74eXXkvxJrtEn3w", name: "Bon Appétit" },
    { channelId: "UClfLmmxQVEX8SauwFlfPpog", name: "Big Nibbles" },
  ],
  art: [
    { channelId: "UCmQThz1OLYt8mb2PU540LOA", name: "The Art Assignment" },
    { channelId: "UCePDFpCr78_qmVtpoB1Axaw", name: "Great Art Explained" },
    { channelId: "UCJkMlOu7faDgqh4PfzbpLdg", name: "Nerdwriter1" },
    { channelId: "UCXD5-f9urX1Foas68AL_HHQ", name: "DW Arts" },
    { channelId: "UC0k238zFx-Z8xFH0sxCrPJg", name: "Architectural Digest" },
    { channelId: "UCDsElQQt_gCZ9LgnW-7v-cQ", name: "Kirsten Dirksen" },
    { channelId: "UCJv7eTNf6v1M0g6cGE3v8lw", name: "H88" },
    { channelId: "UCN8V_pO0xOFKLL4XG1tshnw", name: "Perspective" },
    { channelId: "UCyFZMEnm1il5Wv3a6tPscbA", name: "Genius" },
    { channelId: "UC4eYXhJI4-7wSWc8UNRwD4A", name: "NPR Music" },
    { channelId: "UCXkNod_JcH7PleOjwK_8rYQ", name: "Polyphonic" },
  ],
  nature: [
    { channelId: "UCpVm7bg6pXKo1Pr6k5kxG9A", name: "National Geographic" },
    { channelId: "UCbwC3_kqAafyOG69S6JmoVg", name: "Explore.org" },
    { channelId: "UCnavGPxEijftXneFxk28srA", name: "Earth Touch" },
    { channelId: "UCwtsR2eW0MIjEnmEG2ImTzw", name: "Our Planet" },
    { channelId: "UCDDMpdWv1mGdx3ABJBgvidw", name: "Leaf of Life" },
    { channelId: "UCbq-4OJxnziD3awH-aTezeA", name: "Real Wild" },
    { channelId: "UCgb_TbreMgfDdLKkr4yYJHw", name: "Andrew Millison" },
  ],
};

// Load channel config from KV (if set), otherwise use hardcoded defaults.
async function getVideoChannels(env) {
  try {
    const kvConfig = await env.FEED_CACHE.get("video_channels");
    if (kvConfig) return JSON.parse(kvConfig);
  } catch {}
  return DEFAULT_VIDEO_CHANNELS;
}

const VIDEOS_CACHE_KEY = "videos_feed";
const VIDEOS_CACHE_TTL = 86400; // 24 hours
const VIDEOS_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours — refresh if older
const ETAGS_KEY = "videos_etags"; // ETag cache for 304 optimization

// ── YouTube Data API v3 — Sync Engine ────────────────────
// Uses activities.list (1 unit) instead of search.list (100 units).
// ETag optimization: stores ETags per channel, sends If-None-Match to get
// free 304 responses when no new content exists.
const YT_API = "https://www.googleapis.com/youtube/v3";

// Load stored ETags from KV.
async function getETags(env) {
  try {
    const raw = await env.FEED_CACHE.get(ETAGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

// Persist ETags to KV.
async function saveETags(env, etags) {
  await env.FEED_CACHE.put(ETAGS_KEY, JSON.stringify(etags), { expirationTtl: VIDEOS_CACHE_TTL });
}

// Fetch recent uploads for a single channel via activities.list.
// Cost: 1 quota unit per call, or 0 units if ETag returns 304.
async function fetchChannelVideos(channelId, channelName, apiKey, etag) {
  try {
    const headers = {};
    if (etag) headers["If-None-Match"] = etag;

    const res = await fetch(
      `${YT_API}/activities?part=snippet,contentDetails&channelId=${channelId}&maxResults=8&key=${apiKey}`,
      { headers }
    );

    // 304 Not Modified — no new content, 0 quota cost
    if (res.status === 304) {
      return { videos: null, etag }; // null = use cached data
    }

    if (!res.ok) {
      console.error(`API error for ${channelName}: ${res.status}`);
      return { videos: [], etag: null };
    }

    const newEtag = res.headers.get("ETag") || null;
    const data = await res.json();
    if (!data.items) return { videos: [], etag: newEtag };

    const now = Date.now();
    const videos = [];

    for (const item of data.items) {
      // Only include "upload" activities
      if (item.snippet.type !== "upload") continue;

      const videoId = item.contentDetails?.upload?.videoId;
      if (!videoId) continue;

      const s = item.snippet;
      videos.push({
        video_id: videoId,
        title: s.title,
        thumbnail: s.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        channel: channelName,
        published_at: s.publishedAt,
        fetched_at: new Date(now).toISOString(),
        embed_url: `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`,
        is_short: false, // resolved below via videos.list
      });
    }

    return { videos, etag: newEtag };
  } catch (err) {
    console.error(`API fetch failed for ${channelName}:`, err.message);
    return { videos: [], etag: null };
  }
}

// Detect Shorts via videos.list (duration <= 60s).
// Cost: 1 quota unit per call, each call handles up to 50 video IDs.
async function markShorts(videos, apiKey) {
  if (!videos.length) return;
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50);
    const ids = batch.map(v => v.video_id).join(",");
    try {
      const res = await fetch(
        `${YT_API}/videos?part=contentDetails&id=${ids}&key=${apiKey}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const durations = {};
      for (const item of (data.items || [])) {
        durations[item.id] = item.contentDetails.duration;
      }
      for (const v of batch) {
        const dur = durations[v.video_id];
        if (dur) {
          const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (match) {
            const secs = (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
            v.is_short = secs <= 60;
          }
        }
      }
    } catch {}
  }
}

// Purge videos older than 24 hours (compliance: no archiving YouTube data).
function purgeStaleVideos(feed) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const category of Object.keys(feed)) {
    if (category === "cached_at") continue;
    feed[category] = (feed[category] || []).filter(v => {
      const fetchedAt = new Date(v.fetched_at || v.published_at).getTime();
      return fetchedAt > cutoff;
    });
  }
  return feed;
}

// Fetch all curated channels via YouTube Data API v3.
// Quota cost per refresh:
//   - 45 channels × 1 unit (activities.list) = 45 units max
//   - Channels with ETag 304 = 0 units (free!)
//   - ~1-2 units for videos.list (shorts detection)
//   - At 6 refreshes/day ≈ 270 units/day worst case (well within 10,000)
async function fetchVideosFeed(env) {
  const channels = await getVideoChannels(env);
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY secret not set");

  const etags = await getETags(env);
  const newEtags = { ...etags };

  // Load existing cached feed for 304 merging
  let existingFeed = {};
  try {
    const cached = await env.FEED_CACHE.get(VIDEOS_CACHE_KEY);
    if (cached) existingFeed = JSON.parse(cached);
  } catch {}

  const feed = {};

  for (const [category, chList] of Object.entries(channels)) {
    const results = await Promise.all(
      chList.map(ch => {
        const etagKey = ch.channelId;
        return fetchChannelVideos(ch.channelId, ch.name, apiKey, etags[etagKey])
          .then(r => {
            if (r.etag) newEtags[etagKey] = r.etag;
            return { channelId: ch.channelId, ...r };
          });
      })
    );

    const categoryVideos = [];
    for (const r of results) {
      if (r.videos === null) {
        // 304 — merge existing cached videos for this channel
        const existing = (existingFeed[category] || []).filter(v => v.channel === r.channelId || true);
        categoryVideos.push(...(existingFeed[category] || []).filter(v => {
          // Match by channel name (since we don't store channelId in video objects)
          const chEntry = chList.find(c => c.channelId === r.channelId);
          return chEntry && v.channel === chEntry.name;
        }));
      } else {
        categoryVideos.push(...r.videos);
      }
    }

    // Detect shorts in bulk for new videos only
    const newVideos = categoryVideos.filter(v => v.is_short === false && v.fetched_at);
    await markShorts(newVideos, apiKey);

    categoryVideos.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    feed[category] = categoryVideos;
  }

  await saveETags(env, newEtags);

  const result = { ...feed, cached_at: new Date().toISOString() };
  return purgeStaleVideos(result);
}

// Called by cron trigger (every 4 hours) — the ONLY thing that writes to KV.
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

// Lock to prevent multiple simultaneous seed/refresh calls from burning quota.
let refreshInFlight = false;

// Serves /api/videos — reads from KV, self-heals if cache is stale.
// Cron is the primary refresh mechanism; this is the fallback.
async function handleVideosFeed(request, env, ctx) {
  try {
    const cached = await env.FEED_CACHE.get(VIDEOS_CACHE_KEY);
    if (cached) {
      // Check if cache is stale — if so, refresh in the background (once)
      try {
        const parsed = JSON.parse(cached);
        const age = Date.now() - new Date(parsed.cached_at).getTime();
        if (age > VIDEOS_STALE_MS && !refreshInFlight) {
          refreshInFlight = true;
          const refresh = refreshVideosFeed(env).finally(() => { refreshInFlight = false; });
          if (ctx?.waitUntil) ctx.waitUntil(refresh);
        }
      } catch {}
      return new Response(cached, {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "public, max-age=14400", "X-Cache": "HIT" },
      });
    }

    // KV empty (first deploy only) — seed it once, guard against stampede
    if (refreshInFlight) {
      return json({ error: "Feed is initializing, please retry in 30 seconds" }, 503);
    }
    refreshInFlight = true;
    try {
      const feed = await fetchVideosFeed(env);
      const body = JSON.stringify(feed);
      await env.FEED_CACHE.put(VIDEOS_CACHE_KEY, body, { expirationTtl: VIDEOS_CACHE_TTL });
      return new Response(body, {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "public, max-age=14400", "X-Cache": "SEED" },
      });
    } finally {
      refreshInFlight = false;
    }
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
