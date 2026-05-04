import { useState, useEffect, useRef, useMemo, lazy, Suspense, Component } from "react";
const PulseMap = lazy(() => import("./components/PulseMap/PulseMap.jsx"));
import "./styles/app.css";
import "./styles/wordle.css";
import { Icon } from "./icons/Icon.jsx";
import { useGyroscope } from "./hooks/useGyroscope.js";
import { useCountUp } from "./hooks/useCountUp.js";
import { useColorTemp } from "./hooks/useColorTemp.js";
import { useAuth } from "./hooks/useAuth.js";
import { useRadioPlayer } from "./hooks/useRadioPlayer.js";

// ── Extracted components ──
import { WeatherWidget, MoonWidget, useWeather } from "./components/Weather/Weather.jsx";
import JournalWidget from "./components/Journal/JournalWidget.jsx";
import WordleGame from "./components/Wordle/WordleGame.jsx";
import PollCard from "./components/Poll/PollCard.jsx";
import ArtOfTheDayCard from "./components/ArtOfTheDay/ArtOfTheDayCard.jsx";
import OnThisDayWidget from "./components/OnThisDay/OnThisDayWidget.jsx";
import ScoresSection from "./components/Sports/ScoresSection.jsx";
import FeedScreen from "./components/Feed/FeedScreen.jsx";
import { YouTubeFeedSection, YouTubeSettingsSection } from "./components/YouTube/YouTube.jsx";
import { LIVE_STREAM_CATEGORIES, LIVE_CAT_COLORS, useLiveStatus, LiveStreamCard, LiveStreamPlayer } from "./components/LiveStreams/LiveStreams.jsx";
import MorningGame, { GameOverlay, OneLine, Stack, Ripples } from "./components/MorningGame/MorningGame.jsx";
import MindScreen from "./components/Mind/MindScreen.jsx";

// ── ERROR BOUNDARY ────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: 20, borderRadius: 16,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "rgba(253,242,232,0.55)",
          fontSize: 12, textAlign: "center",
        }}>
          Something went sideways here. Try again later.
        </div>
      );
    }
    return this.props.children;
  }
}

// ── COUNT-UP DISPLAY ──────────────────────────────────────
function CountUp({ value, duration = 900 }) {
  const display = useCountUp(value, duration);
  return <span className="count-up">{display}</span>;
}

// ── AMBIENT PARTICLES ─────────────────────────────────────
function AmbientParticles() {
  const particles = useMemo(() => {
    const warmColors = [
      { bg: 'rgba(251,232,211,0.35)', glow: 'rgba(251,232,211,0.2)' },
      { bg: 'rgba(228,189,88,0.25)',  glow: 'rgba(228,189,88,0.15)' },
      { bg: 'rgba(251,232,211,0.3)',  glow: 'rgba(251,232,211,0.18)' },
      { bg: 'rgba(240,208,128,0.28)', glow: 'rgba(240,208,128,0.15)' },
      { bg: 'rgba(228,189,88,0.22)',  glow: 'rgba(228,189,88,0.12)' },
    ];
    return Array.from({ length: 18 }, (_, i) => {
      const c = warmColors[i % warmColors.length];
      return {
        id: i,
        x: Math.random() * 100,
        size: 3 + Math.random() * 2,
        delay: Math.random() * 10,
        duration: 14 + Math.random() * 10,
        opacity: 0.2 + Math.random() * 0.25,
        bg: c.bg,
        glow: c.glow,
        drift: (Math.random() - 0.5) * 50,
      };
    });
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      <style>{`
        @keyframes floatUpZigzag {
          0%   { transform: translateY(0px) translateX(0px); opacity: 0; }
          5%   { opacity: var(--p-op); }
          15%  { transform: translateY(-120px) translateX(var(--p-z1)); }
          30%  { transform: translateY(-240px) translateX(var(--p-z2)); }
          45%  { transform: translateY(-360px) translateX(var(--p-z3)); }
          60%  { transform: translateY(-480px) translateX(var(--p-z4)); }
          75%  { transform: translateY(-600px) translateX(var(--p-z5)); }
          88%  { opacity: var(--p-op); }
          100% { transform: translateY(-780px) translateX(var(--p-z6)); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`,
          bottom: -10,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.bg,
          boxShadow: `0 0 ${p.size + 2}px ${p.size}px ${p.glow}`,
          '--p-op': p.opacity,
          '--p-z1': `${p.drift * 0.3}px`,
          '--p-z2': `${p.drift * -0.5}px`,
          '--p-z3': `${p.drift * 0.7}px`,
          '--p-z4': `${p.drift * -0.4}px`,
          '--p-z5': `${p.drift * 0.6}px`,
          '--p-z6': `${p.drift * -0.2}px`,
          animation: `floatUpZigzag ${p.duration}s ${p.delay}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

// ── HOME ATMOSPHERE (clouds, stars, vignette, shooting stars) ──
function HomeAtmosphere() {
  const [shootingStar, setShootingStar] = useState(null);

  useEffect(() => {
    let timeout;
    function fire() {
      const startX = 10 + Math.random() * 40;
      const startY = 2 + Math.random() * 15;
      const angle = 25 + Math.random() * 20;
      const duration = 0.6 + Math.random() * 0.4;
      setShootingStar({ startX, startY, angle, duration, key: Date.now() });
      timeout = setTimeout(() => setShootingStar(null), duration * 1000 + 200);
      timeout = setTimeout(fire, 15000 + Math.random() * 5000);
    }
    timeout = setTimeout(fire, 3000 + Math.random() * 5000);
    return () => clearTimeout(timeout);
  }, []);

  const stars = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i, x: 5 + Math.random() * 90, y: 2 + Math.random() * 28,
    size: 1 + Math.random() * 1.5, delay: Math.random() * 4, duration: 2 + Math.random() * 3,
  })), []);

  const clouds = useMemo(() => [
    { id: 0, side: 'left',  top: '8%',  width: 180, opacity: 0.08, delay: 0,   duration: 50 },
    { id: 1, side: 'right', top: '14%', width: 220, opacity: 0.06, delay: 3,   duration: 60 },
    { id: 2, side: 'left',  top: '22%', width: 150, opacity: 0.07, delay: 8,   duration: 45 },
    { id: 3, side: 'right', top: '5%',  width: 200, opacity: 0.05, delay: 12,  duration: 55 },
    { id: 4, side: 'left',  top: '30%', width: 160, opacity: 0.06, delay: 5,   duration: 48 },
  ], []);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.7; } }
        @keyframes cloudDriftLeft { 0% { transform: translateX(-110%); opacity: 0; } 10% { opacity: var(--c-op); } 90% { opacity: var(--c-op); } 100% { transform: translateX(110vw); opacity: 0; } }
        @keyframes cloudDriftRight { 0% { transform: translateX(110vw); opacity: 0; } 10% { opacity: var(--c-op); } 90% { opacity: var(--c-op); } 100% { transform: translateX(-110%); opacity: 0; } }
        @keyframes shootAcross { 0% { transform: translate(0, 0) rotate(var(--ss-angle)); opacity: 0; } 5% { opacity: 1; } 80% { opacity: 0.8; } 100% { transform: translate(200px, 120px) rotate(var(--ss-angle)); opacity: 0; } }
      `}</style>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size, borderRadius: '50%',
          background: 'rgba(250,230,210,0.85)', boxShadow: '0 0 3px rgba(250,230,210,0.4)',
          animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
        }} />
      ))}
      {clouds.map(c => (
        <div key={c.id} style={{
          position: 'absolute', top: c.top, [c.side]: 0,
          width: c.width, height: c.width * 0.35, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 40%, transparent 70%)',
          filter: 'blur(12px)', '--c-op': c.opacity,
          animation: `cloudDrift${c.side === 'left' ? 'Left' : 'Right'} ${c.duration}s ${c.delay}s linear infinite`,
        }} />
      ))}
      {shootingStar && (
        <div key={shootingStar.key} style={{
          position: 'absolute', left: `${shootingStar.startX}%`, top: `${shootingStar.startY}%`,
          width: 40, height: 1.5, borderRadius: 1,
          background: 'linear-gradient(to right, transparent, rgba(250,222,210,0.9), rgba(255,255,255,0.95))',
          boxShadow: '0 0 6px 1px rgba(240,184,138,0.5)',
          '--ss-angle': `${shootingStar.angle}deg`,
          animation: `shootAcross ${shootingStar.duration}s ease-out forwards`, zIndex: 3,
        }} />
      )}
    </div>
  );
}

// ── TOGGLE ────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <div className={`toggle ${on ? "on" : "off"}`} onClick={onToggle}>
      <div className="toggle-thumb" />
    </div>
  );
}

// ── HOME SCREEN ───────────────────────────────────────────
function HomeScreen({ onOpenWordle, radioPlayer }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const { data: weatherData } = useWeather();

  return (
    <div className="home-bg">
      <HomeAtmosphere />
      <AmbientParticles />
      <div className="home-header spring-in spring-in-1 depth-top">
        <div>
          <div className="home-greeting">Good morning, <span>Andrew</span></div>
          <div className="home-date">{dateStr} · {timeStr}</div>
        </div>
      </div>

      <div className="section-pad spring-in spring-in-2 depth-mid">
        <div className="widget-row">
          <WeatherWidget />
          <MoonWidget moonphase={weatherData?.moonphase ?? null} />
        </div>
      </div>

      <div className="section-pad spring-in spring-in-3 depth-mid">
        <ErrorBoundary label="MorningGame"><MorningGame forceGame="oneline" /></ErrorBoundary>
      </div>

      <div className="spring-in spring-in-4 depth-mid" style={{ paddingTop: 14 }}>
        <div className="globe-hero" style={{ overflow: "hidden", padding: 0, cursor: "pointer" }}>
          <Suspense fallback={<div style={{ width: "100%", minHeight: 320, background: "#010f18" }} />}>
            <PulseMap style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: "inherit" }} radioPlayer={radioPlayer} />
          </Suspense>
        </div>
      </div>

      <div className="section-pad spring-in spring-in-5 depth-mid">
        <ErrorBoundary label="PollCard"><PollCard /></ErrorBoundary>
      </div>

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <JournalWidget />
      </div>

      <div className="spring-in spring-in-6 depth-mid">
        <ErrorBoundary label="ArtOfTheDay"><ArtOfTheDayCard /></ErrorBoundary>
      </div>

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <ErrorBoundary label="OnThisDay"><OnThisDayWidget /></ErrorBoundary>
      </div>

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <div className="wordle-card" onClick={onOpenWordle}>
          <div className="wc-left">
            <div className="wc-label">Daily · Word Game</div>
            <div className="wc-title">WORDLE</div>
            <div className="wc-date">{now.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
          </div>
          <div className="wc-right">
            <div className="wc-tiles">
              <div className="wc-tile wc-tile-green"/>
              <div className="wc-tile wc-tile-amber"/>
              <div className="wc-tile wc-tile-dark"/>
              <div className="wc-tile wc-tile-dark"/>
              <div className="wc-tile wc-tile-dark"/>
            </div>
            <div className="wc-play">Play →</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DISCOVER SCREEN (live streams) ──────
function DiscoverScreen() {
  const [openStream, setOpenStream] = useState(null);
  const allStreams = useMemo(
    () => Object.values(LIVE_STREAM_CATEGORIES).flat(),
    []
  );
  const liveStatus = useLiveStatus(allStreams);
  const liveCategories = useMemo(() => {
    if (!liveStatus) return null;
    const out = {};
    for (const [cat, streams] of Object.entries(LIVE_STREAM_CATEGORIES)) {
      const live = streams.filter(s => liveStatus[s.videoId]?.live);
      if (live.length) out[cat] = live;
    }
    return out;
  }, [liveStatus]);

  return (
    <div className="community-bg">
      <div className="community-header fade-up fade-up-1">
        <div className="community-title">Discover</div>
        <div className="community-subtitle">The world right now</div>
      </div>

      <div className="section-pad fade-up fade-up-2">
        <div style={{ color: "#FDF2E8", fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>One Line</div>
        <div className="mg-card"><OneLine onComplete={() => {}} /></div>
      </div>

      <div className="section-pad fade-up fade-up-3">
        <div style={{ color: "#FDF2E8", fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Stack</div>
        <div className="mg-card"><Stack onComplete={() => {}} /></div>
      </div>

      <div className="section-pad fade-up fade-up-4">
        <div style={{ color: "#FDF2E8", fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Ripples</div>
        <div style={{ color: "rgba(253,242,232,0.4)", fontSize: 12, marginBottom: 10 }}>Tap anywhere on the screen to test (overlay game)</div>
      </div>

      <div className="fade-up fade-up-5" style={{ marginTop: 20 }}>
        {!liveCategories && (
          <div style={{ padding: "0 20px", fontSize: 11, color: "rgba(253,242,232,0.4)", letterSpacing: 0.5 }}>
            Checking live streams…
          </div>
        )}
        {liveCategories && Object.entries(liveCategories).map(([cat, streams]) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ padding: "0 20px", marginBottom: 8 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(2,48,71,0.7)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                padding: "5px 12px 5px 10px", borderRadius: 999,
                border: "1px solid rgba(253,242,232,0.1)",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: LIVE_CAT_COLORS[cat] }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#FDF2E8" }}>{cat}</span>
              </div>
            </div>
            <div style={{
              display: "flex", gap: 10, overflowX: "auto",
              padding: "4px 20px 8px 20px",
              scrollSnapType: "x mandatory",
              scrollPaddingLeft: 20, scrollbarWidth: "none",
            }}>
              {streams.map(s => (
                <LiveStreamCard key={s.id} stream={s} onOpen={setOpenStream} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {openStream && <LiveStreamPlayer stream={openStream} onClose={() => setOpenStream(null)} />}
    </div>
  );
}

// ── SETTINGS SCREEN ───────────────────────────────────────
function Accordion({ title, count, total, accentColor, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion fade-up fade-up-2">
      <div className="accordion-header" onClick={() => setOpen(o => !o)}>
        <div className="accordion-left">
          {accentColor && <div style={{ width: 10, height: 10, borderRadius: 3, background: accentColor, flexShrink: 0 }} />}
          <span className="accordion-title">{title}</span>
          <span className="accordion-counts">{count}/{total}</span>
        </div>
        <span className={`accordion-chevron ${open ? "open" : ""}`}>▼</span>
      </div>
      {open && <div className="accordion-body accordion-body-animate">{children}</div>}
    </div>
  );
}

function SettingsScreen() {
  const [toggles, setToggles] = useState({ slowScroll: false, notification: true, sleepData: false });
  const toggle = k => setToggles(t => ({ ...t, [k]: !t[k] }));
  const ytUser = useAuth();

  return (
    <div className="profile-bg">
      <div className="profile-header">
        <div className="profile-top fade-up fade-up-1">
          <div className="profile-avatar-large"><Icon.User size={28} /></div>
          <div>
            <div className="profile-name">Andrew</div>
            <div className="profile-streak"><span>12-day</span> morning streak</div>
          </div>
        </div>
      </div>

      <span className="section-label fade-up fade-up-4">Feed Settings</span>
      {[
        { key: "slowScroll", Ico: Icon.Turtle, label: "Slow scroll mode", value: "15 cards per morning" },
      ].map(s => (
        <div className="setting-row fade-up fade-up-4" key={s.key}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#0C1A35" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <Toggle on={toggles[s.key]} onToggle={() => toggle(s.key)} />
        </div>
      ))}

      <span className="section-label fade-up fade-up-4">Widgets</span>
      {[
        { Ico: Icon.Moon, label: "Moon Phase", value: "Visible on Home tab" },
      ].map((s, i) => (
        <div className="setting-row fade-up fade-up-4" key={i}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#0C1A35" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <div className="setting-arrow">›</div>
        </div>
      ))}

      <YouTubeSettingsSection user={ytUser} />

      <span className="section-label fade-up fade-up-5">Sports Scores</span>
      {[
        { league: "nba", Ico: Icon.Basketball, label: "NBA", value: "Basketball" },
        { league: "nfl", Ico: Icon.Trophy, label: "NFL", value: "Football" },
        { league: "mlb", Ico: Icon.Trophy, label: "MLB", value: "Baseball" },
        { league: "nhl", Ico: Icon.Trophy, label: "NHL", value: "Hockey" },
      ].map(s => (
        <div className="setting-row fade-up fade-up-5" key={s.league}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#0C1A35" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <Toggle on={true} onToggle={() => {}} />
        </div>
      ))}

      <span className="section-label fade-up fade-up-5">Notifications</span>
      {[
        { key: "notification", Ico: Icon.Bell, label: "Morning reminder", value: "Daily at 7:00 AM" },
        { key: "sleepData", Ico: Icon.Moon, label: "Sleep integration", value: "Apple Health" },
      ].map(s => (
        <div className="setting-row fade-up fade-up-5" key={s.key}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#0C1A35" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <Toggle on={toggles[s.key]} onToggle={() => toggle(s.key)} />
        </div>
      ))}
    </div>
  );
}

// ── BACKGROUND GRADIENT ────────────────────────────────────
const SUNRISE_GRADIENT = `linear-gradient(in oklch 175deg,
  #081020 0%, #0B1528 5.5%, #10203E 11%, #162D52 16.5%, #1E4580 22%,
  #2962A8 27.5%, #3480C8 33%, #44A0DE 38.5%, #5FBBED 44%, #7FCDF0 49.5%,
  #9DDAF0 55%, #B4E2EE 60.5%, #C8E6EA 66%, #D9EBE8 71.5%, #E6EDE6 77%,
  #EEEEE8 82.5%, #F4F0E8 88%, #F9F2E8 94%, #FDF2E8 100%
)`;

const getBgStyle = () => ({
  background: SUNRISE_GRADIENT,
  backgroundSize: '100% 180%',
});

// ── NAV TABS ──────────────────────────────────────────────
const TABS = [
  { id: "home",     label: "Home",     ActiveIcon: p => <Icon.Home     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Home     {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "feed",     label: "Feed",     ActiveIcon: p => <Icon.Feed     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Feed     {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "mind",     label: "Mind",     ActiveIcon: p => <Icon.Mind     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Mind     {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "discover", label: "Discover", ActiveIcon: p => <Icon.Globe    {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Globe    {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "settings", label: "Settings", ActiveIcon: p => <Icon.Settings {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Settings {...p} color="rgba(12,26,53,0.5)" /> },
];

// ── APP SHELL ─────────────────────────────────────────────
function RadioMiniPlayer({ radioPlayer }) {
  const { station, status, togglePlay, stop } = radioPlayer;
  if (!station) return null;
  return (
    <div className="radio-mini-inner">
      <div className="radio-mini-live">
        {status === "playing" && <span className="radio-live-dot" />}
        {status === "loading" && <span className="radio-loading-dot" />}
        {status === "error" && <span className="radio-error-dot" />}
      </div>
      <div className="radio-mini-info">
        <div className="radio-mini-name">{station.name}</div>
        <div className="radio-mini-country">{status === "error" ? "Stream unavailable" : station.country}</div>
      </div>
      <button className="radio-mini-btn" onClick={togglePlay} aria-label={status === "playing" ? "Pause" : "Play"}>
        {status === "playing" ? <Icon.Pause size={16} color="#FDF2E8" /> : <Icon.Play size={16} color="#FDF2E8" />}
      </button>
      <button className="radio-mini-btn" onClick={stop} aria-label="Stop">
        <Icon.X size={16} color="rgba(253,242,232,0.5)" />
      </button>
    </div>
  );
}

export default function MorningScrollApp() {
  const [tab, setTab] = useState("home");
  const [wordleOpen, setWordleOpen] = useState(false);
  const [wordleClosing, setWordleClosing] = useState(false);
  const screenRef = useRef(null);
  const gyro = useGyroscope();
  const colorTemp = useColorTemp();
  const radioPlayer = useRadioPlayer();

  useEffect(() => { if (screenRef.current) screenRef.current.scrollTop = 0; }, [tab]);

  const closeWordle = () => {
    setWordleClosing(true);
    setTimeout(() => { setWordleOpen(false); setWordleClosing(false); }, 260);
  };

  const now = new Date();
  const clockTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div className="phone-wrapper">
        <div className="phone" id="phone-shell" style={{ ...getBgStyle(), '--gyro-x': gyro.x, '--gyro-y': gyro.y, filter: colorTemp }}>
          <div className="status-bar">
            <div className="status-time">{clockTime}</div>
            <div style={{ width: 120, height: 30, background: "#0a1628", borderRadius: 15, position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)" }} />
            <div style={{ display: "flex", gap: 2 }}>
              <span className="status-wifi" style={{ fontSize: 10 }}>●●● WiFi ▮▮▮</span>
            </div>
          </div>

          <div className="screen rubber-scroll" ref={screenRef}>
            {tab === "home" && <HomeScreen onOpenWordle={() => setWordleOpen(true)} radioPlayer={radioPlayer} />}
            {tab === "feed" && <FeedScreen />}
            {tab === "mind" && <MindScreen />}
            {tab === "discover" && <DiscoverScreen />}
            {tab === "settings" && <SettingsScreen />}
          </div>

          {radioPlayer.station && tab !== "discover" && (
            <div className="radio-mini-player">
              <RadioMiniPlayer radioPlayer={radioPlayer} />
            </div>
          )}

          <div className="nav">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <div key={t.id} className={`nav-item tappable ${active ? "active" : ""}`} onClick={() => setTab(t.id)}>
                  <div className="nav-icon">{active ? <t.ActiveIcon size={22} /> : <t.InactiveIcon size={22} />}</div>
                  <div className="nav-label">{t.label}</div>
                  <div className="nav-dot" />
                </div>
              );
            })}
          </div>

          {wordleOpen && (
            <div className={`wordle-sheet${wordleClosing ? " closing" : ""}`}>
              <div className="ws-handle-bar">
                <div className="ws-handle"/>
                <button className="ws-close" onClick={closeWordle}>Done</button>
              </div>
              <WordleGame />
            </div>
          )}

          <GameOverlay />
        </div>
      </div>
    </>
  );
}
