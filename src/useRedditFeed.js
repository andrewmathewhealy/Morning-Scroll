// ── useRedditFeed hook ─────────────────────────────────────
// Fetches posts for a given set of subreddits and manages
// loading / error state. Re-fetches when the subreddit list changes.

import { useState, useEffect, useRef } from "react";
import { fetchMultipleSubreddits } from "./redditApi.js";

/**
 * @param {string[]} subreddits  - Array of subreddit names to fetch
 * @param {number}   limitPerSub - Posts per subreddit (default 6)
 * @param {string}   sort        - Reddit sort: "hot" | "new" | "top" (default "hot")
 */
export function useRedditFeed(subreddits, limitPerSub = 6, sort = "hot", retryKey = 0) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!subreddits || subreddits.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError(null);

    fetchMultipleSubreddits(subreddits, limitPerSub, sort)
      .then((fetched) => {
        if (!abortRef.current) {
          setPosts(fetched);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!abortRef.current) {
          setError(err.message ?? "Failed to load posts");
          setLoading(false);
        }
      });

    return () => { abortRef.current = true; };
  }, [subreddits.join(","), limitPerSub, sort, retryKey]); // eslint-disable-line

  return { posts, loading, error };
}
