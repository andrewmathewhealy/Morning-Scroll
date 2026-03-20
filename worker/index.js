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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
