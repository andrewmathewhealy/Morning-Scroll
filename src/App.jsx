import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import MorningSequence, { shouldShowMorningSequence } from "./components/MorningSequence/MorningSequence.jsx";
const PulseMap = lazy(() => import("./components/PulseMap/PulseMap.jsx"));
const SunriseGlobe = lazy(() => import("./components/PulseMap/SunriseGlobe.jsx"));
import "./styles/app.css";
import "./styles/wordle.css";
import { Icon } from "./icons/Icon.jsx";
import { useGyroscope } from "./hooks/useGyroscope.js";
import { useColorTemp } from "./hooks/useColorTemp.js";
import { useAuth } from "./hooks/useAuth.jsx";
import { useRadioPlayer } from "./hooks/useRadioPlayer.js";

// ── Extracted components ──
import { WeatherWidget, MoonWidget, useWeather } from "./components/Weather/Weather.jsx";
import JournalWidget from "./components/Journal/JournalWidget.jsx";
import WordleGame from "./components/Wordle/WordleGame.jsx";
import PollCard from "./components/Poll/PollCard.jsx";
import ArtOfTheDayCard from "./components/ArtOfTheDay/ArtOfTheDayCard.jsx";
import OnThisDayWidget from "./components/OnThisDay/OnThisDayWidget.jsx";
import FeedScreen from "./components/Feed/FeedScreen.jsx";
import { YouTubeFeedSection, YouTubeSettingsSection } from "./components/YouTube/YouTube.jsx";
import BrickBreaker from "./components/MorningGame/BrickBreaker.jsx";
import MindScreen from "./components/Mind/MindScreen.jsx";


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

// ── GLOBE SECTION (Radio / Sunrise tabs) ─────────────────
function GlobeSection({ radioPlayer }) {
  const [globeMode, setGlobeMode] = useState("sunrise");
  const [fullscreen, setFullscreen] = useState(false);

  const globeContent = (
    <div
      className={fullscreen ? undefined : "globe-hero"}
      style={fullscreen
        ? { position: "fixed", inset: 0, zIndex: 9999, background: "#000" }
        : { overflow: "hidden", padding: 0, cursor: "pointer", position: "relative" }
      }
    >
      {/* Tab switcher — inside the globe */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, display: "flex", alignItems: "center", gap: 0,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        borderRadius: 20, padding: "5px 4px",
      }}>
        <span
          onClick={(e) => { e.stopPropagation(); setGlobeMode("sunrise"); }}
          style={{
            padding: "3px 14px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "'Satoshi', sans-serif",
            color: globeMode === "sunrise" ? "#FDF2E8" : "rgba(253,242,232,0.4)",
            transition: "color 0.2s",
          }}
        >
          Sunrise
        </span>
        <span style={{ width: 1, height: 12, background: "rgba(253,242,232,0.2)" }} />
        <span
          onClick={(e) => { e.stopPropagation(); setGlobeMode("radio"); }}
          style={{
            padding: "3px 14px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "'Satoshi', sans-serif",
            color: globeMode === "radio" ? "#FDF2E8" : "rgba(253,242,232,0.4)",
            transition: "color 0.2s",
          }}
        >
          Radio
        </span>
      </div>

      {/* Fullscreen close button */}
      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: "absolute", top: 14, right: 14, zIndex: 11,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)",
            borderRadius: 20, padding: "6px 14px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, color: "#FDF2E8",
          }}
        >
          Close
        </div>
      )}

      {/* Expand button (non-fullscreen only) */}
      {!fullscreen && (
        <div
          onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
          style={{
            position: "absolute", bottom: 10, right: 10, zIndex: 10,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
            borderRadius: 14, padding: "5px 10px", cursor: "pointer",
            fontSize: 10, fontWeight: 600, color: "rgba(253,242,232,0.6)",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          Expand
        </div>
      )}

      <Suspense fallback={<div style={{ width: "100%", height: "100%", minHeight: fullscreen ? "100vh" : 320, background: "#000" }} />}>
        {globeMode === "radio" ? (
          <PulseMap style={{ width: "100%", height: "100%", minHeight: fullscreen ? "100vh" : 320, borderRadius: fullscreen ? 0 : "inherit" }} fullscreen={fullscreen} radioPlayer={radioPlayer} />
        ) : (
          <SunriseGlobe style={{ width: "100%", height: "100%", minHeight: fullscreen ? "100vh" : 320, borderRadius: fullscreen ? 0 : "inherit" }} />
        )}
      </Suspense>
    </div>
  );

  if (fullscreen) return globeContent;

  return (
    <div className="spring-in spring-in-4 depth-mid" style={{ paddingTop: 14 }}>
      {globeContent}
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

      <div className="section-pad spring-in spring-in-5 depth-mid">
        <ErrorBoundary label="PollCard"><PollCard /></ErrorBoundary>
      </div>

      <GlobeSection radioPlayer={radioPlayer} />

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <JournalWidget />
      </div>

      <div className="spring-in spring-in-6 depth-mid">
        <ErrorBoundary label="ArtOfTheDay"><ArtOfTheDayCard /></ErrorBoundary>
      </div>

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <ErrorBoundary label="OnThisDay"><OnThisDayWidget /></ErrorBoundary>
      </div>

      <div className="section-pad spring-in spring-in-3 depth-mid">
        <ErrorBoundary label="BrickBreaker"><BrickBreaker /></ErrorBoundary>
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

function SettingsScreen({ bgTheme, onChangeBgTheme }) {
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

      <span className="section-label fade-up fade-up-3">Background</span>
      <div className="fade-up fade-up-3" style={{ display: "flex", gap: 12, padding: "0 20px", marginBottom: 16 }}>
        {Object.entries(BG_THEMES).map(([key, { label, gradient }]) => (
          <button
            key={key}
            onClick={() => onChangeBgTheme(key)}
            style={{
              flex: 1, height: 56, borderRadius: 14, border: bgTheme === key ? "2.5px solid #0C1A35" : "1.5px solid rgba(12,26,53,0.15)",
              background: gradient, cursor: "pointer", position: "relative", overflow: "hidden",
              boxShadow: bgTheme === key ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
              transition: "border 0.2s, box-shadow 0.2s",
            }}
          >
            <span style={{
              position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center",
              fontSize: 9, fontWeight: 600, color: "#0C1A35", letterSpacing: 0.3, opacity: 0.7,
            }}>{label}</span>
          </button>
        ))}
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
const BG_THEMES = {
  peach:    { label: "Peach",    swatch: "#F2B899", gradient: "linear-gradient(175deg, #D9A088 0%, #E4B8A0 20%, #EECEBC 40%, #F4DDD0 60%, #F8E8E0 80%, #FDF2E8 100%)" },
  lavender: { label: "Lavender", swatch: "#A8B4D0", gradient: "linear-gradient(175deg, #A8B4D0 0%, #BFC8DE 20%, #D2D4E4 40%, #E4DDE6 60%, #F0E8E8 80%, #FDF2E8 100%)" },
  rose:     { label: "Rose",     swatch: "#D898AC", gradient: "linear-gradient(175deg, #C0808E 0%, #D0A0AC 20%, #DEB8C2 40%, #E8CCD4 60%, #F0DDE0 80%, #FDF2E8 100%)" },
  mint:     { label: "Mint",     swatch: "#A0CCC8", gradient: "linear-gradient(175deg, #88B8B4 0%, #A0CCC8 20%, #B8DCDA 40%, #D0E8E4 60%, #E4EEEA 80%, #FDF2E8 100%)" },
};
const getBgStyle = (theme) => ({ background: BG_THEMES[theme]?.gradient ?? BG_THEMES.peach.gradient });

// ── NAV TABS ──────────────────────────────────────────────
const TABS = [
  { id: "home",     label: "Home",     ActiveIcon: p => <Icon.Home     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Home     {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "feed",     label: "Feed",     ActiveIcon: p => <Icon.Feed     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Feed     {...p} color="rgba(12,26,53,0.5)" /> },
  { id: "mind",     label: "Mind",     ActiveIcon: p => <Icon.Mind     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Mind     {...p} color="rgba(12,26,53,0.5)" /> },
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
  const [bgTheme, setBgTheme] = useState(() => localStorage.getItem("ms-bg-theme") || "peach");
  const [showSequence, setShowSequence] = useState(() => shouldShowMorningSequence());
  const screenRef = useRef(null);
  const gyro = useGyroscope();
  const colorTemp = useColorTemp();
  const radioPlayer = useRadioPlayer();

  const changeBgTheme = (t) => { setBgTheme(t); localStorage.setItem("ms-bg-theme", t); };

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
      <div className={`phone-wrapper${window.Capacitor ? ' is-native' : ''}`}>
        <div className={`phone${window.Capacitor ? ' is-native' : ''}`} id="phone-shell" style={{ ...getBgStyle(bgTheme), '--gyro-x': gyro.x, '--gyro-y': gyro.y, filter: colorTemp }}>
          {!window.Capacitor && (
            <div className="status-bar">
              <div className="status-time">{clockTime}</div>
              <div className="status-notch" />
              <div style={{ display: "flex", gap: 2 }}>
                <span className="status-wifi" style={{ fontSize: 10 }}>●●● WiFi ▮▮▮</span>
              </div>
            </div>
          )}

          <div className="screen rubber-scroll" ref={screenRef}>
            {tab === "home" && <HomeScreen onOpenWordle={() => setWordleOpen(true)} radioPlayer={radioPlayer} />}
            {tab === "feed" && <FeedScreen />}
            {tab === "mind" && <MindScreen />}
            {tab === "settings" && <SettingsScreen bgTheme={bgTheme} onChangeBgTheme={changeBgTheme} />}
          </div>

          {radioPlayer.station && (
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

          {showSequence && (
            <MorningSequence onComplete={() => setShowSequence(false)} />
          )}

        </div>
      </div>
    </>
  );
}
