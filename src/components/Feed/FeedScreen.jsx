import { useState, useEffect, useRef, useCallback } from "react";
import { WORKER_URL } from "../../config.js";
import { Icon } from "../../icons/Icon.jsx";
import { formatTimeAgo } from "../../hooks/useLiveTime.js";

// ── FEED SKELETON ─────────────────────────────────────────
function FeedSkeleton() {
  return (
    <>
      {/* Hero skeleton */}
      <div className="skeleton-card spring-in spring-in-1">
        <div className="skeleton skeleton-img" style={{ height: 220 }} />
        <div className="skeleton-body">
          <div className="skeleton skeleton-line" style={{ width: "35%", height: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: "95%", height: 16 }} />
          <div className="skeleton skeleton-line" style={{ width: "80%", height: 16 }} />
          <div className="skeleton skeleton-line" style={{ width: "45%", height: 10 }} />
        </div>
      </div>
      {/* Small card skeletons with stagger */}
      {[0,1,2,3,4].map(i => (
        <div key={i} className={`feed-card-small spring-in spring-in-${Math.min(i+2,6)}`}
          style={{ margin: "10px 20px 0", padding: "12px 14px", gap: 12, alignItems: "center" }}>
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton skeleton-line" style={{ width: "38%", height: 9 }} />
            <div className="skeleton skeleton-line" style={{ width: "88%", height: 13 }} />
            <div className="skeleton skeleton-line" style={{ width: "52%", height: 9 }} />
          </div>
        </div>
      ))}
    </>
  );
}

// ── VIDEO PLAYER ──────────────────────────────────────────
// ── GLOBAL MUTE STATE ─────────────────────────────────────
// Shared across all VideoPlayer instances — unmuting one unmutes all
let globalMuted = true;
const muteListeners = new Set();
function setGlobalMuted(val) {
  globalMuted = val;
  muteListeners.forEach(fn => fn(val));
}

function VideoPlayer({ video, poster, autoplay = false, fullscreen = false, startTime = 0, onTimeUpdate = null, paused: forcePaused = false }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const [muted, setMuted] = useState(globalMuted);
  const [started, setStarted] = useState(false);
  const [hlsReady, setHlsReady] = useState(false);

  // Subscribe to global mute state changes
  useEffect(() => {
    const handler = (val) => {
      setMuted(val);
      if (videoRef.current) videoRef.current.muted = val;
    };
    muteListeners.add(handler);
    return () => muteListeners.delete(handler);
  }, []);

  // Set up HLS or plain video source
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const hlsUrl = video.hlsUrl;

    if (hlsUrl && window.Hls && window.Hls.isSupported()) {
      // Use hls.js for DASH/HLS streams (merges video + audio streams)
      const hls = new window.Hls({ enableWorker: false, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(v);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => setHlsReady(true));
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          // HLS failed — fall back to plain MP4 (no audio but at least plays)
          hls.destroy();
          v.src = video.url;
          setHlsReady(true);
        }
      });
    } else if (hlsUrl && v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari supports HLS natively
      v.src = hlsUrl;
      setHlsReady(true);
    } else {
      // Fallback: plain MP4 (no separate audio track)
      v.src = video.url;
      setHlsReady(true);
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [video.url, video.hlsUrl]);

  // Track forcePaused in a ref so the IntersectionObserver closure can read it
  const forcePausedRef = useRef(forcePaused);
  forcePausedRef.current = forcePaused;

  // Autoplay via IntersectionObserver — plays when >50% visible, pauses when not
  useEffect(() => {
    if (!autoplay) return;
    const v = videoRef.current;
    const container = containerRef.current;
    if (!v || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (forcePausedRef.current) return; // don't autoplay while reader is open
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          v.muted = globalMuted;
          v.play().then(() => setStarted(true)).catch(() => {});
        } else {
          v.pause();
          setStarted(false);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [autoplay, hlsReady]);

  // Seek to startTime on first play (for seamless feed → reader transition)
  const seekedRef = useRef(false);
  useEffect(() => {
    if (!startTime || seekedRef.current) return;
    const v = videoRef.current;
    if (!v || !hlsReady) return;
    const doSeek = () => {
      if (!seekedRef.current && v.duration) {
        v.currentTime = Math.min(startTime, v.duration);
        seekedRef.current = true;
      }
    };
    // Try immediately, or wait for loadedmetadata
    if (v.duration) doSeek();
    else v.addEventListener('loadedmetadata', doSeek, { once: true });
    return () => v.removeEventListener('loadedmetadata', doSeek);
  }, [startTime, hlsReady]);

  // Report current playback time to parent
  useEffect(() => {
    if (!onTimeUpdate) return;
    const v = videoRef.current;
    if (!v) return;
    const handler = () => onTimeUpdate(v.currentTime);
    v.addEventListener('timeupdate', handler);
    return () => v.removeEventListener('timeupdate', handler);
  }, [onTimeUpdate]);

  // Force pause when parent signals (e.g. reader sheet opened over this feed video)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (forcePaused) {
      v.pause();
      setStarted(false);
    }
  }, [forcePaused]);

  const toggleMute = (e) => {
    e.stopPropagation();
    const newMuted = !globalMuted;
    setGlobalMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
  };

  const handleClick = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setStarted(true); }
    else { v.pause(); setStarted(false); }
  };

  return (
    <div ref={containerRef} className="video-wrap" style={{ position: "relative", background: "#000", cursor: "pointer", minHeight: fullscreen ? 520 : undefined }} onClick={handleClick}>
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        loop
        muted={muted}
        style={{ width: "100%", display: "block", maxHeight: fullscreen ? "none" : 380, minHeight: fullscreen ? 520 : undefined, objectFit: fullscreen ? "contain" : "contain", background: "#000" }}
      />
      {/* Play overlay — shown before video starts */}
      {!started && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.35)",
        }}>
          {poster && <img src={poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="video-play-btn"><div className="video-play-triangle" /></div>
            {video.duration > 0 && (
              <div style={{ background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, backdropFilter: "blur(4px)" }}>
                {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Mute/unmute button */}
      {video.hasAudio && started && (
        <button
          onClick={toggleMute}
          style={{
            position: "absolute", bottom: 10, right: 10,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
            border: "none", borderRadius: 20, padding: "6px 12px",
            display: "flex", alignItems: "center", gap: 6,
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {muted
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          }
          {muted ? "Unmute" : "Mute"}
        </button>
      )}
      {/* First-time unmute hint — shown on first autoplay */}
      {video.hasAudio && started && muted && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          borderRadius: 20, padding: "5px 14px",
          fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 600,
          pointerEvents: "none", whiteSpace: "nowrap",
          animation: "fadeOut 3s ease forwards 2s",
        }}>
          🔇 Tap to unmute
        </div>
      )}
      {/* Silent badge for GIFs */}
      {!video.hasAudio && started && (
        <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.5)", borderRadius: 12, padding: "3px 8px", fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
          GIF
        </div>
      )}
    </div>
  );
}

// ── VIDEO FEED ───────────────────────────────────────────
function useVideoFeed() {
  const [state, setState] = useState({ loading: true, feed: null, error: null });
  useEffect(() => {
    const cacheKey = "videos_feed_v2";
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Use cache if less than 1 hour old AND has actual videos
        const hasVideos = Object.values(parsed).some(v => Array.isArray(v) && v.length > 0);
        if (hasVideos && parsed.cached_at && Date.now() - new Date(parsed.cached_at).getTime() < 3600000) {
          setState({ loading: false, feed: parsed, error: null });
          return;
        }
      } catch {}
    }
    fetch(`${WORKER_URL}/api/videos`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(feed => {
        localStorage.setItem(cacheKey, JSON.stringify(feed));
        setState({ loading: false, feed, error: null });
      })
      .catch(err => setState({ loading: false, feed: null, error: err.message }));
  }, []);
  return state;
}

const FEED_TABS = ["animals", "nature", "sports", "food", "art"];
const FEED_TAB_LABELS = {
  animals: "Animals",
  nature: "Nature",
  sports: "Sports",
  food: "Food",
  art: "Art",
};
const FEED_TAB_COLORS = {
  animals: { normal: "#F0A8A0", bold: "#D8706A" },
  nature:  { normal: "#F2C4A8", bold: "#D89878" },
  sports:  { normal: "#B8DDE8", bold: "#78BCD0" },
  food:    { normal: "#D898AC", bold: "#C06A88" },
  art:     { normal: "#C8B8D8", bold: "#A088C0" },
};

// Load YouTube IFrame API once globally
let ytApiReady = false;
let ytApiCallbacks = [];
function ensureYTApi() {
  if (ytApiReady) return Promise.resolve();
  if (window.YT && window.YT.Player) { ytApiReady = true; return Promise.resolve(); }
  return new Promise(resolve => {
    ytApiCallbacks.push(resolve);
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        ytApiReady = true;
        ytApiCallbacks.forEach(cb => cb());
        ytApiCallbacks = [];
      };
    }
  });
}

// Tracks which video card is mostly visible in the scroll area
function useVisibleIndex(listRef, count) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  useEffect(() => {
    const container = listRef.current;
    if (!container || count === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const idx = Number(entry.target.dataset.idx);
            if (!isNaN(idx)) setVisibleIndex(idx);
          }
        }
      },
      { root: null, threshold: 0.5 }
    );
    const cards = container.querySelectorAll("[data-idx]");
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [listRef, count]);
  return visibleIndex;
}

function VideoCard({ video, isVisible, unlocked, onUnlock }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState(false);
  const isShort = video.is_short;

  // Mark ready once unlocked (iframe handles its own playback)
  useEffect(() => {
    if (unlocked && !created) {
      setCreated(true);
      setReady(true);
    }
  }, [unlocked]);

  return (
    <div className={`vfeed-card-v ${isShort ? "vfeed-card-short" : "vfeed-card-long"}`} onClick={() => !unlocked && onUnlock()}>
      <div className={`vfeed-thumb-wrap ${isShort ? "vfeed-thumb-short" : "vfeed-thumb-long"}`}>
        <img className="vfeed-thumb" src={video.thumbnail} alt="" />
        {!unlocked && (
          <div className="vfeed-play">
            <Icon.Play size={isShort ? 24 : 32} color="#fff" />
          </div>
        )}
        {unlocked && (
          <iframe
            className="vfeed-yt-container"
            src={`https://www.youtube.com/embed/${video.video_id}?playsinline=1&rel=0`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            frameBorder="0"
          />
        )}
        {isShort && (
          <div className="vfeed-short-badge">SHORT</div>
        )}
      </div>
      <div className="vfeed-info">
        <div className="vfeed-title">{video.title}</div>
        <div className="vfeed-meta">
          <span className="vfeed-channel">{video.channel}</span>
          <span className="vfeed-dot">·</span>
          <span className="vfeed-time">{formatTimeAgo(Math.floor(new Date(video.published_at).getTime() / 1000))}</span>
        </div>
      </div>
    </div>
  );
}

const INITIAL_LOAD = 7;
const LOAD_MORE = 7;

function FeedScreen() {
  const { loading, feed, error } = useVideoFeed();
  const [activeTab, setActiveTab] = useState("animals");
  const [unlocked, setUnlocked] = useState(false);
  const [showCount, setShowCount] = useState(INITIAL_LOAD);
  const listRef = useRef(null);
  const sentinelRef = useRef(null);

  const videos = feed?.[activeTab] || [];
  const displayedVideos = videos.slice(0, showCount);
  const hasMore = showCount < videos.length;
  const visibleIndex = useVisibleIndex(listRef, displayedVideos.length);

  // Reset count when switching tabs
  useEffect(() => { setShowCount(INITIAL_LOAD); }, [activeTab]);

  // Infinite scroll — load more when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShowCount(c => c + LOAD_MORE); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, showCount]);

  return (
    <div className="community-bg">
      <div className="community-header fade-up fade-up-1">
        <div className="community-title">Your Feed</div>
        <div className="community-subtitle">Curated videos from around the internet</div>
      </div>

      {/* Category tabs */}
      <div className="vfeed-tabs">
        {FEED_TABS.map(tab => (
          <button
            key={tab}
            className={`vfeed-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {FEED_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Vertical video list */}
      <div className="vfeed-list" ref={listRef}>
        {loading && (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="widget-shimmer" style={{
              height: 200, borderRadius: 16, marginBottom: 12,
              background: "rgba(12,26,53,0.06)",
            }} />
          ))
        )}

        {error && (
          <div style={{ padding: "20px 0", fontSize: 13, color: "rgba(12,26,53,0.5)", textAlign: "center" }}>
            Unable to load videos right now.
          </div>
        )}

        {!loading && !error && videos.length === 0 && (
          <div style={{ padding: "40px 0", fontSize: 13, color: "rgba(12,26,53,0.45)", textAlign: "center" }}>
            No videos yet for {FEED_TAB_LABELS[activeTab]}.
          </div>
        )}

        {displayedVideos.map((v, i) => (
          <div key={v.video_id} data-idx={i}>
            <VideoCard video={v} isVisible={i === visibleIndex} unlocked={unlocked} onUnlock={() => setUnlocked(true)} />
          </div>
        ))}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      </div>
    </div>
  );
}

export default FeedScreen;
