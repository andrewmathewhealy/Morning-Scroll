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

    if (path === "/news") return handleNews(request, env, url);
    if (path === "/weather") return handleWeather(request, env, url);
    if (path === "/word-of-the-day") return handleWordOfTheDay(request, env);
    if (path === "/sports") return handleSports(request, env, url);
    if (path === "/wikipedia") return handleWikipedia(request, env);

    return json({ error: "Not found" }, 404);
  },
};

async function handleNews(request, env, url) {
  try {
    const apiKey = env.NEWS_API_KEY;
    if (!apiKey) return json({ error: "NEWS_API_KEY not configured" }, 500);

    const sources  = url.searchParams.get("sources") ?? "";
    const pageSize = url.searchParams.get("pageSize") ?? "40";

    if (!sources) return json({ error: "sources param required" }, 400);

    const upstream = new URL("https://newsapi.org/v2/top-headlines");
    upstream.searchParams.set("sources",  sources);
    upstream.searchParams.set("pageSize", pageSize);
    upstream.searchParams.set("apiKey",   apiKey);

    const response = await fetch(upstream.toString(), {
      headers: {
        "User-Agent": "MorningScroll/1.0",
      },
    });
    const body = await response.json();
    return json(body, response.status);
  } catch (err) {
    return json({ error: "Worker exception", detail: err.message }, 500);
  }
}

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

// --- Word of the Day (Wordnik) ---
// In-memory cache: refreshes once per calendar day
let wotdCache = { date: null, data: null };

const MOCK_WOTD = {
  word: "ineffable",
  publishDate: new Date().toISOString().slice(0, 10),
  definitions: [
    {
      text: "Incapable of being expressed in words; unspeakable.",
      partOfSpeech: "adjective",
      source: "wordnik",
    },
    {
      text: "Not to be uttered; taboo.",
      partOfSpeech: "adjective",
      source: "wordnik",
    },
  ],
  examples: [
    {
      text: "The sunset over the canyon was an ineffable experience that no photograph could capture.",
    },
  ],
  note: "From Latin ineffābilis: in- (not) + effābilis (utterable).",
  pronunciations: [
    { raw: "ɪnˈɛfəbəl", rawType: "IPA" },
  ],
};

async function handleWordOfTheDay(request, env) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Return cached response if we already fetched today's word
    if (wotdCache.date === today && wotdCache.data) {
      return json(wotdCache.data);
    }

    const apiKey = env.WORDNIK_API_KEY;

    // No API key yet — return mock
    if (!apiKey) {
      wotdCache = { date: today, data: MOCK_WOTD };
      return json(MOCK_WOTD);
    }

    // Real Wordnik fetch
    const upstream = new URL("https://api.wordnik.com/v4/words.json/wordOfTheDay");
    upstream.searchParams.set("api_key", apiKey);

    const response = await fetch(upstream.toString(), {
      headers: { "User-Agent": "MorningScroll/1.0" },
      cf: { cacheTtl: 86400 },           // Cloudflare edge cache 24h
    });
    const body = await response.json();

    wotdCache = { date: today, data: body };
    return json(body, response.status);
  } catch (err) {
    // If live fetch fails, fall back to mock so the widget still renders
    return json(MOCK_WOTD);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
