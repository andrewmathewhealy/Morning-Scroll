// ── REDDIT API SERVICE ────────────────────────────────────
// Uses Reddit's public JSON API — no authentication required
// for public subreddits. Appends .json to any subreddit URL.
//
// Rate limits: Reddit allows ~60 requests/min unauthenticated.
// We cache results in memory per subreddit to avoid hammering
// the API on re-renders or tab switches.

import { SUBREDDIT_TO_CATEGORY } from "./subreddits.js";

const BASE = "https://www.reddit.com";

/**
 * Strips URLs, image/gif links, markdown links, and Reddit
 * formatting artifacts from user-generated text before display.
 */
export function cleanRedditText(text) {
  if (!text) return "";
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/www\.\S+/g, "")
    .replace(/\S+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|mp4|mov)(\?\S*)?/gi, "")
    .replace(/>!.*?!</g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 1)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// In-memory cache: { [subreddit]: { posts, fetchedAt } }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch top posts from a single subreddit.
 * Returns an array of normalized post objects.
 */
export async function fetchSubreddit(subreddit, limit = 10, sort = "hot") {
  // sort can be "hot", "top&t=day", "top&t=week", "new", etc.
  const sortBase = sort.split("&")[0];
  const sortParams = sort.includes("&") ? "&" + sort.split("&").slice(1).join("&") : "";
  const key = `${subreddit}:${sort}`;
  const cached = cache[key];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.posts;
  }

  const url = `${BASE}/r/${subreddit}/${sortBase}.json?limit=${limit}&raw_json=1${sortParams}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) throw new Error(`Reddit fetch failed for r/${subreddit}: ${res.status}`);

  const json = await res.json();
  const posts = (json.data?.children ?? [])
    .map((child) => normalizePost(child.data, subreddit))
    .filter(Boolean);

  cache[key] = { posts, fetchedAt: Date.now() };
  return posts;
}

/**
 * Fetch posts from multiple subreddits concurrently.
 * Returns a flat array merged by score — no shuffle, so hot/top posts surface first.
 * Failed subreddits are silently skipped.
 */
export async function fetchMultipleSubreddits(subreddits, limitPerSub = 5, sort = "hot") {
  const results = await Promise.allSettled(
    subreddits.map((sub) => fetchSubreddit(sub, limitPerSub, sort))
  );

  const posts = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Sort by a hot-score: blends upvotes with recency so fresh viral posts
  // surface above old high-score posts, but a highly-upvoted post beats
  // something brand-new with 3 votes.
  return rankByHotScore(posts);
}

/**
 * Wilson score-inspired hot ranking identical to Reddit's own algorithm.
 * Gives a strong signal to high-upvote posts while decaying older ones.
 */
function rankByHotScore(posts) {
  const epoch = new Date("2006-01-01").getTime() / 1000; // Reddit's own epoch
  return [...posts].sort((a, b) => hotScore(b, epoch) - hotScore(a, epoch));
}

function hotScore(post, epoch) {
  const score = Math.max(post.score, 1);
  const order = Math.log10(score);
  const sign = post.score > 0 ? 1 : post.score < 0 ? -1 : 0;
  const seconds = (post.createdUtc ?? 0) - epoch;
  return sign * order + seconds / 45000;
}

/**
 * Normalize a raw Reddit post object into our app's shape.
 */
function normalizePost(raw, subreddit) {
  if (!raw || raw.stickied) return null; // skip pinned mod posts

  const image = extractImage(raw);
  const video = extractVideo(raw);

  return {
    id: raw.id,
    subreddit: raw.subreddit || subreddit,
    category: SUBREDDIT_TO_CATEGORY[(raw.subreddit || subreddit).toLowerCase()] ?? "General",
    title: decodeHtmlEntities(raw.title ?? ""),
    score: raw.score ?? 0,
    scoreLabel: formatScore(raw.score ?? 0),
    commentCount: raw.num_comments ?? 0,
    commentLabel: formatScore(raw.num_comments ?? 0),
    permalink: `https://www.reddit.com${raw.permalink}`,
    createdUtc: raw.created_utc,
    ageLabel: timeAgo(raw.created_utc),
    image,
    video,                       // { url, width, height, hasAudio } or null
    isVideo: !!video,
    isSelf: raw.is_self ?? false,
    selfText: raw.selftext ? cleanRedditText(raw.selftext).slice(0, 280) : "",
    author: raw.author,
    flair: raw.link_flair_text ?? null,
  };
}

/** Pull the best available image from a Reddit post */
function extractImage(raw) {
  // For video posts, grab the preview/thumbnail — don't treat as image post
  if (raw.is_video) {
    const src = raw.preview?.images?.[0]?.source;
    if (src?.url) return decodeHtmlEntities(src.url);
    const previews = raw.preview?.images?.[0]?.resolutions;
    if (previews?.length) return decodeHtmlEntities(previews[previews.length - 1].url);
    return null;
  }

  // 1. i.redd.it direct image URL (always full resolution, no HTML encoding issues)
  if (raw.url && raw.url.includes("i.redd.it")) {
    return raw.url;
  }

  // 2. url_overridden_by_dest — the actual resolved image URL for link posts
  if (raw.url_overridden_by_dest && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(raw.url_overridden_by_dest)) {
    return raw.url_overridden_by_dest;
  }

  // 3. Full-resolution source from preview (Reddit-hosted, high quality)
  const src = raw.preview?.images?.[0]?.source;
  if (src?.url && src.width >= 300) return decodeHtmlEntities(src.url);

  // 4. Gallery posts — grab the first image's full-res URL
  if (raw.media_metadata) {
    const first = Object.values(raw.media_metadata)[0];
    if (first?.s?.u) return decodeHtmlEntities(first.s.u);
    if (first?.s?.gif) return decodeHtmlEntities(first.s.gif);
  }

  // 5. Largest preview resolution
  const previews = raw.preview?.images?.[0]?.resolutions;
  if (previews?.length) {
    return decodeHtmlEntities(previews[previews.length - 1].url);
  }

  // 6. Direct post URL if it's an image
  if (raw.url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(raw.url)) {
    return raw.url;
  }

  // 7. Thumbnail last resort
  if (
    raw.thumbnail &&
    raw.thumbnail !== "self" &&
    raw.thumbnail !== "default" &&
    raw.thumbnail !== "nsfw" &&
    raw.thumbnail !== "spoiler" &&
    raw.thumbnail.startsWith("http")
  ) {
    return raw.thumbnail;
  }

  return null;
}

/** Extract Reddit-hosted video info */
function extractVideo(raw) {
  // Native Reddit video
  const rv = raw.media?.reddit_video;
  if (rv?.fallback_url) {
    return {
      url: rv.fallback_url.replace(/\?.*$/, ""), // strip query params
      hlsUrl: rv.hls_url ?? null,
      width: rv.width ?? 0,
      height: rv.height ?? 0,
      duration: rv.duration ?? 0,
      hasAudio: !rv.is_gif,
    };
  }

  // Gifv / MP4 link posts (e.g. imgur)
  if (raw.url && /\.(gifv|mp4)(\?|$)/i.test(raw.url)) {
    return {
      url: raw.url.replace(/\.gifv$/, ".mp4"),
      hlsUrl: null,
      width: 0,
      height: 0,
      duration: 0,
      hasAudio: false,
    };
  }

  return null;
}

// ── HELPERS ───────────────────────────────────────────────

function formatScore(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(utcSeconds) {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Invalidate the cache for one or all subreddits */
export function clearCache(subreddit = null) {
  if (subreddit) {
    Object.keys(cache).forEach((k) => { if (k.startsWith(subreddit + ":")) delete cache[k]; });
  } else {
    Object.keys(cache).forEach((k) => delete cache[k]);
  }
}
