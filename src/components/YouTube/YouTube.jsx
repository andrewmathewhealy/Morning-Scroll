import { useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { db } from "../../firebase.js";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../hooks/useAuth.js";
import { Icon } from "../../icons/Icon.jsx";
import { WORKER_URL } from "../../config.js";
import { useLiveTime, formatTimeAgo } from "../../hooks/useLiveTime.js";
import ErrorBoundary from "../ErrorBoundary.jsx";

// ── YOUTUBE HOOKS & COMPONENTS ────────────────────────────
function useYouTubeChannels(user) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    if (!user) { setChannels([]); setLoading(false); return; }
    try {
      // Get user's followed channel IDs
      const userSnap = await getDocs(collection(db, `users/${user.uid}/youtubeChannels`));
      const followedIds = userSnap.docs.map(d => d.id);

      if (!followedIds.length) { setChannels([]); setLoading(false); return; }

      // Fetch shared channel metadata
      const channelData = await Promise.all(
        followedIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "channels", id));
            return snap.exists() ? { id, ...snap.data() } : null;
          } catch { return null; }
        })
      );
      setChannels(channelData.filter(Boolean));
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const addChannel = useCallback(async (searchQuery) => {
    if (!user) throw new Error("Not signed in");

    // Step 1: Try to find in shared collection first (search by name for URL/handle inputs)
    // For direct channel IDs, check shared collection directly
    let channelId = null;
    let channelData = null;

    // Check if input looks like a channel ID
    const idMatch = searchQuery.match(/UC[\w-]{22}/);
    if (idMatch) {
      const existing = await getDoc(doc(db, "channels", idMatch[0]));
      if (existing.exists()) {
        channelData = existing.data();
        channelId = idMatch[0];
      }
    }

    // Step 2: If not found in shared collection, call YouTube API
    if (!channelData) {
      const res = await fetch(`${WORKER_URL}/youtube/channel?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      channelId = data.channelId;

      // Check if another user already added this channel
      const existing = await getDoc(doc(db, "channels", channelId));
      if (existing.exists()) {
        channelData = existing.data();
      } else {
        // Brand new channel — store in shared collection
        channelData = {
          channelId,
          name: data.name,
          avatar: data.avatar,
          addedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "channels", channelId), channelData);
      }
    }

    // Step 3: Link user to this channel (lightweight doc, just the ID)
    await setDoc(doc(db, `users/${user.uid}/youtubeChannels`, channelId), {
      channelId,
      addedAt: new Date().toISOString(),
    });

    await loadChannels();
    return channelData;
  }, [user, loadChannels]);

  const removeChannel = useCallback(async (channelId) => {
    if (!user) return;
    const { deleteDoc: delDoc } = await import("firebase/firestore");
    await delDoc(doc(db, `users/${user.uid}/youtubeChannels`, channelId));
    await loadChannels();
  }, [user, loadChannels]);

  return { channels, loading, addChannel, removeChannel, reload: loadChannels };
}

function useYouTubeVideos(channels) {
  const [videos, setVideos] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channels.length) { setVideos({}); setLoading(false); return; }
    const ids = channels.map(c => c.channelId).join(",");
    const cacheKey = `yt-rss-v1-${ids}`;
    const now = Date.now();

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && (now - cached.ts) < 30 * 60 * 1000) {
        setVideos(cached.data);
        setLoading(false);
        return;
      }
    } catch {}

    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/youtube?channels=${ids}`);
        const data = await res.json();
        if (data.channels) {
          localStorage.setItem(cacheKey, JSON.stringify({ ts: now, data: data.channels }));
          setVideos(data.channels);
        }
      } catch {}
      setLoading(false);
    })();
  }, [channels]);

  return { videos, loading };
}

function useYouTubeReadState(user) {
  const [readIds, setReadIds] = useState(new Set());
  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/settings`, "youtubeRead"));
        if (snap.exists()) setReadIds(new Set(snap.data().videoIds || []));
      } catch {}
    })();
  }, [user]);

  const markRead = useCallback(async (videoId) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
    if (!user) return;
    try {
      const updated = [...readIdsRef.current, videoId];
      await setDoc(doc(db, `users/${user.uid}/settings`, "youtubeRead"), { videoIds: updated.slice(-200) });
    } catch {}
  }, [user]);

  return { readIds, markRead };
}

const YouTubeCard = memo(function YouTubeCard({ channel, video, isNew, onTap }) {
  useLiveTime();
  const ago = video.published
    ? formatTimeAgo(Math.floor(new Date(video.published).getTime() / 1000))
    : "";

  return (
    <div className="yt-card" onClick={onTap}>
      <div className="yt-card-inner">
        <div className="yt-thumb-wrap">
          <img src={video.thumbnail} alt="" className="yt-thumb" loading="lazy" />
          <div className="yt-play-icon"><Icon.Play size={28} /></div>
        </div>
        <div className="yt-card-info">
          <div className="yt-channel-row">
            {channel.avatar && <img src={channel.avatar} alt="" className="yt-avatar" />}
            <span className="yt-channel-name">{channel.name}</span>
            {isNew && <span className="yt-new-badge">New</span>}
          </div>
          <div className="yt-video-title">{video.title}</div>
          {ago && <div className="yt-time">{ago}</div>}
        </div>
      </div>
    </div>
  );
});

function YouTubePlayer({ video, channel, onClose }) {
  const [closing, setClosing] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("journal-open");
    return () => document.body.classList.remove("journal-open");
  }, []);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, 500);
  };

  const handleTouchStart = (e) => { dragRef.current = { startY: e.touches[0].clientY, dragging: true }; };
  const handleTouchMove = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const handleTouchEnd = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    dragRef.current.dragging = false;
    sheetRef.current.style.transform = "";
    if (dy > 80) dismiss();
  };

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  return createPortal(
    <>
      <div className={`yt-player-overlay ${closing ? "closing" : ""}`} onClick={dismiss} />
      <div className={`yt-player-sheet ${closing ? "closing" : ""}`} ref={sheetRef}>
        <div className="yt-player-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <iframe
          className="yt-player-video"
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={video.title}
        />
        <div className="yt-player-info">
          <div className="yt-player-title">{video.title}</div>
          <div className="yt-player-channel">
            {channel.avatar && <img src={channel.avatar} alt="" />}
            <span className="yt-player-channel-name">{channel.name}</span>
          </div>
          <div className="yt-player-open-yt" onClick={() => window.open(`https://www.youtube.com/watch?v=${video.videoId}`, "_blank")}>
            <Icon.YouTube size={12} /> Open in YouTube
          </div>
        </div>
      </div>
    </>,
    phoneEl
  );
}

function YouTubeFeedSection({ user }) {
  const { channels } = useYouTubeChannels(user);
  const { videos, loading } = useYouTubeVideos(channels);
  const { readIds, markRead } = useYouTubeReadState(user);
  const [playing, setPlaying] = useState(null); // { channel, video }

  if (!user || !channels.length) return null;

  // Build list: one card per channel (latest video), split into new vs seen
  const items = channels
    .map(ch => {
      const vids = videos[ch.channelId] || [];
      const latest = vids[0];
      if (!latest) return null;
      return { channel: ch, video: latest, isNew: !readIds.has(latest.videoId) };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return new Date(b.video.published) - new Date(a.video.published);
    });

  if (loading && !items.length) return (
    <div style={{ padding: "0 20px" }}>
      <div className="yt-section-header">
        <Icon.YouTube size={14} />
        <div className="yt-section-label">YouTube</div>
      </div>
      <div className="skeleton-card widget-shimmer" style={{ height: 80, margin: "0 0 10px", borderRadius: 20 }} />
    </div>
  );

  if (!items.length) return null;

  return (
    <div>
      <div className="yt-section-header">
        <Icon.YouTube size={14} />
        <div className="yt-section-label">YouTube</div>
      </div>
      {items.map(({ channel, video, isNew }) => (
        <ErrorBoundary key={video.videoId} label="YouTubeCard" fallback={null}>
          <YouTubeCard
            channel={channel}
            video={video}
            isNew={isNew}
            onTap={() => {
              markRead(video.videoId);
              setPlaying({ channel, video });
            }}
          />
        </ErrorBoundary>
      ))}
      {playing && (
        <YouTubePlayer
          video={playing.video}
          channel={playing.channel}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}

function YouTubeSettingsSection({ user }) {
  const { channels, addChannel, removeChannel } = useYouTubeChannels(user);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  const handleAdd = async () => {
    if (!input.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      await addChannel(input.trim());
      setInput("");
    } catch (e) {
      setErr(e.message);
    }
    setAdding(false);
  };

  return (
    <>
      <span className="section-label fade-up fade-up-5">YouTube Channels</span>
      <div className="yt-add-wrap fade-up fade-up-5">
        <div className="yt-add-row">
          <input
            className="yt-add-input"
            placeholder="Channel name, URL, or @handle"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <button className="yt-add-btn" onClick={handleAdd} disabled={adding || !input.trim()}>
            {adding ? "..." : "Add"}
          </button>
        </div>
        {err && <div className="yt-add-err">{err}</div>}
      </div>
      {channels.length > 0 && (
        <div className="yt-channel-list fade-up fade-up-5">
          {channels.map(ch => (
            <div className="yt-channel-item" key={ch.channelId}>
              {ch.avatar && <img src={ch.avatar} alt="" className="yt-channel-item-avatar" />}
              <div className="yt-channel-item-name">{ch.name}</div>
              <button className="yt-channel-remove" onClick={() => removeChannel(ch.channelId)}>
                <Icon.X size={16} color="rgba(8,16,32,0.3)" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export { YouTubeFeedSection, YouTubeSettingsSection };
