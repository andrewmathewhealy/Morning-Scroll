const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/weather") return handleWeather(request, env, url);
    if (path === "/sports") return handleSports(request, env, url);
    if (path === "/wikipedia") return handleWikipedia(request, env);
    if (path === "/journal-prompt") return handleJournalPrompt(request, env);
    if (path === "/youtube") return handleYouTube(request, env, url);
    if (path === "/youtube/channel") return handleYouTubeChannel(request, env, url);
    if (path === "/youtube/live-status") return handleYouTubeLiveStatus(request, env, url);

    return json({ error: "Not found" }, 404);
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

// In-memory cache: keyed by "{league}:{type}:{date}", TTL 10 min
let sportsCache = {};
const SPORTS_CACHE_TTL = 10 * 60 * 1000;

function getSportsCacheKey(league, type, date) {
  return `${league}:${type}:${date || "none"}`;
}

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

    const now = Date.now();
    const fetches = [];

    for (const league of requestedLeagues) {
      const leagueId = LEAGUES[league];

      for (const type of types) {
        const cacheKey = getSportsCacheKey(league, type, date);
        const cached = sportsCache[cacheKey];
        if (cached && (now - cached.ts) < SPORTS_CACHE_TTL) {
          fetches.push(Promise.resolve({ league, type, data: cached.data }));
          continue;
        }

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
            .then(body => {
              const events = body.events || [];
              sportsCache[cacheKey] = { ts: Date.now(), data: events };
              return { league, type, data: events };
            })
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
let wikiCache = { date: null, data: null };

async function handleWikipedia(request, env) {
  try {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const today = `${month}-${day}`;

    // Return cached if we already curated today
    if (wikiCache.date === today && wikiCache.data) {
      return json(wikiCache.data);
    }

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
      wikiCache = { date: today, data: fallback };
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

    wikiCache = { date: today, data: event };
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
let journalCache = { date: null, data: null };

async function handleJournalPrompt(request, env) {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

    // Return cached if already generated today
    if (journalCache.date === today && journalCache.data) {
      return json(journalCache.data);
    }

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
      const fallback = {
        date: today,
        prompt: "What's one small thing you're looking forward to today?",
      };
      journalCache = { date: today, data: fallback };
      return json(fallback);
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
        system: `You generate short, simple morning journal prompts for a feel-good daily digest app. STRICT RULES: One single sentence. Maximum 15 words. Plain language — no flowery metaphors, no compound questions, no "and" joining two ideas. The prompt must be answerable in one or two sentences by the user. Focus on small, concrete things: a moment, a person, a feeling, something today. Be seasonally aware based on the date. Vary the style: question, gentle invitation, or simple noticing. Respond with ONLY the prompt text, nothing else.${recentSection}`,
        messages: [
          { role: "user", content: `Generate a morning journal prompt for ${dateLabel}.` },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const prompt = (aiData.content?.[0]?.text || "").trim();

    if (!prompt) {
      const fallback = { date: today, prompt: "What's one small thing you're looking forward to today?" };
      journalCache = { date: today, data: fallback };
      return json(fallback);
    }

    const result = { date: today, prompt };
    journalCache = { date: today, data: result };
    return json(result);
  } catch (err) {
    return json({
      date: new Date().toISOString().slice(0, 10),
      prompt: "What's one small thing you're looking forward to today?",
    });
  }
}

// --- YouTube RSS + Channel Lookup ---
const ytRssCache = {}; // { channelId: { ts, videos } }
const YT_RSS_TTL = 3 * 60 * 60 * 1000; // 3 hours

async function handleYouTube(request, env, url) {
  try {
    const channelIds = url.searchParams.get("channels");
    if (!channelIds) return json({ error: "channels param required" }, 400);

    const ids = channelIds.split(",").filter(Boolean);
    const now = Date.now();
    const results = {};

    await Promise.all(ids.map(async (id) => {
      // Check cache
      const cached = ytRssCache[id];
      if (cached && (now - cached.ts) < YT_RSS_TTL) {
        results[id] = cached.videos;
        return;
      }

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

        ytRssCache[id] = { ts: now, videos };
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

// Check which video IDs are currently live. Cached 5 minutes.
let liveStatusCache = { ts: 0, key: "", data: null };
const LIVE_STATUS_TTL = 5 * 60 * 1000;

async function handleYouTubeLiveStatus(request, env, url) {
  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) return json({ error: "YOUTUBE_API_KEY not configured" }, 500);

    const idsParam = url.searchParams.get("ids");
    if (!idsParam) return json({ error: "ids param required" }, 400);

    const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
    const cacheKey = ids.slice().sort().join(",");
    const now = Date.now();
    if (liveStatusCache.key === cacheKey && (now - liveStatusCache.ts) < LIVE_STATUS_TTL) {
      return json(liveStatusCache.data);
    }

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

    const result = { status };
    liveStatusCache = { ts: now, key: cacheKey, data: result };
    return json(result);
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
