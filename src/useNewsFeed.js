import { useState, useEffect, useRef } from "react";
import { fetchNewsSources } from "./newsApi.js";

export function useNewsFeed(sourceNames, retryKey = 0) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!sourceNames || sourceNames.length === 0) {
      setArticles([]);
      setLoading(false);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError(null);
    setArticles([]); // clear stale articles immediately before new fetch

    fetchNewsSources(sourceNames)
      .then((fetched) => {
        if (!abortRef.current) {
          // Sort by recency
          fetched.sort((a, b) => b.publishedAt - a.publishedAt);
          setArticles(fetched);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!abortRef.current) {
          setError(err.message ?? "Failed to load news");
          setLoading(false);
        }
      });

    return () => { abortRef.current = true; };
  }, [sourceNames.join(","), retryKey]); // eslint-disable-line

  return { articles, loading, error };
}
