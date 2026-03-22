// ── NEWS API SERVICE ──────────────────────────────────────
// Calls go through the Cloudflare Worker proxy — no API key in the bundle.
// During local dev, the Worker runs at localhost:8787 via `wrangler dev`.
// In production, replace WORKER_URL with your deployed worker URL, e.g.:
//   https://morning-scroll-api.<your-subdomain>.workers.dev
//
// To switch environments, change this one constant:
const WORKER_URL =
  import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";

const BASE = `${WORKER_URL}/news`;
const cache = {};
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── SOURCE REGISTRY ───────────────────────────────────────
// display name → { id: NewsAPI source ID, color, category }
// Reuters was removed from NewsAPI in 2024 (licensing ended).
export const NEWS_SOURCES = {
  // ── GENERAL / WORLD ──────────────────────────────────────
  "BBC News":             { id: "bbc-news",                  color: "#BB1919", category: "General" },
  "Associated Press":     { id: "associated-press",          color: "#CC0000", category: "General" },
  "New York Times":       { id: "the-new-york-times",        color: "#000000", category: "General" },
  "The Guardian":         { id: "the-guardian-uk",           color: "#052962", category: "General" },
  "Al Jazeera":           { id: "al-jazeera-english",        color: "#C8102E", category: "General" },
  "NPR":                  { id: "npr",                       color: "#4A90D9", category: "General" },
  "CBS News":             { id: "cbs-news",                  color: "#003087", category: "General" },
  "ABC News":             { id: "abc-news",                  color: "#00558F", category: "General" },
  "NBC News":             { id: "nbc-news",                  color: "#F37021", category: "General" },
  "CNN":                  { id: "cnn",                       color: "#CC0000", category: "General" },
  "Fox News":             { id: "fox-news",                  color: "#003366", category: "General" },
  "Time":                 { id: "time",                      color: "#E00",    category: "General" },
  "Newsweek":             { id: "newsweek",                  color: "#E2001A", category: "General" },
  "The Hill":             { id: "the-hill",                  color: "#1A1A2E", category: "General" },
  "Axios":                { id: "axios",                     color: "#FF4136", category: "General" },
  "Politico":             { id: "politico",                  color: "#1A1A1A", category: "General" },

  // ── SCIENCE & TECHNOLOGY ─────────────────────────────────
  "Wired":                { id: "wired",                     color: "#000000", category: "Technology" },
  "The Verge":            { id: "the-verge",                 color: "#FA4B2A", category: "Technology" },
  "Ars Technica":         { id: "ars-technica",              color: "#FF6600", category: "Technology" },
  "TechCrunch":           { id: "techcrunch",                color: "#0A9D58", category: "Technology" },
  "Hacker News":          { id: "hacker-news",               color: "#FF6600", category: "Technology" },
  "New Scientist":        { id: "new-scientist",             color: "#004F9E", category: "Science"    },
  "National Geographic":  { id: "national-geographic",       color: "#FFCC00", category: "Science"    },

  // ── BUSINESS & FINANCE ────────────────────────────────────
  "Bloomberg":            { id: "bloomberg",                 color: "#1B1B1B", category: "Business"   },
  "Financial Times":      { id: "financial-times",           color: "#FCD0A1", category: "Business"   },
  "The Wall Street Journal": { id: "the-wall-street-journal",color: "#004276", category: "Business"   },
  "Business Insider":     { id: "business-insider",          color: "#1675BA", category: "Business"   },
  "Forbes":               { id: "forbes",                    color: "#000000", category: "Business"   },
  "Fortune":              { id: "fortune",                   color: "#C8102E", category: "Business"   },

  // ── SPORTS ───────────────────────────────────────────────
  "ESPN":                 { id: "espn",                      color: "#D50032", category: "Sports"     },
  "NFL News":             { id: "nfl-news",                  color: "#013369", category: "Sports"     },
  "NHL News":             { id: "nhl-news",                  color: "#000000", category: "Sports"     },
  "Fox Sports":           { id: "fox-sports",                color: "#003366", category: "Sports"     },

  // ── ENTERTAINMENT ─────────────────────────────────────────
  "Entertainment Weekly": { id: "entertainment-weekly",      color: "#C8102E", category: "Entertainment" },
  "IGN":                  { id: "ign",                       color: "#E3000F", category: "Entertainment" },

  // ── HEALTH ───────────────────────────────────────────────
  "Medical News Today":   { id: "medical-news-today",        color: "#0073AA", category: "Health"     },
  "Healthline":           { id: "healthline",                color: "#007B5E", category: "Health"     },
};

export const NEWS_SOURCE_CATEGORIES = {
  "General":       Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "General").map(([k]) => k),
  "Technology":    Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Technology").map(([k]) => k),
  "Science":       Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Science").map(([k]) => k),
  "Business":      Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Business").map(([k]) => k),
  "Sports":        Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Sports").map(([k]) => k),
  "Entertainment": Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Entertainment").map(([k]) => k),
  "Health":        Object.entries(NEWS_SOURCES).filter(([,v]) => v.category === "Health").map(([k]) => k),
};

export const ALL_NEWS_SOURCE_NAMES = Object.keys(NEWS_SOURCES);

// ── FETCH ─────────────────────────────────────────────────

export async function fetchNewsSources(sourceNames) {
  const sourceIds = sourceNames
    .map(n => NEWS_SOURCES[n]?.id)
    .filter(Boolean);

  if (!sourceIds.length) return getMockArticles(sourceNames);

  const cacheKey = [...sourceNames].sort().join(",");
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.articles;

  // NewsAPI max 20 sources per request — batch if needed
  const batches = chunkArray(sourceIds, 20);
  const allArticles = [];

  for (const batch of batches) {
    // apiKey is NOT sent — the Worker injects it server-side
    const url = `${BASE}?sources=${batch.join(",")}&pageSize=40`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status !== "ok") continue;
      const articles = (data.articles ?? [])
        .filter(a => a.title && a.title !== "[Removed]")
        .map(a => normalizeArticle(a));
      allArticles.push(...articles);
    } catch (e) {
      console.warn("[newsApi] batch failed:", e.message);
    }
  }

  // Sort by recency
  allArticles.sort((a, b) => b.publishedAt - a.publishedAt);

  // If Worker wasn't reachable, fall back to mock data so the feed isn't blank
  if (!allArticles.length) return getMockArticles(sourceNames);

  cache[cacheKey] = { articles: allArticles, fetchedAt: Date.now() };
  return allArticles;
}

// ── NORMALIZER ────────────────────────────────────────────

function normalizeArticle(raw) {
  const sourceName = Object.entries(NEWS_SOURCES).find(
    ([, v]) => v.id === raw.source?.id
  )?.[0] ?? raw.source?.name ?? "News";

  return {
    id: (() => {
      // Simple hash that uses the full URL so every article gets a unique ID
      const str = raw.url ?? raw.title ?? String(Math.random());
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
      }
      return `news_${Math.abs(hash).toString(36)}`;
    })(),
    sourceType: "news",
    sourceName,
    sourceId: raw.source?.id ?? "unknown",
    title: decodeHtmlEntities(raw.title ?? ""),
    summary: decodeHtmlEntities(raw.description ?? ""),
    url: raw.url ?? "#",
    image: raw.urlToImage ?? null,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).getTime() / 1000 : Date.now() / 1000,
    ageLabel: timeAgo(raw.publishedAt ? new Date(raw.publishedAt).getTime() / 1000 : Date.now() / 1000),
    section: null,
    subreddit: null,
    category: "News",
    score: null, scoreLabel: null,
    commentCount: null, commentLabel: null,
    permalink: raw.url ?? "#",
  };
}

// ── MOCK DATA ─────────────────────────────────────────────

const MOCK_STORIES = [
  { source: "BBC News",         title: "Renewable Energy Surpasses Fossil Fuels in UK for First Time",    description: "Wind and solar generated more electricity than gas and coal combined last quarter." },
  { source: "The Guardian",     title: "The Quiet Revolution in Urban Farming",                            description: "Rooftop gardens and vertical farms are reshaping how cities think about food." },
  { source: "New York Times",   title: "Scientists Uncover Ancient Forest Beneath Antarctic Ice",          description: "Researchers discover evidence of a lush forest that thrived 90 million years ago." },
  { source: "Associated Press", title: "New Study Links Green Spaces to Reduced Anxiety in Cities",       description: "Researchers followed 10,000 urban residents over five years." },
  { source: "Al Jazeera",       title: "Record Number of Species Return From Brink of Extinction",        description: "Conservation efforts show measurable results in landmark biodiversity report." },
  { source: "NPR",              title: "How Libraries Became Community Anchors Again",                    description: "Across the US, libraries are evolving into social hubs for all ages." },
  { source: "Wired",            title: "The Quiet AI Revolution Happening in Your Local Hospital",        description: "Diagnostic tools powered by machine learning are changing patient outcomes." },
  { source: "ESPN",             title: "Underdog Team Pulls Off Stunning Comeback in Championship Final", description: "In one of the most dramatic finishes in recent memory, the underdogs prevailed." },
];

function getMockArticles(sourceNames) {
  const sourceSet = new Set(sourceNames);
  const now = Date.now() / 1000;
  return MOCK_STORIES
    .filter(s => sourceSet.has(s.source))
    .map((s, i) => ({
      id: `mock_${i}`,
      sourceType: "news",
      sourceName: s.source,
      sourceId: NEWS_SOURCES[s.source]?.id ?? "mock",
      title: s.title,
      summary: s.description,
      url: "#",
      image: null,
      publishedAt: now - i * 1800,
      ageLabel: timeAgo(now - i * 1800),
      section: null,
      subreddit: null, category: "News",
      score: null, scoreLabel: null,
      commentCount: null, commentLabel: null,
      permalink: "#",
    }));
}

// ── HELPERS ───────────────────────────────────────────────

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function timeAgo(utcSeconds) {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export function clearNewsCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}
