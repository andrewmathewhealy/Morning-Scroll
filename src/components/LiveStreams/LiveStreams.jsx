import { useState, useEffect, useMemo } from "react";
import { WORKER_URL } from "../../config.js";

// Curated always-on YouTube live streams. Swap videoIds if any go offline.
const LIVE_STREAM_CATEGORIES = {
  Space: [
    { id: "iss",    title: "ISS Outside View", location: "Low Earth Orbit", videoId: "0FBiyFpV__g" },
    { id: "aurora", title: "Northern Lights",  location: "Iceland",         videoId: "ccTVAhJU5lg" },
  ],
  Cities: [
    { id: "nyc-aerial",  title: "NYC Aerial",      location: "New York, USA",     videoId: "2_PDaUJbfuI" },
    { id: "venice-beach", title: "Venice Beach",   location: "California, USA",   videoId: "EO_1LWqsCNE" },
    { id: "dublin",      title: "Dublin",          location: "Dublin, Ireland",   videoId: "3nyPER2kzqk" },
    { id: "western-wall", title: "Western Wall",   location: "Jerusalem",         videoId: "77akujLn4k8" },
  ],
  Nature: [
    { id: "eagle",   title: "Bald Eagle Nest",   location: "Big Bear, California", videoId: "B4-L2nfGcuE" },
    { id: "reef",    title: "Coral Reef",        location: "Tropical Aquarium",    videoId: "DHUnz4dyb54" },
    { id: "africam", title: "African Watering Hole", location: "Nkorho Bush Lodge", videoId: "gdrNUUf-cQw" },
    { id: "namib",   title: "Namib Desert",      location: "Namibia",              videoId: "ydYDqZQpim8" },
    { id: "birds",   title: "Bird Feeder Cam",   location: "Recke, Germany",       videoId: "x10vL6_47Dw" },
  ],
};

const LIVE_CAT_COLORS = { Space: "#8ECAE6", Cities: "#219EBC", Nature: "#7A9E52" };

function useLiveStatus(allStreams) {
  const [status, setStatus] = useState(null); // null = loading, {} = checked
  useEffect(() => {
    const ids = allStreams.map(s => s.videoId).join(",");
    const cacheKey = "live-status-v1";
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && cached.ids === ids && Date.now() - cached.ts < 5 * 60 * 1000) {
        setStatus(cached.data);
        return;
      }
    } catch {}
    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/youtube/live-status?ids=${ids}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setStatus(data.status);
        try { localStorage.setItem(cacheKey, JSON.stringify({ ids, ts: Date.now(), data: data.status })); } catch {}
      } catch {
        // On failure, show everything (fail-open)
        const fallback = {};
        allStreams.forEach(s => { fallback[s.videoId] = { live: true }; });
        setStatus(fallback);
      }
    })();
  }, []); // eslint-disable-line
  return status;
}

function LiveStreamPlayer({ stream, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#0C1A35",
        display: "flex", flexDirection: "column",
        animation: "globeOverlayIn 0.3s ease-out both",
      }}
    >
      {/* Video — fills top portion */}
      <div style={{ position: "relative", width: "100%", flex: "0 0 55vh" }}>
        <iframe
          src={`https://www.youtube.com/embed/${stream.videoId}?autoplay=1&mute=1&playsinline=1`}
          title={stream.title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            width: "100%", height: "100%",
            border: 0, background: "#000",
          }}
        />
      </div>

      {/* Stream info — below video */}
      <div style={{
        flex: 1, padding: "24px 22px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
          background: "rgba(253,242,232,0.1)", backdropFilter: "blur(8px)",
          padding: "3px 10px", borderRadius: 6,
          fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: "#FDF2E8",
        }}>
          <span className="live-badge-dot" />
          LIVE
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#FDF2E8", lineHeight: 1.2 }}>{stream.title}</div>
        <div style={{ fontSize: 13, color: "rgba(253,242,232,0.6)" }}>{stream.location}</div>
      </div>

      {/* Close button — top-right floating */}
      <button onClick={onClose} style={{
        position: "absolute", top: 14, right: 14, zIndex: 2,
        background: "rgba(2,48,71,0.7)", backdropFilter: "blur(8px)",
        border: "1.5px solid rgba(253,242,232,0.15)",
        color: "#FDF2E8", fontSize: 12, fontWeight: 600, padding: "8px 16px",
        borderRadius: 12, cursor: "pointer",
      }}>Close</button>
    </div>
  );
}

function LiveStreamCard({ stream, onOpen }) {
  return (
    <div
      onClick={() => onOpen(stream)}
      style={{
        position: "relative", flex: "0 0 220px", borderRadius: 20, overflow: "hidden", cursor: "pointer",
        aspectRatio: "16/9", background: "#0a1a24",
        border: "1.5px solid rgba(253,242,232,0.15)",
        boxShadow: "0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06)",
        scrollSnapAlign: "start",
      }}
    >
      <img
        src={`https://i.ytimg.com/vi/${stream.videoId}/mqdefault.jpg`}
        alt={stream.title}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onError={e => { e.target.style.display = "none"; }}
      />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(2,48,71,0.9) 0%, rgba(2,48,71,0.3) 45%, transparent 100%)",
      }} />
      <div style={{
        position: "absolute", top: 8, left: 8,
        display: "flex", alignItems: "center", gap: 4,
        background: "rgba(2,48,71,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        color: "#FDF2E8",
        fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
        padding: "2px 7px", borderRadius: 4,
      }}>
        <span className="live-badge-dot" />
        LIVE
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 10, color: "#FDF2E8" }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{stream.title}</div>
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{stream.location}</div>
      </div>
    </div>
  );
}

export { LIVE_STREAM_CATEGORIES, useLiveStatus, LiveStreamCard, LiveStreamPlayer, LIVE_CAT_COLORS };
