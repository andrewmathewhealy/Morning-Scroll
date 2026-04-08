import { useEffect, useState } from "react";

// Re-renders any subscribed component every `intervalMs` so that relative
// timestamps (e.g. "2m ago") update in place without a full refetch.
// The returned value is just the current `Date.now()` — consumers don't
// actually need it, they just need the render tick.
export function useLiveTime(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Human-readable relative time. Keep in sync with the similar helper used
// for comment timestamps (src/App.jsx).
export function formatTimeAgo(utcSeconds) {
  if (!utcSeconds) return "";
  const diff = Math.floor(Date.now() / 1000 - utcSeconds);
  if (diff < 60)       return "just now";
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000)  return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}
