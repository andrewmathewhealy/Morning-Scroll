import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { SUBREDDIT_CATEGORIES, ALL_SUBREDDITS, FEED_MODES } from "./subreddits.js";
import { useRedditFeed } from "./useRedditFeed.js";
import { cleanRedditText } from "./redditApi.js";
import GlobeCanvas from "./Globe.jsx";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit as fbLimit } from "firebase/firestore";

// ── GYROSCOPE PARALLAX HOOK ───────────────────────────────
function useGyroscope() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const base = useRef(null);
  const smoothed = useRef({ x: 0, y: 0 });
  const raf = useRef(null);

  useEffect(() => {
    const handleOrientation = (e) => {
      // beta = front-back tilt (-180 to 180), gamma = left-right tilt (-90 to 90)
      const rawX = (e.gamma ?? 0);   // left/right
      const rawY = (e.beta  ?? 45) - 45; // forward tilt, normalised around natural hold angle

      // Clamp to reasonable range
      const clampedX = Math.max(-30, Math.min(30, rawX));
      const clampedY = Math.max(-30, Math.min(30, rawY));

      // Smooth via lerp on RAF
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        smoothed.current.x += (clampedX - smoothed.current.x) * 0.12;
        smoothed.current.y += (clampedY - smoothed.current.y) * 0.12;
        setTilt({ x: smoothed.current.x, y: smoothed.current.y });
      });
    };

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', handleOrientation); })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return tilt;
}




// ── COUNT-UP HOOK ─────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const start = useRef(null);
  const targetNum = parseFloat(String(target).replace(/[^0-9.]/g, '')) || 0;
  const suffix = String(target).replace(/[0-9.]/g, '');
  useEffect(() => {
    if (targetNum === 0) return;
    start.current = null;
    const step = (ts) => {
      if (!start.current) start.current = ts;
      const p = Math.min((ts - start.current) / duration, 1);
      // ease out quart
      const ease = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(ease * targetNum));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [targetNum, duration]);
  return val + suffix;
}

// ── COUNT-UP DISPLAY ──────────────────────────────────────
function CountUp({ value, duration = 900 }) {
  const display = useCountUp(value, duration);
  return <span className="count-up">{display}</span>;
}

// ── COLOR TEMPERATURE ─────────────────────────────────────
// Subtly warms the palette in early morning, cools by midday
function useColorTemp() {
  const hour = new Date().getHours();
  // 5-8am: warm amber tint, 9-11am: neutral, 12+: slightly cool
  if (hour >= 5 && hour < 9)  return 'sepia(0.08) saturate(1.05)';
  if (hour >= 9 && hour < 12) return 'sepia(0.03) saturate(1.02)';
  return 'none';
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

  // Shooting star every 15-20 seconds
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
    id: i,
    x: 5 + Math.random() * 90,
    y: 2 + Math.random() * 28,
    size: 1 + Math.random() * 1.5,
    delay: Math.random() * 4,
    duration: 2 + Math.random() * 3,
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
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.7; }
        }
        @keyframes cloudDriftLeft {
          0%   { transform: translateX(-110%); opacity: 0; }
          10%  { opacity: var(--c-op); }
          90%  { opacity: var(--c-op); }
          100% { transform: translateX(110vw); opacity: 0; }
        }
        @keyframes cloudDriftRight {
          0%   { transform: translateX(110vw); opacity: 0; }
          10%  { opacity: var(--c-op); }
          90%  { opacity: var(--c-op); }
          100% { transform: translateX(-110%); opacity: 0; }
        }
        @keyframes shootAcross {
          0%   { transform: translate(0, 0) rotate(var(--ss-angle)); opacity: 0; }
          5%   { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translate(200px, 120px) rotate(var(--ss-angle)); opacity: 0; }
        }
      `}</style>

      {/* Stars in dark top portion */}
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          borderRadius: '50%',
          background: 'rgba(250,230,210,0.85)',
          boxShadow: '0 0 3px rgba(250,230,210,0.4)',
          animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
        }} />
      ))}

      {/* Drifting clouds */}
      {clouds.map(c => (
        <div key={c.id} style={{
          position: 'absolute',
          top: c.top,
          [c.side]: 0,
          width: c.width,
          height: c.width * 0.35,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 40%, transparent 70%)',
          filter: 'blur(12px)',
          '--c-op': c.opacity,
          animation: `cloudDrift${c.side === 'left' ? 'Left' : 'Right'} ${c.duration}s ${c.delay}s linear infinite`,
        }} />
      ))}

      {/* Shooting star */}
      {shootingStar && (
        <div key={shootingStar.key} style={{
          position: 'absolute',
          left: `${shootingStar.startX}%`,
          top: `${shootingStar.startY}%`,
          width: 40, height: 1.5,
          borderRadius: 1,
          background: 'linear-gradient(to right, transparent, rgba(250,222,210,0.9), rgba(255,255,255,0.95))',
          boxShadow: '0 0 6px 1px rgba(240,184,138,0.5)',
          '--ss-angle': `${shootingStar.angle}deg`,
          animation: `shootAcross ${shootingStar.duration}s ease-out forwards`,
          zIndex: 3,
        }} />
      )}
    </div>
  );
}

// ── WORD LISTS: fetched at runtime, not bundled ────────────
// This is the key fix — instead of 280MB of embedded arrays,
// we fetch two tiny JSON files (~50KB total) from a public CDN.
// Your app starts fast, and this file stays small forever.

const FONTS = `@import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Lora:ital,wght@1,400&family=Barlow+Condensed:wght@600&family=DM+Sans:wght@500&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');`;

// ── PALETTE ───────────────────────────────────────────────
// BG:           #8ECAE6  sky blue
// BG deep:      #219EBC
// BG darkest:   #023047  deep navy
// Accent:       #FFD166  amber
// Accent dark:  #FFBC42
// Text dark:    #023047
// Text mid:     #2a5f7a
// Text light:   #5a9ab5
// Text subtle:  #8ec5d9
// White:        #EAF4FB

const styles = `
  ${FONTS}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #023047; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: 'Satoshi', sans-serif; }

  .phone {
    width: 390px; height: 844px;
    background: transparent;
    border-radius: 48px; overflow: hidden; position: relative;
    box-shadow: 0 0 0 1px rgba(2,48,71,0.15), 0 40px 120px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.5);
    display: flex; flex-direction: column;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    transform: translateZ(0);
  }
  .phone::after {
    content: ''; position: absolute; inset: 0; z-index: 15; pointer-events: none;
    border-radius: inherit;
    filter: url(#grain);
    opacity: 0.04;
    background: rgba(128,128,128,0.5);
    mix-blend-mode: overlay;
  }

  .status-bar {
    height: 50px; display: flex; align-items: flex-end; justify-content: space-between;
    padding: 0 28px 8px; flex-shrink: 0; position: relative; z-index: 10; background: transparent;
  }
  .status-time { font-family: 'Satoshi', sans-serif; font-weight: 500; font-size: 15px; color: #FDF2E8; }
  .status-wifi { color: rgba(253,242,232,0.6); }
  .status-icons span { font-size: 10px; color: #2a5f7a; margin-left: 5px; }

  .screen { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; background: transparent; }
  .screen::-webkit-scrollbar { display: none; }



  /* ── SPRING ANIMATIONS ── */
  @keyframes springIn {
    0%   { opacity: 0; transform: translateY(18px) scale(0.96); }
    60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
    80%  { transform: translateY(2px) scale(0.995); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .spring-in { animation: springIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; }
  .spring-in-1 { animation-delay: 0.04s; }
  .spring-in-2 { animation-delay: 0.08s; }
  .spring-in-3 { animation-delay: 0.13s; }
  .spring-in-4 { animation-delay: 0.18s; }
  .spring-in-5 { animation-delay: 0.23s; }
  .spring-in-6 { animation-delay: 0.28s; }

  /* ── CONSISTENT TAP STATES ── */
  .tappable { cursor: pointer; transition: transform 0.12s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s; -webkit-tap-highlight-color: transparent; }
  .tappable:active { transform: scale(0.94); opacity: 0.85; }
  .tappable-card { cursor: pointer; transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s; -webkit-tap-highlight-color: transparent; }
  .tappable-card:active { transform: scale(0.97); }

  /* ── WIDGET BREATHING / SHIMMER ── */
  @keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: 0.82; } }
  @keyframes widgetShimmer {
    0%  { background-position: -300% 0; }
    15% { background-position: 300% 0; }
    100% { background-position: 300% 0; }
  }
  .widget-shimmer::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%);
    background-size: 300% 100%;
    animation: widgetShimmer 25s ease-in-out infinite;
  }
  .widget-pulse { animation: breathe 4s ease-in-out infinite; }

  /* ── RUBBER BAND OVERSCROLL ── */
  .rubber-scroll { overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
    -webkit-overflow-scrolling: touch; overscroll-behavior-y: none; }
  .rubber-scroll::-webkit-scrollbar { display: none; }

  /* ── STAGGERED FEED ENTRANCE ── */
  @keyframes feedCardIn {
    0%   { opacity: 0; transform: translateY(22px) scale(0.97); }
    65%  { opacity: 1; transform: translateY(-3px) scale(1.005); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .feed-card-enter { animation: feedCardIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; opacity: 0; }

  /* ── COLOR TEMPERATURE ── */
  .phone { transition: filter 2s ease; }

  /* ── LIVING SUNRISE ── */
  @keyframes sunriseScroll {
    0%   { background-position: 0% 0%; }
    10%  { background-position: 0% 0%; }
    100% { background-position: 0% 100%; }
  }
  .phone { animation: sunriseScroll 300s linear 1 forwards; }

  /* ── NUMBER COUNT-UP ── */
  .count-up { display: inline-block; transition: opacity 0.3s; }

  /* ── GYROSCOPE PARALLAX DEPTH LAYERS ── */
  .depth-bg {
    transform: translate(
      calc(var(--gyro-x, 0) * -0.3px),
      calc(var(--gyro-y, 0) * -0.3px)
    );
    transition: transform 0.1s linear;
    will-change: transform;
  }
  .depth-mid {
    transform: translate(
      calc(var(--gyro-x, 0) * 0.5px),
      calc(var(--gyro-y, 0) * 0.5px)
    );
    transition: transform 0.1s linear;
    will-change: transform;
  }
  .depth-top {
    transform: translate(
      calc(var(--gyro-x, 0) * 1.1px),
      calc(var(--gyro-y, 0) * 1.1px)
    );
    transition: transform 0.1s linear;
    will-change: transform;
  }

  /* ── NAV ── */
  .nav {
    height: 82px; background: rgba(253,242,232,0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1.5px solid #0C1A35;
    display: flex; align-items: center; justify-content: space-around;
    padding: 0 8px 16px; flex-shrink: 0; z-index: 20;
  }
  .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 16px; border-radius: 16px; cursor: pointer; transition: all 0.2s; position: relative; }
  .nav-item.active { background: rgba(12,26,53,0.08); }
  .nav-icon { width: 24px; height: 24px; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; }
  .nav-item.active .nav-icon { transform: scale(1.1); }
  .nav-label { font-size: 10px; font-weight: 500; color: rgba(12,26,53,0.4); letter-spacing: 0.3px; transition: color 0.2s; }
  .nav-item.active .nav-label { color: #0C1A35; }
  .nav-dot { width: 5px; height: 5px; border-radius: 50%; background: linear-gradient(135deg, #fffbe6 0%, #FFD166 100%); position: absolute; bottom: 0; opacity: 0; transition: opacity 0.2s; }
  .nav-item.active .nav-dot { opacity: 1; }

  /* ── HOME ── */
  .home-bg { min-height: 100%; background: transparent; padding: 0 0 32px; position: relative; }
  .home-header { padding: 16px 24px 0; display: flex; justify-content: space-between; align-items: flex-start; }
  .home-greeting { font-family: 'Fraunces', serif; font-size: 23.5px; font-weight: 600; color: #FDF2E8; line-height: 1.2; }
  .home-greeting span { color: #FDF2E8; -webkit-text-fill-color: #FDF2E8; }
  .home-date { font-size: 12.5px; color: rgba(253,242,232,0.7); margin-top: 4px; letter-spacing: 1px; font-weight: 500; text-transform: uppercase; }
  .home-avatar { width: 40px; height: 40px; border-radius: 50%; background: #023047; display: flex; align-items: center; justify-content: center; }

  .widget-row { display: flex; gap: 12px; }
  .section-pad { padding: 14px 20px 0; }

  .weather-widget {
    background: #023047; border-radius: 24px; padding: 20px; flex: 1; position: relative; overflow: hidden; cursor: pointer; border: 1.5px solid #FDF2E8;
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
  }
  .weather-widget::before {
    content: ''; position: absolute; top: -30px; right: -30px; width: 130px; height: 130px;
    background: radial-gradient(circle, rgba(255,183,3,0.12) 0%, transparent 70%);
  }
  .weather-temp { font-family: 'Satoshi', sans-serif; font-size: 48px; color: #FDF2E8; line-height: 1; position: relative; z-index: 1; }
  .weather-label { font-size: 11px; color: rgba(253,242,232,0.5); margin-top: 4px; letter-spacing: 0.5px; position: relative; z-index: 1; }
  .weather-condition { font-size: 13px; color: rgba(253,242,232,0.7); margin-top: 8px; position: relative; z-index: 1; }
  .weather-icon-wrap { margin-bottom: 6px; }
  .weather-forecast { display: flex; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(253,242,232,0.15); position: relative; z-index: 1; }
  .weather-hour { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
  .weather-hour-time { font-size: 9px; color: rgba(253,242,232,0.5); letter-spacing: 0.3px; }
  .weather-hour-temp { font-size: 11px; color: rgba(253,242,232,0.9); font-weight: 600; }

  .moon-widget {
    background: #000; border-radius: 24px; width: 130px; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    position: relative; border: 1.5px solid #FDF2E8;
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
  }
  .moon-widget::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      radial-gradient(1px 1px at 12% 8%, rgba(253,242,232,0.7) 50%, transparent 50%),
      radial-gradient(1px 1px at 28% 18%, rgba(253,242,232,0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 75% 6%, rgba(253,242,232,0.6) 50%, transparent 50%),
      radial-gradient(1px 1px at 88% 22%, rgba(253,242,232,0.4) 50%, transparent 50%),
      radial-gradient(1px 1px at 45% 12%, rgba(253,242,232,0.55) 50%, transparent 50%),
      radial-gradient(1px 1px at 62% 25%, rgba(253,242,232,0.45) 50%, transparent 50%),
      radial-gradient(1px 1px at 8% 28%, rgba(253,242,232,0.35) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 92% 10%, rgba(253,242,232,0.65) 50%, transparent 50%),
      radial-gradient(1px 1px at 35% 4%, rgba(253,242,232,0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 55% 20%, rgba(253,242,232,0.4) 50%, transparent 50%),
      radial-gradient(1px 1px at 18% 30%, rgba(253,242,232,0.3) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 70% 15%, rgba(253,242,232,0.55) 50%, transparent 50%);
  }
  .moon-img-wrap {
    width: 100%; aspect-ratio: 1; overflow: hidden; position: relative; z-index: 1;
    background: radial-gradient(circle at var(--glow-x, 50%) 50%,
      rgba(253,242,232,calc(0.45 * var(--glow-opacity, 1))) 0%,
      rgba(253,242,232,calc(0.2 * var(--glow-opacity, 1))) 30%,
      rgba(253,242,232,calc(0.06 * var(--glow-opacity, 1))) 50%,
      transparent 65%);
  }
  .moon-img-wrap::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at var(--glow-x, 50%) 50%,
      rgba(253,242,232,calc(0.3 * var(--glow-opacity, 1))) 0%,
      rgba(253,242,232,calc(0.1 * var(--glow-opacity, 1))) 30%,
      transparent 55%);
    mix-blend-mode: screen;
  }
  .moon-img { width: 100%; height: 100%; object-fit: cover; display: block; mix-blend-mode: lighten; }
  .moon-info { padding: 10px 8px 14px; text-align: center; width: 100%; }
  .moon-phase { font-size: 10px; color: rgba(253,242,232,0.6); line-height: 1.3; font-weight: 500; letter-spacing: 0.3px; }
  .moon-pct { font-family: 'Satoshi', sans-serif; font-size: 18px; color: #FDF2E8; margin-bottom: 2px; font-weight: 600; }

  .calendar-widget {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-radius: 18px; padding: 18px 20px;
    border: 1px solid rgba(255,255,255,0.22);
    border-left: 4px solid rgba(180,190,205,0.5);
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
  }
  .cal-header { font-size: 10px; color: rgba(8,16,32,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
  .cal-event { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(8,16,32,0.08); }
  .cal-event:last-child { border-bottom: none; }
  .cal-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cal-time { font-size: 11px; color: rgba(8,16,32,0.5); width: 40px; flex-shrink: 0; font-weight: 500; }
  .cal-title { font-size: 13px; color: #0C1A35; }

  .photo-widget { background: #023047; border-radius: 24px; overflow: hidden; position: relative; height: 160px; display: flex; align-items: flex-end; border: 1.5px solid #FDF2E8; box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06); }
  .photo-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .photo-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(2,48,71,0.8) 0%, transparent 55%); }
  .photo-label { position: relative; z-index: 1; padding: 16px; }
  .photo-tag { font-size: 10px; color: #FFD166; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; }
  .photo-caption { font-family: 'Satoshi', sans-serif; font-size: 16px; color: #FDF2E8; margin-top: 2px; }

  .otd-widget {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-radius: 18px; padding: 20px; min-height: 110px;
    border: 1px solid rgba(255,255,255,0.22);
    border-left: 4px solid rgba(255,183,3,0.5);
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
  }
  .otd-label { font-size: 10px; color: rgba(8,16,32,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .otd-year { font-size: 22px; font-weight: 700; color: #D4940A; font-family: 'Space Mono', monospace; margin-bottom: 2px; }
  .otd-meta { font-size: 11px; color: rgba(8,16,32,0.45); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .otd-text { font-family: 'Satoshi', sans-serif; font-size: 14px; color: #0C1A35; line-height: 1.6; }
  .otd-link { font-size: 11px; color: #D4940A; margin-top: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .otd-loading { display: flex; align-items: center; gap: 8px; color: rgba(8,16,32,0.45); font-size: 13px; }
  .otd-dot { width: 6px; height: 6px; border-radius: 50%; background: #FFB703; animation: otd-pulse 1.4s ease-in-out infinite; }
  .otd-dot:nth-child(2) { animation-delay: 0.2s; }
  .otd-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes otd-pulse { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

  /* ── FEED ── */
  .feed-bg { height: 100%; display: flex; flex-direction: column; background: linear-gradient(to bottom, transparent 0%, transparent 180px, #FDF2E8 180px); overflow: hidden; }
  .feed-header { padding: 16px 24px 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .feed-title { font-family: 'Fraunces', serif; font-size: 27.5px; font-weight: 600; color: #FDF2E8; }
  .feed-subtitle { font-size: 13.5px; color: rgba(253,242,232,0.6); margin-top: 2px; }

  .filter-scroll { display: flex; gap: 8px; padding: 14px 20px 10px; overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
  .filter-scroll::-webkit-scrollbar { display: none; }
  .feed-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; padding-top: 12px; padding-bottom: 32px; background: #FDF2E8; border-radius: 24px 24px 0 0; }
  .feed-scroll-area::-webkit-scrollbar { display: none; }
  .mode-pill {
    padding: 7px 16px; border-radius: 10px; cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    white-space: nowrap; border: 1.5px solid transparent; flex-shrink: 0;
  }

  /* Hero card — full bleed image with gradient overlay text */
  .feed-card {
    margin: 12px 20px 0; border-radius: 22px; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
    cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .feed-card:active { transform: scale(0.985); box-shadow: 0 4px 16px rgba(0,20,60,0.18); }
  .feed-card-image {
    height: 220px; background: #023047; position: relative; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  /* Gradient overlay so title reads over image */
  .feed-card-image::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(2,30,50,0.82) 0%, rgba(2,30,50,0.3) 55%, transparent 100%);
    pointer-events: none;
  }
  /* Title overlaid on image for hero cards with images */
  .feed-card-overlay-body {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 2;
    padding: 12px 16px 14px;
  }
  .feed-card-overlay-source { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .feed-card-overlay-title {
    font-family: 'Satoshi', sans-serif; font-size: 17px; font-weight: 700;
    color: #EAF4FB; line-height: 1.35;
    text-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  .feed-card-overlay-meta { display: flex; gap: 10px; margin-top: 6px; }
  .feed-card-overlay-meta span { font-size: 11px; color: rgba(234,244,251,0.65); }
  /* Fallback body below image (no-image cards) */
  .feed-card-body { padding: 14px 16px 16px; background: rgba(255,255,255,0.88); backdrop-filter: blur(8px); }
  .feed-card-source { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .feed-source-dot { width: 6px; height: 6px; border-radius: 50%; }
  .feed-source-label { font-size: 12px; color: #5a9ab5; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .feed-card-title { font-family: 'Satoshi', sans-serif; font-size: 17px; color: #023047; line-height: 1.4; }
  .feed-card-meta { display: flex; gap: 12px; margin-top: 10px; }
  .feed-card-meta span { font-size: 11px; color: #8ec5d9; }

  .feed-card-small { cursor: pointer; margin: 10px 20px 0; background: rgba(255,255,255,0.62); backdrop-filter: blur(8px); border-radius: 16px; padding: 0; box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06); display: flex; gap: 12px; align-items: stretch; overflow: hidden; }
  .feed-small-thumb { width: 44px; height: 44px; border-radius: 12px; background: #219EBC; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .feed-small-source { font-size: 12px; color: #5a9ab5; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
  .feed-small-title { font-size: 14px; color: #023047; line-height: 1.35; margin-top: 2px; }
  .feed-small-meta { font-size: 11px; color: #8ec5d9; margin-top: 4px; }

  .done-btn { margin: 24px 20px 0; background: linear-gradient(135deg, #fff8e7 0%, #FFD166 60%, #FFBC42 100%); border-radius: 20px; padding: 16px; text-align: center; cursor: pointer; transition: opacity 0.2s; }
  .done-btn:active { opacity: 0.85; }
  .done-btn-label { font-size: 14px; color: #023047; font-weight: 600; }
  .done-btn-sub { font-size: 11px; color: rgba(2,48,71,0.5); margin-top: 3px; }

  /* ── COMMUNITY / WORLD ── */
  .community-bg { min-height: 100%; background: transparent; padding-bottom: 32px; }
  .community-header { padding: 16px 24px 12px; }
  .community-title { font-family: 'Fraunces', serif; font-size: 27.5px; font-weight: 600; color: #FDF2E8; }
  .community-subtitle { font-size: 13.5px; color: rgba(253,242,232,0.6); margin-top: 2px; }

  .globe-hero {
    margin: 0 20px; height: 380px; border-radius: 28px;
    background: #010f18; border: 1.5px solid #FDF2E8;
    position: relative; overflow: hidden; cursor: pointer;
  }
  .globe-sphere {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 200px; height: 200px; border-radius: 50%;
    background: radial-gradient(ellipse at 35% 35%, #0a3a5c 0%, #041f38 50%, #020d1a 100%);
    box-shadow: 0 0 60px rgba(33,158,188,0.2), inset -20px -20px 40px rgba(0,0,0,0.6);
    overflow: hidden;
  }
  .globe-terminator {
    position: absolute; top: 0; left: 45%; width: 110%; height: 100%;
    background: rgba(0,0,0,0.55); border-left: 1px solid rgba(255,183,3,0.25); border-radius: 0 50% 50% 0;
  }
  .globe-dot { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #FFD166; box-shadow: 0 0 7px #FFD166; animation: pdot 2s ease-in-out infinite; }
  @keyframes pdot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.6); } }
  .globe-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(1,15,24,0.88) 0%, transparent 55%); }
  .globe-label { position: absolute; bottom: 20px; left: 20px; right: 20px; }
  .globe-count { font-family: 'Satoshi', sans-serif; font-size: 22px; color: #EAF4FB; }
  .globe-count span { color: #FFD166; }
  .globe-sub { font-size: 11px; color: rgba(142,202,230,0.5); margin-top: 2px; }
  .globe-expand { position: absolute; top: 16px; right: 16px; background: rgba(142,202,230,0.08); border: 1px solid rgba(142,202,230,0.15); border-radius: 10px; padding: 6px 10px; font-size: 11px; color: rgba(142,202,230,0.5); }

  .pulse-banner { margin: 12px 20px 0; background: rgba(255,255,255,0.62); backdrop-filter: blur(8px); border-radius: 16px; padding: 12px 16px; box-shadow: 0 0 0 1px rgba(255,209,102,0.3), 0 2px 10px rgba(2,48,71,0.05); display: flex; align-items: center; gap: 10px; }
  .pulse-live { width: 8px; height: 8px; border-radius: 50%; background: #FFD166; box-shadow: 0 0 8px rgba(255,183,3,0.6); animation: pdot 1.5s ease-in-out infinite; flex-shrink: 0; }
  .pulse-text { font-size: 13px; color: #2a5f7a; }
  .pulse-text strong { color: #023047; }

  .comm-card {
    margin: 12px 20px 0; padding: 20px;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.22);
    border-left: 4px solid rgba(33,158,188,0.5);
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
  }
  .comm-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .comm-card-title { font-family: 'Satoshi', sans-serif; font-size: 17px; color: #0C1A35; }
  .comm-card-sub { font-size: 11px; color: rgba(8,16,32,0.45); margin-top: 2px; }
  .comm-card-tag { font-size: 10px; color: rgba(8,16,32,0.5); background: rgba(8,16,32,0.06); padding: 4px 8px; border-radius: 8px; font-weight: 500; white-space: nowrap; margin-left: 8px; }

  .poll-option {
    padding: 11px 16px; border-radius: 14px; font-size: 13px; font-weight: 500;
    background: rgba(8,16,32,0.04); border: 1.5px solid rgba(8,16,32,0.15); cursor: pointer;
    transition: all 0.18s; color: #0C1A35; margin-bottom: 8px; display: block; width: 100%;
    text-align: left;
  }
  .poll-option:last-child { margin-bottom: 0; }
  .poll-option:hover { border-color: #FFD166; background: rgba(255,183,3,0.12); }
  .poll-option.chosen { background: #FFD166; border-color: #FFD166; color: #023047; font-weight: 600; }

  .poll-result { margin-bottom: 10px; }
  .poll-result:last-child { margin-bottom: 0; }
  .poll-result-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .poll-result-label { font-size: 13px; color: #0C1A35; font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .poll-result-pct { font-size: 12px; color: rgba(8,16,32,0.5); font-weight: 600; }
  .poll-result-track { height: 8px; background: rgba(8,16,32,0.08); border-radius: 4px; overflow: hidden; }
  .poll-result-fill { height: 100%; border-radius: 4px; background: #219EBC; transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1); }
  .poll-result-fill.winner { background: #FFD166; }
  .poll-result-fill.chosen { background: linear-gradient(90deg, #fff8e7 0%, #FFD166 100%); }
  .poll-total { font-size: 11px; color: rgba(8,16,32,0.4); margin-top: 12px; text-align: center; }

  .art-card { margin: 12px 20px 0; border-radius: 24px; overflow: hidden; border: 1.5px solid #FDF2E8; box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06); }
  .art-image { min-height: 160px; max-height: 360px; background: #FDF2E8; display: flex; align-items: center; justify-content: center; position: relative; }
  .art-image img { width: 100%; height: 100%; object-fit: contain; }
  .art-info { background: #FDF2E8; padding: 28px 20px 18px; }
  .art-title { font-family: 'Satoshi', sans-serif; font-size: 16px; color: #0C1A35; }
  .art-meta { font-size: 11px; color: rgba(8,16,32,0.5); margin-top: 3px; }
  .art-desc { font-size: 12px; color: rgba(8,16,32,0.45); margin-top: 6px; line-height: 1.5; }

  /* ── SPORTS ── */
  .sports-bg { min-height: 100%; background: transparent; padding-bottom: 32px; }
  .sports-header { padding: 16px 24px 12px; }
  .sports-title { font-family: 'Fraunces', serif; font-size: 27.5px; font-weight: 600; color: #FDF2E8; }
  .sports-subtitle { font-size: 13.5px; color: rgba(253,242,232,0.6); margin-top: 2px; }
  .sports-league-section { margin-top: 16px; }
  .sports-league-header { display: flex; align-items: center; gap: 8px; padding: 0 20px; margin-bottom: 8px; }
  .sports-league-name { font-size: 12px; color: rgba(253,242,232,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .sports-league-badge { width: 18px; height: 18px; border-radius: 4px; }
  .game-card { margin: 0 20px 8px; background: rgba(2,48,71,0.55); backdrop-filter: blur(16px); border-radius: 18px; padding: 14px 16px; border: 1.5px solid rgba(253,242,232,0.15); }
  .game-status-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .game-status { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; }
  .game-status.final { color: rgba(253,242,232,0.5); background: rgba(253,242,232,0.08); }
  .game-status.live { color: #FF6B6B; background: rgba(255,107,107,0.15); }
  .game-status.scheduled { color: #FFD166; background: rgba(255,209,102,0.12); }
  .game-time { font-size: 10px; color: rgba(253,242,232,0.4); }
  .game-teams { display: flex; flex-direction: column; gap: 6px; }
  .game-team-row { display: flex; align-items: center; justify-content: space-between; }
  .game-team-left { display: flex; align-items: center; gap: 8px; }
  .game-team-badge { width: 22px; height: 22px; border-radius: 4px; object-fit: contain; }
  .game-team-badge-placeholder { width: 22px; height: 22px; border-radius: 4px; background: rgba(253,242,232,0.08); }
  .game-team-name { font-size: 14px; color: #FDF2E8; font-weight: 500; }
  .game-team-name.winner { font-weight: 700; }
  .game-score { font-family: 'Satoshi', sans-serif; font-size: 16px; color: #FDF2E8; font-weight: 600; min-width: 24px; text-align: right; }
  .game-score.winner { color: #FFD166; }
  .game-score.pending { color: rgba(253,242,232,0.3); font-size: 13px; font-weight: 500; }
  .game-venue { font-size: 10px; color: rgba(253,242,232,0.3); margin-top: 6px; }
  .sports-skeleton { margin: 0 20px 8px; background: rgba(2,48,71,0.35); border-radius: 18px; padding: 14px 16px; border: 1.5px solid rgba(253,242,232,0.08); }
  .sports-skeleton-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .sports-error { margin: 20px; text-align: center; padding: 40px 20px; }
  .sports-error-msg { font-size: 13px; color: rgba(253,242,232,0.5); margin-top: 8px; }

  /* ── JOURNAL ── */
  .journal-card {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-radius: 18px; padding: 20px;
    border: 1px solid rgba(255,255,255,0.22);
    border-left: 4px solid rgba(139,92,246,0.5);
    box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06);
    transition: all 0.3s ease;
  }

  .journal-expanded-overlay { position: absolute; inset: 0; z-index: 9998; background: rgba(8,16,32,0.5); backdrop-filter: blur(6px); animation: journalFadeIn 0.35s ease; touch-action: none; transition: opacity 0.45s ease; }
  .journal-expanded-overlay.closing { opacity: 0; }
  @keyframes journalFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .journal-expanded { position: absolute; bottom: 0; left: 0; right: 0; z-index: 9999; background: #FDF2E8; border-radius: 24px 24px 0 0; padding: 0 20px 32px; top: 15%; display: flex; flex-direction: column; animation: journalSlideUp 0.35s cubic-bezier(0.36, 1.3, 0.64, 1); box-shadow: 0 -4px 40px rgba(8,16,32,0.2); transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease; }
  .journal-expanded.closing { transform: translateY(110%); opacity: 0; transition: transform 0.5s cubic-bezier(0.6, -0.28, 0.74, 0.05), opacity 0.4s ease; }
  @keyframes journalSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes journalSlideUpBounce { 0% { transform: translateY(100%); } 70% { transform: translateY(-2%); } 100% { transform: translateY(0); } }
  .journal-expanded .journal-header { padding-top: 16px; }
  .journal-expanded .journal-prompt { font-size: 16px; }
  .journal-expanded .journal-textarea { flex: 1; min-height: 0; resize: none; background: rgba(8,16,32,0.03); font-size: 16px; }
  .journal-drag-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(8,16,32,0.15); margin: 10px auto 6px; flex-shrink: 0; cursor: grab; }
  body.journal-open { overflow: hidden; touch-action: none; }
  body.journal-open .screen { overflow: hidden !important; touch-action: none; }
  body.journal-open .rubber-scroll { overflow: hidden !important; touch-action: none; }
  .journal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .journal-label { font-size: 10px; color: rgba(8,16,32,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .journal-prompt { font-family: 'Satoshi', sans-serif; font-size: 15px; color: #0C1A35; line-height: 1.6; margin-bottom: 14px; font-style: italic; }
  .journal-textarea { width: 100%; min-height: 100px; padding: 14px; border-radius: 14px; border: 1px solid rgba(8,16,32,0.1); background: rgba(255,255,255,0.25); color: #0C1A35; font-size: 14px; font-family: 'Satoshi', sans-serif; line-height: 1.6; resize: vertical; outline: none; }
  .journal-textarea:focus { border-color: rgba(8,16,32,0.25); }
  .journal-textarea::placeholder { color: rgba(8,16,32,0.25); }
  .journal-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  .journal-save { padding: 10px 24px; border-radius: 12px; border: none; background: rgba(139,92,246,0.8); color: #FDF2E8; font-size: 13px; font-weight: 600; font-family: 'Satoshi', sans-serif; cursor: pointer; }
  .journal-save:hover { background: rgba(139,92,246,0.95); }
  .journal-save:disabled { opacity: 0.4; cursor: not-allowed; }
  .journal-saved { font-size: 12px; color: rgba(8,16,32,0.4); }
  .journal-login-prompt { font-size: 12px; color: rgba(8,16,32,0.4); text-align: center; padding: 8px 0; }
  .journal-login-btn { background: none; border: none; color: #8B5CF6; font-weight: 600; cursor: pointer; font-size: 12px; font-family: 'Satoshi', sans-serif; }
  .journal-shimmer { min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }

  .journal-history-btn { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(8,16,32,0.45); cursor: pointer; background: none; border: none; font-family: 'Satoshi', sans-serif; padding: 0; }
  .journal-history-btn:hover { color: rgba(8,16,32,0.7); }

  .diary-overlay { position: absolute; inset: 0; z-index: 9998; background: rgba(8,16,32,0.5); backdrop-filter: blur(6px); animation: journalFadeIn 0.35s ease; touch-action: none; transition: opacity 0.45s ease; }
  .diary-overlay.closing { opacity: 0; }
  .diary-sheet { position: absolute; bottom: 0; left: 0; right: 0; top: 8%; z-index: 9999; background: #F5EDE4; border-radius: 24px 24px 0 0; display: flex; flex-direction: column; animation: journalSlideUp 0.35s cubic-bezier(0.36, 1.3, 0.64, 1); box-shadow: 0 -4px 40px rgba(8,16,32,0.2); overflow: hidden; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease; }
  .diary-sheet.closing { transform: translateY(110%); opacity: 0; transition: transform 0.5s cubic-bezier(0.6, -0.28, 0.74, 0.05), opacity 0.4s ease; }
  .diary-drag-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(8,16,32,0.15); margin: 10px auto 6px; flex-shrink: 0; cursor: grab; }
  .diary-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px 14px; flex-shrink: 0; }
  .diary-title { font-family: 'Fraunces', serif; font-size: 22px; color: #0C1A35; font-weight: 600; }
  .diary-close { background: none; border: none; cursor: pointer; padding: 4px; font-size: 13px; color: rgba(8,16,32,0.4); font-family: 'Satoshi', sans-serif; font-weight: 500; }
  .diary-counter { font-size: 11px; color: rgba(8,16,32,0.3); text-align: center; flex-shrink: 0; padding-bottom: 10px; }

  .diary-page-area { flex: 1; position: relative; overflow: hidden; touch-action: none; }
  .diary-page {
    position: absolute; inset: 12px 16px 16px; display: flex; flex-direction: column;
    background: #FDF8F2; border-radius: 18px; padding: 28px 24px 24px;
    border: 1px solid rgba(8,16,32,0.06);
    box-shadow: 0 2px 8px rgba(8,16,32,0.05), 0 8px 30px rgba(8,16,32,0.03);
    transition: transform 0.35s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease;
  }
  .diary-page::before {
    content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
    background: linear-gradient(to bottom, #8B5CF6, #C4A7E7);
    border-radius: 3px 0 0 3px; opacity: 0.5;
  }
  .diary-page-date { font-size: 13px; color: #8B5CF6; font-weight: 600; font-family: 'Space Mono', monospace; margin-bottom: 4px; }
  .diary-page-weekday { font-family: 'Fraunces', serif; font-size: 20px; color: #0C1A35; font-weight: 600; margin-bottom: 16px; }
  .diary-page-prompt { font-size: 14px; color: rgba(8,16,32,0.45); font-style: italic; line-height: 1.6; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(8,16,32,0.06); }
  .diary-page-text { font-size: 15px; color: #0C1A35; line-height: 1.7; flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .diary-page-text::-webkit-scrollbar { display: none; }
  .diary-empty { text-align: center; padding: 60px 20px; color: rgba(8,16,32,0.3); font-size: 14px; font-style: italic; }

  .diary-scrub-hint { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 10px; color: rgba(8,16,32,0.2); pointer-events: none; letter-spacing: 0.5px; transition: opacity 0.3s; }

  .diary-date-toast { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(8,16,32,0.85); color: #FDF2E8; font-family: 'Space Mono', monospace; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 12px; pointer-events: none; z-index: 10; animation: diaryToastIn 0.15s ease; }
  @keyframes diaryToastIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

  .journal-auth-card { background: rgba(253,242,232,0.55); backdrop-filter: blur(8px); border-radius: 24px; padding: 24px 20px; border: 1.5px solid #FDF2E8; text-align: center; }
  .journal-auth-title { font-family: 'Satoshi', sans-serif; font-size: 15px; color: #0C1A35; margin-bottom: 4px; font-weight: 600; }
  .journal-auth-sub { font-size: 12px; color: rgba(8,16,32,0.4); margin-bottom: 16px; }
  .journal-auth-input { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1.5px solid rgba(8,16,32,0.12); background: rgba(255,255,255,0.5); color: #0C1A35; font-size: 13px; font-family: 'Satoshi', sans-serif; outline: none; margin-bottom: 8px; }
  .journal-auth-input:focus { border-color: rgba(8,16,32,0.3); }
  .journal-auth-input::placeholder { color: rgba(8,16,32,0.25); }
  .journal-auth-btn { width: 100%; padding: 10px; border-radius: 12px; border: none; background: #FFD166; color: #023047; font-size: 13px; font-weight: 600; font-family: 'Satoshi', sans-serif; cursor: pointer; }
  .journal-auth-btn:hover { background: #FFBC42; }
  .journal-auth-err { font-size: 11px; color: #FF6B6B; margin-top: 8px; }

  /* ── YOUTUBE ── */
  .yt-card { background: rgba(253,242,232,0.55); backdrop-filter: blur(8px); border-radius: 20px; overflow: hidden; border: 1.5px solid #FDF2E8; margin: 0 20px 10px; cursor: pointer; }
  .yt-card-inner { display: flex; gap: 12px; padding: 12px; }
  .yt-thumb-wrap { position: relative; width: 140px; height: 79px; border-radius: 12px; overflow: hidden; flex-shrink: 0; background: #0C1A35; }
  .yt-thumb { width: 100%; height: 100%; object-fit: cover; }
  .yt-play-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.25); opacity: 0; transition: opacity 0.2s; }
  .yt-card:hover .yt-play-icon { opacity: 1; }
  .yt-card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .yt-channel-row { display: flex; align-items: center; gap: 6px; }
  .yt-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .yt-channel-name { font-size: 11px; color: rgba(8,16,32,0.45); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yt-video-title { font-size: 13px; color: #0C1A35; font-weight: 500; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .yt-new-badge { display: inline-block; font-size: 9px; font-weight: 700; color: #FF0000; background: rgba(255,0,0,0.08); padding: 1px 6px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase; margin-left: 6px; vertical-align: middle; }
  .yt-time { font-size: 10px; color: rgba(8,16,32,0.3); }
  .yt-section-header { display: flex; align-items: center; gap: 8px; padding: 12px 20px 6px; }
  .yt-section-label { font-size: 10px; color: rgba(8,16,32,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }

  .yt-add-wrap { padding: 0 20px; margin-bottom: 8px; }
  .yt-add-row { display: flex; gap: 8px; }
  .yt-add-input { flex: 1; padding: 10px 14px; border-radius: 12px; border: 1.5px solid rgba(8,16,32,0.12); background: rgba(255,255,255,0.5); color: #0C1A35; font-size: 13px; font-family: 'Satoshi', sans-serif; outline: none; }
  .yt-add-input:focus { border-color: rgba(8,16,32,0.3); }
  .yt-add-input::placeholder { color: rgba(8,16,32,0.25); }
  .yt-add-btn { padding: 10px 16px; border-radius: 12px; border: none; background: #FF0000; color: #fff; font-size: 12px; font-weight: 600; font-family: 'Satoshi', sans-serif; cursor: pointer; white-space: nowrap; }
  .yt-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .yt-add-err { font-size: 11px; color: #FF6B6B; margin-top: 4px; padding: 0 20px; }
  .yt-channel-list { padding: 0 20px; }
  .yt-channel-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(8,16,32,0.06); }
  .yt-channel-item:last-child { border-bottom: none; }
  .yt-channel-item-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .yt-channel-item-name { font-size: 13px; color: #0C1A35; font-weight: 500; flex: 1; }
  .yt-channel-remove { background: none; border: none; cursor: pointer; padding: 4px; }

  .yt-player-overlay { position: absolute; inset: 0; z-index: 9998; background: rgba(8,16,32,0.7); backdrop-filter: blur(6px); animation: journalFadeIn 0.35s ease; touch-action: none; transition: opacity 0.45s ease; }
  .yt-player-overlay.closing { opacity: 0; }
  .yt-player-sheet { position: absolute; bottom: 0; left: 0; right: 0; z-index: 9999; background: #0C1A35; border-radius: 24px 24px 0 0; display: flex; flex-direction: column; animation: journalSlideUp 0.35s cubic-bezier(0.36, 1.3, 0.64, 1); transition: transform 0.5s cubic-bezier(0.6, -0.28, 0.74, 0.05), opacity 0.4s ease; }
  .yt-player-sheet.closing { transform: translateY(110%); opacity: 0; }
  .yt-player-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(253,242,232,0.2); margin: 10px auto 8px; flex-shrink: 0; cursor: grab; }
  .yt-player-video { width: 100%; aspect-ratio: 16/9; border-radius: 0; border: none; background: #000; }
  .yt-player-info { padding: 16px 20px 32px; }
  .yt-player-title { font-family: 'Satoshi', sans-serif; font-size: 15px; color: #FDF2E8; font-weight: 500; line-height: 1.4; margin-bottom: 8px; }
  .yt-player-channel { display: flex; align-items: center; gap: 8px; }
  .yt-player-channel img { width: 24px; height: 24px; border-radius: 50%; }
  .yt-player-channel-name { font-size: 13px; color: rgba(253,242,232,0.5); }
  .yt-player-open-yt { font-size: 11px; color: rgba(253,242,232,0.35); margin-top: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .yt-player-open-yt:hover { color: rgba(253,242,232,0.6); }

  /* ── SETTINGS ── */
  .profile-bg { min-height: 100%; background: transparent; padding-bottom: 32px; }
  .profile-header { padding: 16px 24px 20px; }
  .profile-top { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
  .profile-avatar-large { width: 64px; height: 64px; border-radius: 50%; background: #023047; display: flex; align-items: center; justify-content: center; }
  .profile-name { font-family: 'Satoshi', sans-serif; font-size: 23.5px; color: #FDF2E8; -webkit-text-fill-color: #FDF2E8; }
  .profile-streak { font-size: 13.5px; color: rgba(253,242,232,0.6); margin-top: 3px; }
  .profile-streak span { color: #FFBC42; font-weight: 600; }

  .section-label { font-size: 10px; color: #FDF2E8; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 0 24px; margin-bottom: 10px; margin-top: 20px; display: block; }

  .setting-row { margin: 0 20px 8px; background: rgba(255,255,255,0.62); backdrop-filter: blur(8px); border-radius: 16px; padding: 14px 16px; box-shadow: 0 0 0 1px rgba(255,209,102,0.3), 0 2px 10px rgba(2,48,71,0.05); display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
  .setting-left { display: flex; align-items: center; gap: 12px; }
  .setting-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(33,158,188,0.12); display: flex; align-items: center; justify-content: center; }
  .setting-name { font-size: 14px; color: #023047; }
  .setting-value { font-size: 12px; color: #5a9ab5; margin-top: 2px; }
  .setting-arrow { font-size: 16px; color: #8ec5d9; }

  .toggle { width: 44px; height: 26px; border-radius: 13px; position: relative; cursor: pointer; transition: background 0.2s; }
  .toggle.on { background: #023047; }
  .toggle.off { background: rgba(2,48,71,0.15); }
  .toggle-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; position: absolute; top: 3px; transition: left 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
  .toggle.on .toggle-thumb { left: 21px; }
  .toggle.off .toggle-thumb { left: 3px; }

  .subreddit-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px; }
  .sub-chip { padding: 7px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; border: 1px solid; cursor: pointer; transition: all 0.2s; }
  .sub-chip.on { background: #023047; border-color: #023047; color: #8ECAE6; }
  .sub-chip.off { background: rgba(255,255,255,0.6); border-color: rgba(2,48,71,0.15); color: #5a9ab5; }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.35s ease forwards; }
  .fade-up-1 { animation-delay: 0.04s; opacity: 0; }
  .fade-up-2 { animation-delay: 0.08s; opacity: 0; }
  .fade-up-3 { animation-delay: 0.12s; opacity: 0; }
  .fade-up-4 { animation-delay: 0.16s; opacity: 0; }
  .fade-up-5 { animation-delay: 0.20s; opacity: 0; }
  .fade-up-6 { animation-delay: 0.24s; opacity: 0; }

  /* ── REDDIT FEED ── */
  .feed-image { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
  .feed-no-image { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

  .feed-small-img { width: 80px; height: 100%; min-height: 80px; border-radius: 0; object-fit: cover; flex-shrink: 0; display: block; }
  .feed-small-placeholder { width: 80px; min-height: 80px; border-radius: 0; background: rgba(33,158,188,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .feed-category-badge { font-size: 10px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; padding: 2px 7px; border-radius: 8px; background: rgba(33,158,188,0.12); color: #219EBC; border: 1px solid currentColor; }

  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
  .skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.25) 25%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.25) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }
  .skeleton-card { margin: 12px 20px 0; background: rgba(255,255,255,0.62); border-radius: 20px; overflow: hidden; }
  .skeleton-img { height: 160px; }
  .skeleton-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .skeleton-line { height: 12px; }
  .skeleton-line-short { width: 60%; }
  .skeleton-line-long { width: 100%; }
  .skeleton-line-mid { width: 80%; }

  .feed-error { margin: 20px; padding: 16px; background: rgba(255,255,255,0.6); border-radius: 16px; text-align: center; }
  .feed-error-text { font-size: 13px; color: #5a9ab5; line-height: 1.5; }
  .feed-retry-btn { margin-top: 10px; background: #023047; color: #8ECAE6; border: none; border-radius: 12px; padding: 8px 20px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Satoshi', sans-serif; }
  .feed-empty { margin: 32px 20px; text-align: center; color: #5a9ab5; font-size: 13px; line-height: 1.6; }

  /* ── VIDEO PLAYER ── */
  .video-wrap { position: relative; width: 100%; background: #000; min-height: 280px; display: flex; align-items: center; }
  .video-wrap video { width: 100%; display: block; max-height: 420px; object-fit: contain; }
  .video-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.3); cursor: pointer; transition: opacity 0.2s;
  }
  .video-overlay:hover { opacity: 0.85; }
  .video-play-btn {
    width: 56px; height: 56px; border-radius: 50%;
    background: rgba(255,255,255,0.92); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .video-play-triangle {
    width: 0; height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-left: 18px solid #023047;
    margin-left: 4px;
  }
  .video-card-badge {
    position: absolute; top: 10px; right: 10px; z-index: 3;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    border-radius: 8px; padding: "4px 8px";
    display: flex; align-items: center; gap: 4px;
    font-size: 10px; color: #fff; font-weight: 600; letter-spacing: 0.5px;
    padding: 4px 9px;
  }
  .video-no-audio { font-size: 9px; color: rgba(255,255,255,0.5); margin-top: 2px; }

  /* ── ACCORDION ── */
  .accordion { margin: 0 20px 8px; border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.62); backdrop-filter: blur(8px); box-shadow: 0 0 0 1px rgba(255,209,102,0.3), 0 2px 10px rgba(2,48,71,0.05); }
  .accordion-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; cursor: pointer; user-select: none; }
  .accordion-header:active { opacity: 0.8; }
  .accordion-left { display: flex; align-items: center; gap: 10px; }
  .accordion-title { font-size: 13px; font-weight: 600; color: #023047; }
  .accordion-counts { font-size: 11px; color: #8ec5d9; }
  .accordion-chevron { font-size: 12px; color: #8ec5d9; transition: transform 0.22s ease; display: inline-block; }
  .accordion-chevron.open { transform: rotate(180deg); }
  .accordion-body { padding: 0 12px 12px; display: flex; flex-wrap: wrap; gap: 7px; }
  @keyframes accordionOpen { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .accordion-body-animate { animation: accordionOpen 0.2s ease forwards; }

  /* ── IN-APP READER ── */
  .reader-sheet {
    position: absolute; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    background: #f7f1e8; border-radius: 48px; overflow: hidden;
    animation: sheetUp 0.32s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  }
  .reader-sheet.closing { animation: sheetDown 0.26s cubic-bezier(0.32, 0, 0.67, 0) forwards; }

  .reader-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 10px; flex-shrink: 0;
    border-bottom: 1px solid rgba(139,90,43,0.1);
    background: rgba(247,241,232,0.97); backdrop-filter: blur(10px);
    z-index: 10;
  }
  /* When reader has fullscreen media, topbar floats over it */
  .reader-topbar-overlay {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 10px; flex-shrink: 0;
    position: sticky; top: 0; left: 0; right: 0; z-index: 10;
    background: rgba(0,0,0,0.35); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .reader-topbar-overlay .reader-source-pill {
    background: rgba(255,255,255,0.15) !important; color: #fff !important;
  }
  .reader-topbar-overlay .reader-source-pill span[style] { filter: brightness(1.8); }
  .reader-topbar-overlay .reader-close {
    background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9);
  }
  .reader-topbar-overlay button { color: rgba(255,255,255,0.7) !important; }
  .reader-source-pill {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 20px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
  }
  .reader-close {
    background: rgba(139,90,43,0.1); border: none; border-radius: 20px;
    padding: 6px 14px; font-family: 'Satoshi', sans-serif;
    font-size: 12px; font-weight: 600; color: rgba(42,74,90,0.7);
    cursor: pointer; transition: all 0.15s;
  }
  .reader-close:active { transform: scale(0.95); }

  .reader-scroll {
    flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
  }
  .reader-scroll::-webkit-scrollbar { display: none; }

  .reader-hero-img {
    width: 100%; min-height: 520px; max-height: 712px; object-fit: contain; display: block;
    background: #0a1a24;
  }
  .reader-hero-placeholder {
    width: 100%; height: 160px;
    display: flex; align-items: center; justify-content: center;
    font-size: 48px;
  }

  .reader-body { padding: 22px 22px 8px; }
  .reader-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .reader-meta-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; color: #8a7060; text-transform: uppercase; }
  .reader-meta-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(139,90,43,0.3); }

  /* Serif title for editorial feel */
  .reader-title {
    font-family: 'Playfair Display', 'Georgia', serif; font-size: 22px; font-weight: 700;
    color: #1a2e3a; line-height: 1.3; margin-bottom: 14px;
    letter-spacing: -0.2px;
  }

  /* Pull-quote style for summary */
  .reader-summary {
    font-size: 14px; color: #3d5a6a; line-height: 1.75; margin-bottom: 18px;
    padding: 14px 16px; border-left: 4px solid #FFD166;
    background: rgba(255,209,102,0.08); border-radius: 0 10px 10px 0;
    font-style: italic;
  }

  .reader-stats-collapsed {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-radius: 12px; margin-top: 4px;
    background: rgba(2,48,71,0.05);
    transition: background 0.15s;
  }
  .reader-stats-collapsed:active { background: rgba(2,48,71,0.1); }
  .reader-stats-inline { font-size: 12px; color: #5a7a8a; font-weight: 500; }
  .reader-stats-chevron { font-size: 16px; color: #8a9ab5; transition: transform 0.2s; line-height: 1; }

  .reader-stats {
    display: flex; gap: 0; padding: 0; margin-bottom: 20px;
    background: rgba(2,48,71,0.04); border-radius: 14px; overflow: hidden;
  }
  .reader-stat {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    gap: 3px; padding: 12px 8px;
    border-right: 1px solid rgba(2,48,71,0.07);
  }
  .reader-stat:last-child { border-right: none; }
  .reader-stat-val { font-size: 16px; font-weight: 700; color: #023047; font-family: 'Satoshi', sans-serif; }
  .reader-stat-label { font-size: 9px; color: #8a9ab5; letter-spacing: 0.6px; text-transform: uppercase; }

  /* Comments section header */
  .reader-section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: #8a7060; margin-bottom: 0; padding: 16px 22px 12px;
    display: flex; align-items: center; gap: 8px;
  }
  .reader-section-label::after {
    content: ''; flex: 1; height: 1px; background: rgba(139,90,43,0.15);
  }

  /* Comment thread redesign with avatar initials */
  .comment {
    padding: 14px 22px; border-bottom: 1px solid rgba(139,90,43,0.07);
    display: flex; gap: 10px; align-items: flex-start;
  }
  .comment-avatar {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #219EBC, #023047);
    margin-top: 1px;
  }
  .comment-avatar.op-avatar { background: linear-gradient(135deg, #FFD166, #FFBC42); color: #023047; }
  .comment-content { flex: 1; min-width: 0; }
  .comment-author {
    font-size: 11px; font-weight: 700; color: #2a5f7a; margin-bottom: 4px;
    display: flex; align-items: center; gap: 6px;
  }
  .comment-score { font-size: 10px; color: #aec5d9; font-weight: 400; }
  .comment-body { font-size: 13px; color: #3d5a6a; line-height: 1.65; }
  .comment-body.op { color: #1a2e3a; font-weight: 500; }

  .reader-loading { display: flex; align-items: center; justify-content: center; padding: 32px; }
  .reader-loading-text { font-size: 13px; color: #8ec5d9; letter-spacing: 1px; }

  .reader-open-web {
    margin: 16px 22px 28px; background: #023047; border: none; border-radius: 16px;
    padding: 14px; width: calc(100% - 44px); font-family: 'Satoshi', sans-serif;
    font-size: 13px; font-weight: 600; color: #8ECAE6;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    gap: 7px; transition: opacity 0.2s;
    box-shadow: 0 4px 14px rgba(2,48,71,0.18);
  }
  .reader-open-web:active { opacity: 0.8; }

`;

// ── WORDLE CSS ─────────────────────────────────────────────
const wordleCss = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');

  .wordle-sheet {
    position: absolute; inset: 0; z-index: 100;
    display: flex; flex-direction: column;
    background: #f5ede0; border-radius: 48px; overflow: hidden;
    animation: sheetUp 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  }
  @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .wordle-sheet.closing { animation: sheetDown 0.28s cubic-bezier(0.32, 0, 0.67, 0) forwards; }
  @keyframes sheetDown { from { transform: translateY(0); } to { transform: translateY(100%); } }

  .ws-handle-bar { display: flex; align-items: center; justify-content: center; padding: 10px 0 4px; flex-shrink: 0; position: relative; }
  .ws-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(139,90,43,0.25); }
  .ws-close {
    position: absolute; top: 10px; right: 16px;
    background: rgba(139,90,43,0.1); border: none; border-radius: 20px;
    padding: 6px 14px; font-family: 'Satoshi', sans-serif;
    font-size: 12px; font-weight: 600; color: rgba(42,74,90,0.7);
    cursor: pointer; transition: all 0.15s; letter-spacing: 0.5px;
  }
  .ws-close:active { transform: scale(0.95); }

  .wordle-loading { flex: 1; display: flex; align-items: center; justify-content: center; font-family: 'Satoshi', sans-serif; font-size: 14px; color: rgba(42,74,90,0.5); letter-spacing: 1px; }

  .wordle-game { flex: 1; display: flex; flex-direction: column; overflow-y: auto; scrollbar-width: none; }
  .wordle-game::-webkit-scrollbar { display: none; }

  .wg-header { padding: 4px 24px 12px; text-align: center; border-bottom: 1px solid rgba(139,90,43,0.15); }
  .wg-ornament { font-size: 10px; color: rgba(139,90,43,0.5); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 2px; }
  .wg-title {
    font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 900;
    background: linear-gradient(90deg, #fff8e7 0%, #FFD166 50%, #FFBC42 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    letter-spacing: 6px; text-transform: uppercase;
    filter: drop-shadow(0 1px 2px rgba(139,90,43,0.3));
  }
  .wg-sub { font-size: 10px; color: rgba(42,74,90,0.55); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px; }
  .wg-divider { display: flex; align-items: center; gap: 8px; margin-top: 8px; justify-content: center; }
  .wg-dline { flex: 1; max-width: 60px; height: 1px; background: linear-gradient(90deg, transparent, rgba(139,90,43,0.3), transparent); }
  .wg-ddot { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,188,66,0.6); }

  .wg-area { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8px 20px 8px; gap: 10px; width: 100%; }

  .w-toast { background: rgba(2,48,71,0.88); color: #FFD166; font-size: 13px; font-weight: 600; letter-spacing: 1px; padding: 8px 20px; border-radius: 20px; text-align: center; backdrop-filter: blur(8px); border: 1px solid rgba(255,209,102,0.2); min-height: 34px; display: flex; align-items: center; justify-content: center; width: 100%; max-width: 280px; }
  .w-toast-hidden { opacity: 0; }

  .w-grid { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .w-grid-row { display: flex; justify-content: center; gap: 6px; }

  .w-tile { width: 54px; height: 54px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-size: 25px; font-weight: 700; position: relative; overflow: hidden; transition: transform 0.1s ease; cursor: default; user-select: none; }
  .w-tile-empty { background: rgba(255,255,255,0.25); border: 1.5px solid rgba(139,90,43,0.2); box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.08); }
  .w-tile-active { background: rgba(255,255,255,0.45); border: 1.5px solid rgba(255,188,66,0.5); box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 2px rgba(255,209,102,0.15), 0 2px 6px rgba(0,0,0,0.1); color: #1a3a50; }
  @keyframes w-pop { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
  .w-tile-pop { animation: w-pop 0.1s ease; }
  @keyframes w-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
  .w-row-shake { animation: w-shake 0.4s ease; }
  .w-tile-revealed { border: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.2); color: #f5ede0; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
  .w-tile-revealed::before { content: ''; position: absolute; inset: 0; background-image: repeating-linear-gradient(88deg, transparent 0px, rgba(255,255,255,0.04) 1px, transparent 2px, transparent 5px); border-radius: 10px; }
  .w-tile-correct { background: linear-gradient(135deg, #5C7A3E 0%, #7A9E52 40%, #4E6A32 100%); border: 2.5px solid #A8CC7A; color: #f5ede0; text-shadow: 0 1px 2px rgba(0,0,0,0.3); box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 0 10px rgba(122,158,82,0.5), 0 2px 8px rgba(92,122,62,0.4); }
  .w-tile-present { background: linear-gradient(135deg, #FFBC42 0%, #FFD166 40%, #fff8e7 100%); border: 2.5px solid #D4920A; color: #2a4a5a; text-shadow: 0 1px 1px rgba(255,255,255,0.4); box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 0 10px rgba(212,146,10,0.4), 0 2px 8px rgba(212,146,10,0.3); }
  .w-tile-absent { background: linear-gradient(135deg, #3A2E24 0%, #4A3C30 40%, #2E2418 100%); color: rgba(245,237,224,0.85); }
  @keyframes w-bounce { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-12px); } 60% { transform: translateY(-6px); } }
  .w-tile-win { animation: w-bounce 0.6s ease forwards; }

  .w-keyboard { width: 100%; display: flex; flex-direction: column; gap: 5px; padding: 0 10px 16px; flex-shrink: 0; }
  .w-kb-action { display: flex; justify-content: center; gap: 8px; padding: 0 8px; }
  .w-key-enter, .w-key-delete { flex: 1; height: 44px; border-radius: 10px; border: none; font-family: 'Satoshi', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; letter-spacing: 1.5px; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 6px; position: relative; overflow: hidden; transition: all 0.15s ease; }
  .w-key-enter:active, .w-key-delete:active { transform: scale(0.96); }
  .w-key-enter { background: linear-gradient(135deg, #fff8e7 0%, #FFD166 55%, #FFBC42 100%); color: #2a4a5a; box-shadow: 0 0 0 1px rgba(255,188,66,0.4), 0 3px 10px rgba(255,188,66,0.3), inset 0 1px 0 rgba(255,255,255,0.7); }
  .w-key-delete { background: linear-gradient(135deg, #3A2E24 0%, #4A3C30 40%, #2E2418 100%); color: rgba(245,237,224,0.85); box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 3px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08); }
  .w-kb-row { display: flex; justify-content: center; gap: 4px; }
  .w-key { height: 44px; min-width: 30px; flex: 1; max-width: 36px; padding: 0 2px; border-radius: 8px; border: none; font-family: 'Satoshi', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; letter-spacing: 0.3px; }
  .w-key:active { transform: scale(0.94); }
  .w-key-default { background: linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.3) 100%); color: #1a3a50; box-shadow: 0 0 0 1px rgba(139,90,43,0.18), 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5); }
  .w-key-correct { background: linear-gradient(135deg, #5C7A3E 0%, #7A9E52 100%); color: #f5ede0; border: none; box-shadow: 0 2px 8px rgba(92,122,62,0.4); }
  .w-key-present { background: linear-gradient(135deg, #FFBC42 0%, #FFD166 60%, #fff8e7 100%); color: #2a4a5a; border: none; box-shadow: 0 2px 8px rgba(212,146,10,0.3); }
  .w-key-absent { background: linear-gradient(135deg, #3A2E24 0%, #4A3C30 100%); color: rgba(245,237,224,0.55); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

  .w-result { background: rgba(255,255,255,0.55); backdrop-filter: blur(12px); border-radius: 20px; padding: 20px; text-align: center; box-shadow: 0 0 0 1px rgba(255,209,102,0.3), 0 8px 24px rgba(0,0,0,0.12); width: 100%; max-width: 300px; }
  .w-result-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; background: linear-gradient(90deg, #fff8e7 0%, #FFD166 50%, #FFBC42 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: 2px; text-transform: uppercase; }
  .w-result-word { font-family: 'Playfair Display', serif; font-size: 14px; color: #4a6a7a; margin-top: 6px; letter-spacing: 3px; }
  .w-result-word span { font-weight: 700; color: #2a4a5a; letter-spacing: 4px; }
  .w-result-next { font-size: 11px; color: rgba(42,74,90,0.5); margin-top: 10px; letter-spacing: 0.5px; }
  .w-play-again { margin-top: 14px; background: linear-gradient(135deg, #fff8e7 0%, #FFD166 60%, #FFBC42 100%); border: none; border-radius: 14px; padding: 10px 24px; font-family: 'Satoshi', sans-serif; font-size: 13px; font-weight: 700; color: #2a4a5a; cursor: pointer; letter-spacing: 1px; text-transform: uppercase; box-shadow: 0 2px 8px rgba(255,188,66,0.3); transition: opacity 0.2s; }
  .w-play-again:active { opacity: 0.8; }

  .w-legend { display: flex; gap: 12px; justify-content: center; padding: 0 20px 4px; flex-wrap: wrap; }
  .w-legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: rgba(42,74,90,0.6); letter-spacing: 0.3px; }
  .w-swatch { width: 12px; height: 12px; border-radius: 3px; }
  .w-swatch-correct { background: linear-gradient(135deg, #5C7A3E, #7A9E52); }
  .w-swatch-present { background: linear-gradient(135deg, #FFBC42, #fff8e7); border: 1px solid rgba(212,146,10,0.3); }
  .w-swatch-absent { background: linear-gradient(135deg, #3A2E24, #4A3C30); }

  /* Home Wordle Card */
  .wordle-card { background: #023047; border-radius: 24px; padding: 18px 20px; cursor: pointer; transition: transform 0.15s ease; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 8px 32px rgba(0,20,60,0.25), 0 1px 3px rgba(8,20,50,0.06); border: 1.5px solid #FDF2E8; }
  .wordle-card:active { transform: scale(0.98); }
  .wc-left { display: flex; flex-direction: column; gap: 3px; }
  .wc-label { font-size: 10px; color: #FFD166; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .wc-title { font-family: 'Playfair Display', serif; font-size: 22px; color: #FDF2E8; font-weight: 900; letter-spacing: 3px; }
  .wc-date { font-size: 11px; color: rgba(253,242,232,0.5); margin-top: 2px; letter-spacing: 0.5px; }
  .wc-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .wc-play { font-size: 12px; color: rgba(253,242,232,0.6); font-weight: 600; letter-spacing: 0.5px; }
  .wc-tiles { display: flex; gap: 4px; }
  .wc-tile { width: 18px; height: 18px; border-radius: 4px; background: rgba(255,255,255,0.15); }
  .wc-tile-amber { background: #FFD166; }
  .wc-tile-green { background: #7A9E52; }
  .wc-tile-dark { background: rgba(255,255,255,0.1); }
`;

// ── SVG ICONS ─────────────────────────────────────────────
const Icon = {
  Sun: ({ size = 28, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: ({ size = 36, color = "#023047" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Calendar: ({ size = 20, color = "#023047" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Image: ({ size = 56, color = "rgba(142,202,230,0.2)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  Leaf: ({ size = 48, color = "rgba(142,202,230,0.25)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8C8 10 5.9 16.17 3.82 19.34L4.5 20l.68-.68C6.5 18 9.27 16.2 12 15c3-1.36 6-3 8-7-1 0-2.07.1-3 0z"/>
      <path d="M3.82 19.36C2.68 21.06 2 22 2 22"/>
    </svg>
  ),
  Feather: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>
    </svg>
  ),
  Play: ({ size = 22, color = "#FDF2E8" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  YouTube: ({ size = 22, color = "#FF0000" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z"/>
    </svg>
  ),
  X: ({ size = 22, color = "#0C1A35" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Plus: ({ size = 22, color = "#0C1A35" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  ChevronLeft: ({ size = 22, color = "#0C1A35" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  Basketball: ({ size = 22, color = "rgba(234,244,251,0.7)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M4.93 4.93C6.27 8.27 6.27 15.73 4.93 19.07"/>
      <path d="M19.07 4.93C17.73 8.27 17.73 15.73 19.07 19.07"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  Stars: ({ size = 22, color = "rgba(234,244,251,0.7)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Heart: ({ size = 22, color = "rgba(234,244,251,0.7)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  Home: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 L12 3 L21 10.5 L21 20 Q21 21 20 21 L4 21 Q3 21 3 20 Z"/>
      <path d="M8.5 10 L12 6.5 L15.5 10"/>
      <rect x="9.5" y="14.5" width="5" height="6.5" rx="1"/>
    </svg>
  ),
  Feed: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3.5" width="18" height="4.5" rx="2.25"/>
      <rect x="3" y="9.75" width="18" height="4.5" rx="2.25"/>
      <rect x="3" y="16" width="18" height="4.5" rx="2.25"/>
    </svg>
  ),
  Globe: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10.2"/>
      <circle cx="12" cy="12" r="6.2"/>
      <path d="M12 5.8 Q14.5 9 14.5 12 Q14.5 15 12 18.2"/>
      <path d="M12 5.8 Q9.5 9 9.5 12 Q9.5 15 12 18.2"/>
      <line x1="5.8" y1="10" x2="18.2" y2="10"/>
      <line x1="5.8" y1="12" x2="18.2" y2="12"/>
      <line x1="5.8" y1="14" x2="18.2" y2="14"/>
    </svg>
  ),
  Trophy: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2h10v-2c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  ),
  BookOpen: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  Settings: ({ size = 22, color = "#8ec5d9" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Bell: ({ size = 18, color = "#023047" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  User: ({ size = 28, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Sunrise: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0"/>
      <line x1="12" y1="2" x2="12" y2="9"/>
      <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/>
      <line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/>
      <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/>
      <polyline points="8 6 12 2 16 6"/>
    </svg>
  ),
  Cloud: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  ),
  CloudRain: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="16" y1="19" x2="16" y2="21"/>
    </svg>
  ),
  CloudSnow: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="20" x2="8" y2="20.01"/><line x1="12" y1="22" x2="12" y2="22.01"/><line x1="16" y1="20" x2="16" y2="20.01"/>
    </svg>
  ),
  CloudLightning: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/>
    </svg>
  ),
  CloudDrizzle: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="12" y1="21" x2="12" y2="23"/>
    </svg>
  ),
  Wind: ({ size = 22, color = "#EAF4FB" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
    </svg>
  ),
  Painting: ({ size = 56, color = "rgba(142,202,230,0.18)" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
    </svg>
  ),
  Check: ({ size = 13, color = "#023047" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Turtle: ({ size = 18, color = "#023047" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4a8 8 0 1 0 0 16A8 8 0 0 0 12 4z"/>
      <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
};

// ── STARS (for globe bg) ───────────────────────────────────
function Stars() {
  const s = useRef(Array.from({ length: 70 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, r: Math.random() * 1.1 + 0.3, o: Math.random() * 0.45 + 0.1 })));
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {s.current.map((p, i) => <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r={p.r} fill="#8ECAE6" opacity={p.o} />)}
    </svg>
  );
}

const GDOTS = [
  { top: "38%", left: "28%" }, { top: "44%", left: "32%" }, { top: "52%", left: "40%" },
  { top: "35%", left: "55%" }, { top: "42%", left: "60%" }, { top: "30%", left: "48%" },
  { top: "60%", left: "52%" }, { top: "48%", left: "44%" }, { top: "36%", left: "36%" }, { top: "56%", left: "45%" },
];

function Toggle({ on, onToggle }) {
  return (
    <div className={`toggle ${on ? "on" : "off"}`} onClick={onToggle}>
      <div className="toggle-thumb" />
    </div>
  );
}

// ── POLL DATA ─────────────────────────────────────────────
const DEFAULT_POLL_OPTIONS = [
  { label: "Calm & rested", votes: 1240 },
  { label: "Hopeful", votes: 980 },
  { label: "Ready to go", votes: 620 },
  { label: "Still waking up", votes: 870 },
  { label: "Grateful", votes: 730 },
];
const DEFAULT_POLL_QUESTION = "How are you waking up?";

function useTodaysPoll() {
  const [poll, setPoll] = useState({ loading: true, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `poll-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { setPoll({ loading: false, question: cached.question, options: cached.options }); return; }
    } catch {}

    (async () => {
      try {
        const snap = await getDoc(doc(db, "polls", today));
        if (snap.exists()) {
          const data = snap.data();
          const options = data.options.map((label, i) => ({
            label,
            votes: Math.floor(Math.random() * 800) + 200, // simulated votes for display
          }));
          localStorage.setItem(cacheKey, JSON.stringify({ question: data.question, options }));
          setPoll({ loading: false, question: data.question, options });
        } else {
          setPoll({ loading: false, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });
        }
      } catch {
        setPoll({ loading: false, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });
      }
    })();
  }, []);

  return poll;
}

// ── WORDLE LOGIC ──────────────────────────────────────────
// Word lists are fetched from a free public CDN at runtime.
// This keeps the file size tiny. The lists are cached in memory
// after first load so there's no delay on subsequent opens.

const KEYBOARD_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];

const getLetterStates = (guess, answer) => {
  const result = Array(5).fill("absent");
  const answerArr = answer.split("");
  const guessArr = guess.split("");
  const used = Array(5).fill(false);
  guessArr.forEach((l, i) => { if (l === answerArr[i]) { result[i] = "correct"; used[i] = true; } });
  guessArr.forEach((l, i) => {
    if (result[i] === "correct") return;
    const j = answerArr.findIndex((a, idx) => a === l && !used[idx]);
    if (j !== -1) { result[i] = "present"; used[j] = true; }
  });
  return result;
};

// Cached word data (persists across Wordle opens within session)
let cachedAnswers = null;
let cachedValid = null;

async function loadWordLists() {
  if (cachedAnswers && cachedValid) return { answers: cachedAnswers, valid: cachedValid };
  try {
    // Using the official Wordle answer list from a public GitHub repo
    const [answersRes, validRes] = await Promise.all([
      fetch("https://raw.githubusercontent.com/tabatkins/wordle-list/main/words"),
      fetch("https://raw.githubusercontent.com/tabatkins/wordle-list/main/words"),
    ]);
    const answersText = await answersRes.text();
    const words = answersText.trim().split("\n").map(w => w.trim().toUpperCase()).filter(w => w.length === 5);
    cachedAnswers = words;
    cachedValid = new Set(words);
    return { answers: words, valid: cachedValid };
  } catch {
    // Fallback: a small built-in list so the game always works
    const fallback = ["CRANE","SLATE","AUDIO","TRAIN","CLOUD","SHARP","BLAZE","CRIMP","FLOCK","GROAN","PLUMB","SWIRL","TROUT","VIVID","WRATH","YACHT","ZESTY","ABODE","BRISK","CHUNK"];
    cachedAnswers = fallback;
    cachedValid = new Set(fallback);
    return { answers: fallback, valid: cachedValid };
  }
}

function getTodaysWord(answers) {
  const start = new Date("2025-01-01");
  const today = new Date();
  const day = Math.floor((today - start) / 86400000);
  return answers[day % answers.length];
}

// ── WORDLE TILE ────────────────────────────────────────────
function WordleTile({ letter, state, animDelay = 0, winBounce = false, isNew = false }) {
  const [revealed, setRevealed] = useState(false);
  const [displayState, setDisplayState] = useState(null);

  useEffect(() => {
    if (state && state !== "tbd") {
      const t = setTimeout(() => { setRevealed(true); setDisplayState(state); }, animDelay);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
      setDisplayState(null);
    }
  }, [state, animDelay]);

  let cls = "w-tile ";
  if (!letter) cls += "w-tile-empty";
  else if (!revealed) cls += "w-tile-active" + (isNew ? " w-tile-pop" : "");
  else cls += `w-tile-revealed w-tile-${displayState}`;
  if (winBounce && revealed) cls += " w-tile-win";

  return (
    <div className={cls} style={winBounce && revealed ? { animationDelay: `${animDelay}ms` } : {}}>
      {letter}
    </div>
  );
}

// ── WORDLE GAME ───────────────────────────────────────────
function WordleGame() {
  const [wordData, setWordData] = useState(null); // { answer, valid }
  const [loading, setLoading] = useState(true);
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [gameState, setGameState] = useState("playing");
  const [toast, setToast] = useState("");
  const [shakeRow, setShakeRow] = useState(null);
  const [newLetterIdx, setNewLetterIdx] = useState(null);

  useEffect(() => {
    loadWordLists().then(({ answers, valid }) => {
      setWordData({ answer: getTodaysWord(answers), valid });
      setLoading(false);
    });
  }, []);

  const letterStates = {};
  guesses.forEach(({ word, states }) => {
    word.split("").forEach((l, i) => {
      const existing = letterStates[l];
      const s = states[i];
      if (!existing || s === "correct" || (s === "present" && existing === "absent")) letterStates[l] = s;
    });
  });

  const showToast = (msg, duration = 1800) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  };

  const submitGuess = useCallback(() => {
    if (!wordData) return;
    if (current.length !== 5) { showToast("Not enough letters"); setShakeRow(guesses.length); setTimeout(() => setShakeRow(null), 500); return; }
    if (!wordData.valid.has(current)) { showToast("Not a valid word"); setShakeRow(guesses.length); setTimeout(() => setShakeRow(null), 500); return; }
    const states = getLetterStates(current, wordData.answer);
    const newGuesses = [...guesses, { word: current, states }];
    setGuesses(newGuesses);
    setCurrent("");
    setNewLetterIdx(null);
    if (current === wordData.answer) {
      const msgs = ["Brilliant!","Magnificent!","Splendid!","Great!","Phew!","Lucky!"];
      setTimeout(() => { showToast(msgs[Math.min(guesses.length, 5)], 2500); setGameState("won"); }, 300);
    } else if (newGuesses.length === 6) {
      setTimeout(() => { showToast(wordData.answer, 3000); setGameState("lost"); }, 300);
    }
  }, [current, guesses, wordData]);

  const handleKey = useCallback((key) => {
    if (gameState !== "playing" || !wordData) return;
    if (key === "ENTER") { submitGuess(); return; }
    if (key === "⌫" || key === "BACKSPACE") { setCurrent(c => c.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && current.length < 5) {
      setNewLetterIdx(current.length);
      setCurrent(c => c + key);
    }
  }, [gameState, current, submitGuess, wordData]);

  useEffect(() => {
    const handler = (e) => handleKey(e.key.toUpperCase());
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  if (loading) return <div className="wordle-loading">Loading today's word…</div>;

  const grid = [];
  for (let r = 0; r < 6; r++) {
    const isSubmitted = r < guesses.length;
    const isCurrent = r === guesses.length;
    const row = [];
    for (let c = 0; c < 5; c++) {
      let letter = "", state = null, isNew = false;
      if (isSubmitted) { letter = guesses[r].word[c]; state = guesses[r].states[c]; }
      else if (isCurrent) { letter = current[c] || ""; state = letter ? "tbd" : null; isNew = c === newLetterIdx && letter !== ""; }
      row.push(<WordleTile key={c} letter={letter} state={state} animDelay={isSubmitted ? c * 220 : 0} winBounce={gameState === "won" && isSubmitted && r === guesses.length - 1} isNew={isNew} />);
    }
    grid.push(<div key={r} className={`w-grid-row${shakeRow === r ? " w-row-shake" : ""}`}>{row}</div>);
  }

  return (
    <div className="wordle-game">
      <div className="wg-header">
        <div className="wg-ornament">· Morning Scroll ·</div>
        <div className="wg-title">Wordle</div>
        <div className="wg-sub">Daily word · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
        <div className="wg-divider"><div className="wg-dline"/><div className="wg-ddot"/><div className="wg-dline"/></div>
      </div>
      <div className="wg-area">
        <div className={`w-toast${!toast ? " w-toast-hidden" : ""}`}>{toast || " "}</div>
        <div className="w-grid">{grid}</div>
        <div className="w-legend">
          <div className="w-legend-item"><div className="w-swatch w-swatch-correct"/><span>Correct</span></div>
          <div className="w-legend-item"><div className="w-swatch w-swatch-present"/><span>Wrong spot</span></div>
          <div className="w-legend-item"><div className="w-swatch w-swatch-absent"/><span>Not in word</span></div>
        </div>
        {gameState !== "playing" && (
          <div className="w-result">
            <div className="w-result-title">{gameState === "won" ? "Well Played" : "Better Luck"}</div>
            {gameState === "lost" && <div className="w-result-word">The word was <span>{wordData.answer}</span></div>}
            <div className="w-result-next">A new word arrives tomorrow at midnight</div>
            <button className="w-play-again" onClick={() => { setGuesses([]); setCurrent(""); setGameState("playing"); setToast(""); }}>Play Again</button>
          </div>
        )}
      </div>
      <div className="w-keyboard">
        <div className="w-kb-action">
          <button className="w-key-enter" onClick={() => handleKey("ENTER")}>↵ Enter</button>
          <button className="w-key-delete" onClick={() => handleKey("⌫")}>⌫ Delete</button>
        </div>
        {KEYBOARD_ROWS.map((row, ri) => (
          <div className="w-kb-row" key={ri}>
            {row.map(key => {
              const st = letterStates[key];
              return <button key={key} className={`w-key w-key-${st || "default"}`} onClick={() => handleKey(key)}>{key}</button>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HOME SCREEN ───────────────────────────────────────────
// ── ON THIS DAY HOOK ──────────────────────────────────────
// ── WEATHER HOOK ──────────────────────────────────────────
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8787';

// ── WEATHER CONDITION MAP ─────────────────────────────────
// All 22 Visual Crossing icon values, mapped to:
//   label     → friendly display string
//   icon      → Lucide icon component
//   bg        → CSS gradient for the widget background
const WEATHER_MAP = {
  'clear-day':             { label: 'Clear Skies',         icon: () => Icon.Sun,           bg: 'linear-gradient(135deg, #c47a20 0%, #e8a840 40%, #f5c862 100%)', effect: 'sunny' },
  'clear-night':           { label: 'Clear Night',         icon: () => Icon.Moon,          bg: 'linear-gradient(135deg, #081020 0%, #0C1A35 50%, #142848 100%)', effect: 'stars' },
  'partly-cloudy-day':     { label: 'Partly Cloudy',       icon: () => Icon.Cloud,         bg: 'linear-gradient(135deg, #4a7a9a 0%, #7a9ab0 50%, #c4a35a 100%)', effect: 'sunny' },
  'partly-cloudy-night':   { label: 'Partly Cloudy Night', icon: () => Icon.Cloud,         bg: 'linear-gradient(135deg, #0C1A35 0%, #1a3255 50%, #2a4a7a 100%)', effect: 'stars' },
  'cloudy':                { label: 'Overcast',            icon: () => Icon.Cloud,         bg: 'linear-gradient(135deg, #3a4a5a 0%, #5a6a78 50%, #7a8890 100%)', effect: null },
  'fog':                   { label: 'Foggy',               icon: () => Icon.Wind,          bg: 'linear-gradient(135deg, #4a5568 0%, #718096 50%, #a0aec0 100%)', effect: null },
  'wind':                  { label: 'Windy',               icon: () => Icon.Wind,          bg: 'linear-gradient(135deg, #2d4a6e 0%, #4a7a9b 50%, #7fb3cc 100%)', effect: null },
  'rain':                  { label: 'Rainy',               icon: () => Icon.CloudRain,     bg: 'linear-gradient(135deg, #1a2535 0%, #2a3d55 50%, #3a5570 100%)', effect: 'rain' },
  'showers-day':           { label: 'Rain Showers',        icon: () => Icon.CloudRain,     bg: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a7a 50%, #5a8fa8 100%)', effect: 'rain' },
  'showers-night':         { label: 'Overnight Showers',   icon: () => Icon.CloudRain,     bg: 'linear-gradient(135deg, #0d1f35 0%, #1a3050 50%, #2d4f6e 100%)', effect: 'rain' },
  'thunder-rain':          { label: 'Thunderstorms',       icon: () => Icon.CloudLightning, bg: 'linear-gradient(135deg, #0d0d1f 0%, #16213e 50%, #0f3460 100%)', effect: 'rain' },
  'thunder-showers-day':   { label: 'Stormy',              icon: () => Icon.CloudLightning, bg: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 50%, #4a3a6e 100%)', effect: 'rain' },
  'thunder-showers-night': { label: 'Stormy Night',        icon: () => Icon.CloudLightning, bg: 'linear-gradient(135deg, #0d0d1f 0%, #1a1a35 50%, #2d2040 100%)', effect: 'rain' },
  'snow':                  { label: 'Snowing',             icon: () => Icon.CloudSnow,     bg: 'linear-gradient(135deg, #c8dce8 0%, #a0b8cc 50%, #7a98b0 100%)', effect: 'snow' },
  'snow-showers-day':      { label: 'Snow Showers',        icon: () => Icon.CloudSnow,     bg: 'linear-gradient(135deg, #b0c8d8 0%, #8aa8c0 50%, #6a8aa5 100%)', effect: 'snow' },
  'snow-showers-night':    { label: 'Overnight Snow',      icon: () => Icon.CloudSnow,     bg: 'linear-gradient(135deg, #0d1a2e 0%, #1a2e45 50%, #3a5570 100%)', effect: 'snow' },
  'sleet':                 { label: 'Sleet',               icon: () => Icon.CloudSnow,     bg: 'linear-gradient(135deg, #2a3d55 0%, #455e75 50%, #7a9ab0 100%)', effect: 'snow' },
  'hail':                  { label: 'Hail',                icon: () => Icon.CloudSnow,     bg: 'linear-gradient(135deg, #1f3040 0%, #354f65 50%, #6a8fa8 100%)', effect: 'snow' },
  'tornado':               { label: 'Tornado Warning',     icon: () => Icon.Wind,          bg: 'linear-gradient(135deg, #1a0a0a 0%, #3d1515 50%, #6e2020 100%)', effect: null },
  'drizzle':               { label: 'Light Drizzle',       icon: () => Icon.CloudDrizzle,  bg: 'linear-gradient(135deg, #243b55 0%, #3d5c78 50%, #6a8fa8 100%)', effect: 'drizzle' },
  'freezing-drizzle':      { label: 'Freezing Drizzle',    icon: () => Icon.CloudDrizzle,  bg: 'linear-gradient(135deg, #1e3040 0%, #304f65 50%, #6080a0 100%)', effect: 'drizzle' },
  'freezing-rain':         { label: 'Freezing Rain',       icon: () => Icon.CloudRain,     bg: 'linear-gradient(135deg, #1a2535 0%, #2d4055 50%, #4a6a85 100%)', effect: 'rain' },
};

const DEFAULT_WEATHER = { label: 'Loading…', icon: () => Icon.Sun, bg: 'linear-gradient(135deg, #023047 0%, #219EBC 100%)', effect: null };

// ── WEATHER ATMOSPHERIC EFFECTS ──────────────────────────
function WeatherEffect({ effect }) {
  if (!effect) return null;

  const rainDrops = useMemo(() => effect === 'rain' ? Array.from({ length: 20 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 1.5, duration: 0.4 + Math.random() * 0.3, opacity: 0.3 + Math.random() * 0.4,
  })) : [], [effect]);

  const drizzleDrops = useMemo(() => effect === 'drizzle' ? Array.from({ length: 10 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 2.5, duration: 0.8 + Math.random() * 0.5, opacity: 0.2 + Math.random() * 0.25,
  })) : [], [effect]);

  const snowflakes = useMemo(() => (effect === 'snow') ? Array.from({ length: 15 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 4, duration: 3 + Math.random() * 3,
    size: 2 + Math.random() * 3, drift: (Math.random() - 0.5) * 30, opacity: 0.3 + Math.random() * 0.5,
  })) : [], [effect]);

  const stars = useMemo(() => effect === 'stars' ? Array.from({ length: 12 }, (_, i) => ({
    id: i, left: Math.random() * 90 + 5, top: Math.random() * 70 + 5,
    size: 1 + Math.random() * 1.5, delay: Math.random() * 3, duration: 2 + Math.random() * 2,
  })) : [], [effect]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 0 }}>
      <style>{`
        @keyframes weatherRain {
          0% { transform: translateY(-10px); opacity: 0; }
          10% { opacity: var(--wr-op); }
          100% { transform: translateY(220px); opacity: 0; }
        }
        @keyframes weatherSnow {
          0% { transform: translateY(-10px) translateX(0px); opacity: 0; }
          10% { opacity: var(--ws-op); }
          90% { opacity: var(--ws-op); }
          100% { transform: translateY(220px) translateX(var(--ws-drift)); opacity: 0; }
        }
        @keyframes weatherTwinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
        @keyframes weatherGlow {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.1); }
        }
      `}</style>

      {effect === 'rain' && rainDrops.map(d => (
        <div key={d.id} style={{
          position: 'absolute', left: `${d.left}%`, top: -10,
          width: 1, height: 12, borderRadius: 1,
          background: 'rgba(180,210,240,0.6)',
          '--wr-op': d.opacity,
          animation: `weatherRain ${d.duration}s ${d.delay}s linear infinite`,
        }} />
      ))}

      {effect === 'drizzle' && drizzleDrops.map(d => (
        <div key={d.id} style={{
          position: 'absolute', left: `${d.left}%`, top: -10,
          width: 1, height: 6, borderRadius: 1,
          background: 'rgba(180,210,240,0.4)',
          '--wr-op': d.opacity,
          animation: `weatherRain ${d.duration}s ${d.delay}s linear infinite`,
        }} />
      ))}

      {effect === 'snow' && snowflakes.map(s => (
        <div key={s.id} style={{
          position: 'absolute', left: `${s.left}%`, top: -10,
          width: s.size, height: s.size, borderRadius: '50%',
          background: 'rgba(255,255,255,0.8)',
          '--ws-op': s.opacity,
          '--ws-drift': `${s.drift}px`,
          animation: `weatherSnow ${s.duration}s ${s.delay}s linear infinite`,
        }} />
      ))}

      {effect === 'stars' && stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute', left: `${s.left}%`, top: `${s.top}%`,
          width: s.size, height: s.size, borderRadius: '50%',
          background: 'rgba(253,242,232,0.8)',
          animation: `weatherTwinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
        }} />
      ))}

      {effect === 'sunny' && (
        <div style={{
          position: 'absolute', top: -15, right: -15,
          width: 70, height: 70, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,220,120,0.3) 0%, rgba(255,200,80,0.1) 40%, transparent 70%)',
          animation: 'weatherGlow 4s ease-in-out infinite',
        }} />
      )}
    </div>
  );
}

function getWeatherConfig(vcIcon) {
  if (!vcIcon) return DEFAULT_WEATHER;
  if (WEATHER_MAP[vcIcon]) return WEATHER_MAP[vcIcon];
  // fuzzy fallback
  if (vcIcon.includes('snow')) return WEATHER_MAP['snow'];
  if (vcIcon.includes('thunder')) return WEATHER_MAP['thunder-rain'];
  if (vcIcon.includes('rain') || vcIcon.includes('shower')) return WEATHER_MAP['rain'];
  if (vcIcon.includes('drizzle')) return WEATHER_MAP['drizzle'];
  if (vcIcon.includes('fog') || vcIcon.includes('mist')) return WEATHER_MAP['fog'];
  if (vcIcon.includes('wind')) return WEATHER_MAP['wind'];
  if (vcIcon.includes('cloud')) return WEATHER_MAP['cloudy'];
  if (vcIcon.includes('clear') || vcIcon.includes('sun')) return WEATHER_MAP['clear-day'];
  return DEFAULT_WEATHER;
}

// ── MOON PHASE HELPER ─────────────────────────────────────
// 8 phases mapped to uploaded photos in public/moon/
// phase 0–1 from Visual Crossing (0=new, 0.5=full)
const MOON_PHASES = [
  { name: 'New Moon',          file: 'new-moon.jpg',        min: 0.00, max: 0.063 },
  { name: 'Waxing Crescent',   file: 'waxing-crescent.jpg', min: 0.063, max: 0.188 },
  { name: 'First Quarter',     file: 'first-quarter.jpg',   min: 0.188, max: 0.313 },
  { name: 'Waxing Gibbous',    file: 'waxing-gibbous.jpg',  min: 0.313, max: 0.438 },
  { name: 'Full Moon',         file: 'full.webp',           min: 0.438, max: 0.563 },
  { name: 'Waning Gibbous',    file: 'waning-gibbous.webp', min: 0.563, max: 0.688 },
  { name: 'Last Quarter',      file: 'third-quarter.webp',  min: 0.688, max: 0.813 },
  { name: 'Waning Crescent',   file: 'waning-crescent.webp',min: 0.813, max: 1.00  },
];

function getMoonInfo(phase) {
  const p = phase % 1;
  const moon = MOON_PHASES.find(m => p >= m.min && p < m.max) ?? MOON_PHASES[0];
  const pct = Math.round(p <= 0.5 ? p * 200 : (1 - p) * 200);
  // Illumination fraction 0→1 (0=new, 1=full, back to 0)
  const illum = p <= 0.5 ? p * 2 : (1 - p) * 2;
  // Glow X position: waxing (0–0.5) → right side, waning (0.5–1) → left side
  // Near full → center, near new → doesn't matter (opacity 0)
  const glowX = p <= 0.5
    ? 50 + (1 - illum) * 35   // waxing: shift right (85% → 50%)
    : 50 - (1 - illum) * 35;  // waning: shift left (15% → 50%)
  return { name: moon.name, file: moon.file, pct, illum, glowX };
}

function MoonWidget({ moonphase }) {
  if (moonphase == null) return (
    <div className="moon-widget widget-shimmer">
      <Icon.Moon size={38} color="#023047" />
      <div className="moon-pct">--</div>
      <div className="moon-phase">Loading…</div>
    </div>
  );
  const { name, file, pct, illum, glowX } = getMoonInfo(moonphase);
  return (
    <div className="moon-widget">
      <div className="moon-img-wrap" style={{
        '--glow-x': `${glowX}%`,
        '--glow-opacity': illum,
      }}>
        <img src={`/moon/${file}`} alt={name} className="moon-img" />
      </div>
      <div className="moon-info">
        <div className="moon-pct">{pct}%</div>
        <div className="moon-phase">{name}</div>
      </div>
    </div>
  );
}

function useWeather() {
  const [weather, setWeather] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const cacheKey = 'weather-v6';
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
        setWeather({ loading: false, data: cached, error: null });
        return;
      }
    } catch {}

    if (!navigator.geolocation) {
      setWeather({ loading: false, data: null, error: 'Geolocation unavailable' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`${WORKER_URL}/weather?lat=${coords.latitude}&lon=${coords.longitude}`);
          if (!res.ok) throw new Error('Weather fetch failed');
          const json = await res.json();
          const cur = json.currentConditions;
          const nowHour = new Date().getHours();
          const allHours = json.days?.[0]?.hours ?? json.hours ?? [];
          const hours = allHours
            .filter(h => {
              const hHour = parseInt(h.datetime?.split(':')[0] ?? '0', 10);
              return hHour > nowHour;
            })
            .slice(0, 5)
            .map(h => ({
              time: h.datetime?.slice(0, 5) ?? '',
              temp: Math.round(h.temp),
              icon: h.icon,
            }));
          const data = {
            ts: Date.now(),
            temp: Math.round(cur.temp),
            feels: Math.round(cur.feelslike),
            condition: cur.conditions,
            icon: cur.icon,
            city: json.resolvedAddress?.split(',')[0] ?? '',
            humidity: Math.round(cur.humidity),
            windSpeed: Math.round(cur.windspeed),
            moonphase: cur.moonphase ?? null,
            hours,
          };
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setWeather({ loading: false, data, error: null });
        } catch (e) {
          setWeather({ loading: false, data: null, error: 'Could not load weather' });
        }
      },
      () => setWeather({ loading: false, data: null, error: 'Location denied' }),
      { timeout: 8000 }
    );
  }, []);

  return weather;
}

function WeatherWidget() {
  const { loading, data, error } = useWeather();
  const cfg = data ? getWeatherConfig(data.icon) : DEFAULT_WEATHER;
  const WeatherIcon = cfg.icon();

  if (loading) return (
    <div className="weather-widget widget-shimmer tappable-card">
      <div className="otd-loading"><div className="otd-dot"/><div className="otd-dot"/><div className="otd-dot"/></div>
    </div>
  );

  if (error || !data) return (
    <div className="weather-widget">
      <div className="weather-icon-wrap"><Icon.Sun size={28} /></div>
      <div className="weather-temp">--°</div>
      <div className="weather-condition">{error || 'Unavailable'}</div>
      <div className="weather-label">Enable location</div>
    </div>
  );

  return (
    <div className="weather-widget" style={{ background: cfg.bg }}>
      <WeatherEffect effect={cfg.effect} />
      <div className="weather-icon-wrap" style={{ position: 'relative', zIndex: 1 }}><WeatherIcon size={28} /></div>
      <div className="weather-temp">{data.temp}°F</div>
      <div className="weather-condition">{cfg.label}</div>
      {data.hours?.length > 0 && (
        <div className="weather-forecast">
          {data.hours.map((h, i) => {
            const hourCfg = getWeatherConfig(h.icon);
            const HourIcon = hourCfg.icon();
            const hour = parseInt(h.time.split(':')[0], 10);
            const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
            return (
              <div className="weather-hour" key={i}>
                <div className="weather-hour-time">{label}</div>
                <HourIcon size={14} color="rgba(255,255,255,0.8)" />
                <div className="weather-hour-temp">{h.temp}°</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useOnThisDay() {
  const [state, setState] = useState({ loading: true, event: null, error: null });

  useEffect(() => {
    const now = new Date();
    const cacheKey = `otd-v3-${now.getMonth() + 1}-${now.getDate()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setState({ loading: false, event: JSON.parse(cached), error: null }); return; } catch {}
    }

    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/wikipedia`);
        const event = await res.json();
        if (event.error) throw new Error(event.error);
        localStorage.setItem(cacheKey, JSON.stringify(event));
        setState({ loading: false, event, error: null });
      } catch {
        setState({ loading: false, event: null, error: 'Could not load today\'s event.' });
      }
    })();
  }, []);

  return state;
}

function OnThisDayWidget() {
  const { loading, event, error } = useOnThisDay();

  return (
    <div className="otd-widget">
      <div className="otd-label">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#2a5f7a" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5" stroke="#2a5f7a" strokeWidth="1.2" strokeLinecap="round"/><line x1="5" y1="5" x2="7" y2="5" stroke="#2a5f7a" strokeWidth="1.2" strokeLinecap="round"/></svg>
        On This Day
      </div>
      {loading && (
        <div className="otd-loading">
          <div className="otd-dot" /><div className="otd-dot" /><div className="otd-dot" />
          <span>Finding today's moment…</span>
        </div>
      )}
      {!loading && event && (
        <>
          <div className="otd-year">{event.year}</div>
          <div className="otd-meta">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, {event.year}
            {event.location && <><span style={{color:'#8ECAE6'}}>·</span> {event.location}</>}
          </div>
          <div className="otd-text">{event.text}</div>
          {event.wiki_url && (
            <a className="otd-link" href={event.wiki_url} target="_blank" rel="noopener noreferrer">
              Read more on Wikipedia ↗
            </a>
          )}
        </>
      )}
      {!loading && error && <div className="otd-text" style={{ color: '#8ec5d9' }}>{error}</div>}
    </div>
  );
}

// ── JOURNAL / GRATITUDE PROMPT ────────────────────────────
function useAuth() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u ?? null)), []);
  return user;
}

function useJournalPrompt() {
  const [state, setState] = useState({ loading: true, prompt: null });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `journal-prompt-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.prompt) { setState({ loading: false, prompt: cached.prompt }); return; }
    } catch {}

    (async () => {
      try {
        // Fetch recent prompts from Firestore to avoid repetition
        let recentParam = "";
        try {
          const q = query(collection(db, "journalPrompts"), orderBy("date", "desc"), fbLimit(10));
          const snap = await getDocs(q);
          const recent = snap.docs.map(d => d.data().prompt).filter(Boolean);
          if (recent.length) recentParam = `?recent=${encodeURIComponent(recent.join("|||"))}`;
        } catch {}

        const res = await fetch(`${WORKER_URL}/journal-prompt${recentParam}`);
        const data = await res.json();
        if (!data.prompt) throw new Error("No prompt");

        // Store prompt in Firestore for future dedup
        try { await setDoc(doc(db, "journalPrompts", today), { date: today, prompt: data.prompt }); } catch {}

        localStorage.setItem(cacheKey, JSON.stringify(data));
        setState({ loading: false, prompt: data.prompt });
      } catch {
        setState({ loading: false, prompt: "What's one small thing you're looking forward to today?" });
      }
    })();
  }, []);

  return state;
}

function JournalWidget() {
  const user = useAuth();
  const { loading: promptLoading, prompt } = useJournalPrompt();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryClosing, setDiaryClosing] = useState(false);
  const [loginMode, setLoginMode] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [authErr, setAuthErr] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedClosing, setExpandedClosing] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);

  const dismissExpanded = useCallback(() => {
    setExpandedClosing(true);
    setTimeout(() => { setExpanded(false); setExpandedClosing(false); }, 500);
  }, []);

  const dismissDiary = useCallback(() => {
    setDiaryClosing(true);
    setTimeout(() => { setDiaryOpen(false); setDiaryClosing(false); }, 500);
  }, []);

  // Lock body scroll when expanded or diary open
  useEffect(() => {
    if (expanded || diaryOpen) {
      document.body.classList.add("journal-open");
    } else {
      document.body.classList.remove("journal-open");
    }
    return () => document.body.classList.remove("journal-open");
  }, [expanded]);

  // Load today's entry if user is logged in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/journalEntries`, today));
        if (snap.exists()) {
          setText(snap.data().text || "");
          setSaved(true);
        }
      } catch {}
    })();
  }, [user, today]);

  const handleSave = async () => {
    if (!user || !text.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${user.uid}/journalEntries`, today), {
        date: today,
        prompt: prompt || "",
        text: text.trim(),
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthErr(null);
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setLoginMode(false);
    } catch (ex) {
      setAuthErr(ex.message.replace("Firebase: ", ""));
    }
    setAuthLoading(false);
  };

  const handleTouchStart = (e) => {
    dragRef.current = { startY: e.touches[0].clientY, dragging: true };
  };
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
    if (dy > 80) dismissExpanded();
  };

  if (promptLoading) return (
    <div className="journal-card journal-shimmer widget-shimmer">
      <Icon.Feather size={24} color="rgba(139,92,246,0.3)" />
      <div className="journal-label">Journal</div>
    </div>
  );

  return (
    <>
      {/* Inline card — collapsed view */}
      <div className="journal-card" onClick={() => { if (user) setExpanded(true); }}>
        <div className="journal-header">
          <Icon.Feather size={14} color="rgba(139,92,246,0.7)" />
          <div className="journal-label">Morning Journal</div>
        </div>
        <div className="journal-prompt">{prompt}</div>
        {user === undefined ? null : user ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'rgba(8,16,32,0.3)', fontStyle: 'italic', fontSize: 12 }}>Tap to write...</div>
            <button className="journal-history-btn" onClick={(e) => { e.stopPropagation(); setDiaryOpen(true); }}>
              <Icon.BookOpen size={13} color="rgba(8,16,32,0.4)" /> Past entries
            </button>
          </div>
        ) : loginMode ? (
          <form onSubmit={handleLogin}>
            <input className="journal-auth-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="journal-auth-input" type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button className="journal-auth-btn" type="submit" disabled={authLoading}>{authLoading ? "Signing in..." : "Sign In"}</button>
            {authErr && <div className="journal-auth-err">{authErr}</div>}
          </form>
        ) : (
          <div className="journal-login-prompt">
            <button className="journal-login-btn" onClick={() => setLoginMode(true)}>Sign in</button> to save your journal entries
          </div>
        )}
      </div>

      {/* Expanded fullscreen sheet — portaled to .phone so it covers nav */}
      {expanded && document.getElementById("phone-shell") && createPortal(
        <>
          <div className={`journal-expanded-overlay ${expandedClosing ? "closing" : ""}`} onClick={dismissExpanded} />
          <div className={`journal-expanded ${expandedClosing ? "closing" : ""}`} ref={sheetRef}>
            <div className="journal-drag-handle"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            <div className="journal-header">
              <Icon.Feather size={14} color="rgba(8,16,32,0.4)" />
              <div className="journal-label">Morning Journal</div>
            </div>
            <div className="journal-prompt">{prompt}</div>
            <textarea
              className="journal-textarea"
              placeholder="Write your thoughts..."
              value={text}
              onChange={(e) => { setText(e.target.value); setSaved(false); }}
              autoFocus
            />
            <div className="journal-actions">
              <button className="journal-history-btn" onClick={() => setDiaryOpen(true)}>
                <Icon.BookOpen size={13} color="rgba(8,16,32,0.4)" /> Past entries
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {saved && <span className="journal-saved">Saved</span>}
                <button className="journal-save" onClick={handleSave} disabled={saving || !text.trim()}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.getElementById("phone-shell")
      )}

      {diaryOpen && <DiarySheet user={user} onClose={dismissDiary} closing={diaryClosing} />}
    </>
  );
}

function DiarySheet({ user, onClose, closing = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const scrubRef = useRef({ startY: 0, startIdx: 0, active: false, lastTs: 0 });
  const closeRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);
  const swipeRef = useRef({ startX: 0, startY: 0, swiping: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    document.body.classList.add("journal-open");
    return () => document.body.classList.remove("journal-open");
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const q = query(
          collection(db, `users/${user.uid}/journalEntries`),
          orderBy("date", "desc"),
          fbLimit(50)
        );
        const snap = await getDocs(q);
        let results = snap.docs.map(d => d.data());

        if (results.length === 0) {
          const seeds = [
            { date: "2026-03-20", prompt: "What made you smile before 9am today?", text: "My dog stretched out in a sunbeam on the kitchen floor and sighed so contentedly. I stood there with my coffee just watching her for a minute. Sometimes the smallest moments are the most grounding." },
            { date: "2026-03-18", prompt: "Describe a sound you heard this morning that you usually ignore.", text: "Birds outside my window — I think they're house finches. I never really stopped to listen before, but this morning the house was quiet and their song filled the whole room. It felt like a little gift." },
            { date: "2026-03-15", prompt: "What's one thing you're learning about yourself lately?", text: "I'm learning that I don't need to have everything figured out to feel okay. There's a kind of peace in just showing up each day and doing my best. Progress doesn't always look dramatic." },
            { date: "2026-03-12", prompt: "If today were a color, what would it be and why?", text: "A soft golden yellow — like late afternoon light. I woke up feeling warm and unhurried. No rush, no anxiety. Just a gentle kind of optimism that I want to hold onto." },
            { date: "2026-03-09", prompt: "Write about someone who made your week better, even in a small way.", text: "The barista at my usual coffee shop remembered my name and my order. She said 'the usual?' with this big smile. It's such a tiny thing but it made me feel seen. Connection doesn't have to be deep to be meaningful." },
          ];
          for (const seed of seeds) {
            await setDoc(doc(db, `users/${user.uid}/journalEntries`, seed.date), { ...seed, updatedAt: new Date().toISOString() });
          }
          results = seeds;
        }

        setEntries(results);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  // Close handle drag
  const handleCloseTouchStart = (e) => { closeRef.current = { startY: e.touches[0].clientY, dragging: true }; };
  const handleCloseTouchMove = (e) => {
    if (!closeRef.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - closeRef.current.startY;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const handleCloseTouchEnd = (e) => {
    if (!closeRef.current.dragging || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - closeRef.current.startY;
    closeRef.current.dragging = false;
    sheetRef.current.style.transform = "";
    if (dy > 80) onClose();
  };

  // Page area: horizontal swipe = prev/next, vertical swipe = scrub
  const handlePageTouchStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY, swiping: true, direction: null };
    scrubRef.current = { startY: t.clientY, startIdx: idx, active: false, lastTs: Date.now() };
  };

  const handlePageTouchMove = (e) => {
    if (!swipeRef.current.swiping) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeRef.current.startX;
    const dy = t.clientY - swipeRef.current.startY;

    // Determine direction on first significant move
    if (!swipeRef.current.direction) {
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        swipeRef.current.direction = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (swipeRef.current.direction === "v") {
          scrubRef.current.active = true;
          setScrubbing(true);
        }
      } else return;
    }

    if (swipeRef.current.direction === "v" && scrubRef.current.active && entries.length > 1) {
      // Vertical scrub: each 30px of movement = 1 entry, accelerates with speed
      const rawDy = t.clientY - scrubRef.current.startY;
      const now = Date.now();
      const velocity = Math.abs(rawDy) / Math.max(now - scrubRef.current.lastTs, 16);
      const accel = Math.max(1, Math.floor(velocity * 3));
      const steps = Math.round(rawDy / 30) * accel;
      const newIdx = Math.max(0, Math.min(entries.length - 1, scrubRef.current.startIdx - steps));
      if (newIdx !== idx) {
        setIdx(newIdx);
        setShowToast(true);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setShowToast(false), 800);
      }
    }
  };

  const handlePageTouchEnd = (e) => {
    if (!swipeRef.current.swiping) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY;

    if (swipeRef.current.direction === "h") {
      // Horizontal swipe: left = next, right = prev
      if (dx < -40 && idx < entries.length - 1) setIdx(i => i + 1);
      else if (dx > 40 && idx > 0) setIdx(i => i - 1);
    }

    swipeRef.current.swiping = false;
    swipeRef.current.direction = null;
    scrubRef.current.active = false;
    setScrubbing(false);
  };

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  const entry = entries[idx];

  return createPortal(
    <>
      <div className={`diary-overlay ${closing ? "closing" : ""}`} onClick={onClose} />
      <div className={`diary-sheet ${closing ? "closing" : ""}`} ref={sheetRef}>
        <div className="diary-drag-handle"
          onTouchStart={handleCloseTouchStart}
          onTouchMove={handleCloseTouchMove}
          onTouchEnd={handleCloseTouchEnd}
        />
        <div className="diary-header">
          <div className="diary-title">My Journal</div>
          <button className="diary-close" onClick={onClose}>Done</button>
        </div>
        {entries.length > 0 && (
          <div className="diary-counter">{idx + 1} of {entries.length}</div>
        )}
        <div className="diary-page-area"
          onTouchStart={handlePageTouchStart}
          onTouchMove={handlePageTouchMove}
          onTouchEnd={handlePageTouchEnd}
        >
          {loading ? (
            <div className="diary-empty">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="diary-empty">No entries yet. Start writing today!</div>
          ) : entry ? (
            <div className="diary-page" key={entry.date}>
              <div className="diary-page-date">
                {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
              <div className="diary-page-weekday">
                {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}
              </div>
              {entry.prompt && <div className="diary-page-prompt">"{entry.prompt}"</div>}
              <div className="diary-page-text">{entry.text}</div>
            </div>
          ) : null}
          {showToast && entry && (
            <div className="diary-date-toast">
              {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
          {!scrubbing && entries.length > 1 && (
            <div className="diary-scrub-hint">swipe left/right or drag up to scrub</div>
          )}
        </div>
      </div>
    </>,
    phoneEl
  );
}

function HomeScreen({ onOpenWordle }) {
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
        <div className="home-avatar"><Icon.Sunrise size={22} /></div>
      </div>

      <div style={{ padding: "16px 20px 0" }} className="spring-in spring-in-2 depth-mid">
        <div className="widget-row">
          <WeatherWidget />
          <MoonWidget moonphase={weatherData?.moonphase ?? null} />
        </div>
      </div>

      <div className="section-pad spring-in spring-in-3 depth-mid">
        <div className="calendar-widget widget-shimmer">
          <div className="cal-header">Today's Schedule</div>
          {[
            { time: "9am", title: "Team standup", color: "#219EBC" },
            { time: "12pm", title: "Lunch with Sarah", color: "#FFD166" },
            { time: "3pm", title: "Design review", color: "#FFBC42" },
          ].map((e, i) => (
            <div className="cal-event" key={i}>
              <div className="cal-dot" style={{ background: e.color }} />
              <div className="cal-time">{e.time}</div>
              <div className="cal-title">{e.title}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-pad spring-in spring-in-4 depth-mid">
        <div className="photo-widget">
          <div className="photo-placeholder"><Icon.Image size={80} /></div>
          <div className="photo-gradient" />
          <div className="photo-label">
            <div className="photo-tag">On this day · 2 years ago</div>
            <div className="photo-caption">Trip to Colorado</div>
          </div>
        </div>
      </div>

      <div className="section-pad spring-in spring-in-5 depth-mid">
        <OnThisDayWidget />
      </div>

      <div className="section-pad spring-in spring-in-6 depth-mid">
        <JournalWidget />
      </div>

      <div className="section-pad spring-in spring-in-7 depth-mid">
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

// ── CATEGORY COLOR MAP ────────────────────────────────────
const CAT_COLORS = {
  Animals:        "#FF9F43",
  Nature:         "#26de81",
  Sports:         "#FF6B6B",
  Music:          "#a55eea",
  Food:           "#fd9644",
  "Art & Design": "#45aaf2",
  Science:        "#2bcbba",
  Uplifting:      "#FFD166",
  "Global/Wonder":"#219EBC",
};

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
      // Use hls.js for Reddit DASH videos (merges video + audio streams)
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

// ── REDDIT HERO CARD ──────────────────────────────────────
function RedditHeroCard({ post, onOpen, readerOpen = false }) {
  const color = CAT_COLORS[post.category] ?? "#219EBC";
  const hasImage = !!post.image;
  const hasVideo = !!post.video;
  const videoTimeRef = useRef(0);

  const handleOpen = () => {
    onOpen(post, hasVideo ? videoTimeRef.current : 0);
  };

  return (
    <div className="feed-card" style={{ cursor: "pointer", border: `1.5px solid ${color}` }} onClick={handleOpen}>
      {/* Video posts: inline autoplay preview */}
      {hasVideo ? (
        <div onClick={e => e.stopPropagation()}>
          <VideoPlayer video={post.video} poster={post.image} autoplay onTimeUpdate={(t) => { videoTimeRef.current = t; }} paused={readerOpen} />
          {/* Tap-to-expand overlay on video */}
          <div
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
            style={{
              position: "absolute", top: 8, left: 8, zIndex: 5,
              background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
              borderRadius: 10, padding: "6px 10px",
              display: "flex", alignItems: "center", gap: 5,
              cursor: "pointer", color: "#fff", fontSize: 11, fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
        </div>
      ) : (
        <div className="feed-card-image">
          {hasImage
            ? <img className="feed-image" src={post.image} alt={post.title} onError={e => { e.target.style.display = "none"; }} />
            : <div className="feed-no-image"><Icon.Leaf size={56} /></div>
          }
          {/* Video badge (fallback for video posts without video URL) */}
          {post.isVideo && !hasVideo && (
            <div className="video-card-badge">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="white"><polygon points="3,1 11,6 3,11"/></svg>
              VIDEO
            </div>
          )}
          {/* Overlay title on top of image */}
          {hasImage && (
            <div className="feed-card-overlay-body">
              <div className="feed-card-overlay-source">
                <div className="feed-source-dot" style={{ background: color }} />
                <div className="feed-source-label" style={{ color: "rgba(234,244,251,0.8)" }}>r/{post.subreddit}</div>
              </div>
              <div className="feed-card-overlay-title">{post.title}</div>
              <div className="feed-card-overlay-meta">
                <span>↑ {post.scoreLabel}</span>
                <span>💬 {post.commentLabel}</span>
                <span>{post.ageLabel}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Card body — always shown below video/image */}
      <div className="feed-card-body" style={{ background: `${color}1A` }}>
        <div className="feed-card-source" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="feed-source-dot" style={{ background: color }} />
            <div className="feed-source-label">r/{post.subreddit}</div>
          </div>
          <div className="feed-category-badge" style={{ background: `${color}20`, color }}>{post.category}</div>
        </div>
        <div className="feed-card-title">{post.title}</div>
        <div className="feed-card-meta">
          <span>↑ {post.scoreLabel}</span>
          <span>💬 {post.commentLabel}</span>
          <span>{post.ageLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ── REDDIT SMALL CARD ─────────────────────────────────────
function RedditSmallCard({ post, onOpen }) {
  const color = CAT_COLORS[post.category] ?? "#219EBC";
  return (
    <div className="feed-card-small" style={{
      cursor: "pointer",
      background: `${color}1A`,
      border: `1.5px solid ${color}`,
    }} onClick={() => onOpen(post)}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {post.image
          ? <img className="feed-small-img" src={post.image} alt={post.title} onError={e => { e.target.style.display = "none"; }} />
          : <div className="feed-small-placeholder" style={{ background: `${color}30` }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: color, opacity: 0.6 }} />
            </div>
        }
        {post.isVideo && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", borderRadius: 12 }}>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="white"><polygon points="3,1 11,6 3,11"/></svg>
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px 12px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="feed-small-title">{post.title}</div>
        <div className="feed-small-meta">↑ {post.scoreLabel} · {post.ageLabel}</div>
      </div>
    </div>
  );
}

// ── UNIFIED FEED ITEM ─────────────────────────────────────
function FeedItem({ item, hero = false, expanded = false, onOpen, seen = false, readerOpen = false }) {
  const forceHero = hero || expanded || item.isVideo;
  const card = forceHero
    ? <RedditHeroCard post={item} onOpen={onOpen} readerOpen={readerOpen} />
    : <RedditSmallCard post={item} onOpen={onOpen} />;

  if (!seen) return card;

  // Seen posts: slightly dimmed with a subtle "seen" indicator
  return (
    <div style={{ position: "relative", opacity: 0.55, transition: "opacity 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.opacity = "1"}
      onMouseLeave={e => e.currentTarget.style.opacity = "0.55"}
    >
      {card}
      <div style={{
        position: "absolute", top: 8, right: 28,
        background: "rgba(2,48,71,0.55)", backdropFilter: "blur(4px)",
        borderRadius: 10, padding: "2px 8px",
        fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)",
        letterSpacing: "0.5px", textTransform: "uppercase", pointerEvents: "none",
      }}>seen</div>
    </div>
  );
}

// ── IN-APP READER SHEET ───────────────────────────────────
function ReaderSheet({ item, onClose, allItems = [], onNavigate, videoStartTime = 0 }) {
  const [closing, setClosing] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Swipe down to dismiss
  const swipeStartY = useRef(0);
  const swipeStartX = useRef(0);
  const sheetRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [swipeDir, setSwipeDir] = useState(null); // 'v' | 'h' | null

  const color = CAT_COLORS[item.category] ?? "#219EBC";

  const currentIndex = allItems.findIndex(i => i.id === item.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allItems.length - 1;

  // Fetch Reddit comments only when details opened
  useEffect(() => {
    if (!detailsOpen) return;
    if (comments.length > 0 || commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError(false);
    const url = `https://www.reddit.com/r/${item.subreddit}/comments/${item.id}.json?limit=15&sort=top&raw_json=1`;
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const raw = data[1]?.data?.children ?? [];
        const parsed = raw
          .filter(c => c.kind === "t1" && c.data?.body && c.data.body !== "[deleted]" && c.data.body !== "[removed]")
          .slice(0, 12)
          .map(c => ({
            author: c.data.author,
            body: cleanRedditText(c.data.body).slice(0, 500),
            score: c.data.score,
            isOp: c.data.author === item.author,
          }))
          .filter(c => c.body.length > 0);
        setComments(parsed);
      })
      .catch(() => { setComments([]); setCommentsError(true); })
      .finally(() => setCommentsLoading(false));
  }, [item.id, detailsOpen]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };

  // Touch handlers for swipe down + swipe left/right
  const onTouchStart = (e) => {
    swipeStartY.current = e.touches[0].clientY;
    swipeStartX.current = e.touches[0].clientX;
    setSwipeDir(null);
  };

  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - swipeStartY.current;
    const dx = e.touches[0].clientX - swipeStartX.current;

    // Lock direction on first significant move
    if (!swipeDir) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) setSwipeDir('v');
      else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) setSwipeDir('h');
      return;
    }

    if (swipeDir === 'v' && dy > 0) {
      e.preventDefault();
      setDragY(dy);
    }
  };

  const onTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;

    if (swipeDir === 'v' && dy > 80) {
      handleClose();
    } else if (swipeDir === 'h') {
      if (dx < -60 && hasNext) onNavigate(allItems[currentIndex + 1]);
      else if (dx > 60 && hasPrev) onNavigate(allItems[currentIndex - 1]);
    }
    setDragY(0);
    setSwipeDir(null);
  };

  const sheetStyle = dragY > 0 ? {
    transform: `translateY(${dragY}px)`,
    transition: 'none',
    opacity: Math.max(0.4, 1 - dragY / 400),
  } : {};

  const hasMedia = !!(item.video || item.image);

  return (
    <div
      ref={sheetRef}
      className={`reader-sheet${closing ? " closing" : ""}`}
      style={{ ...sheetStyle, background: hasMedia ? "#0a1a24" : undefined }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar — floats over media when media exists, solid otherwise */}
      {!hasMedia && (
        <div className="reader-topbar">
          <div className="reader-source-pill" style={{ background: `${color}18`, color }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span>{`r/${item.subreddit}`}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasPrev && (
              <button onClick={() => onNavigate(allItems[currentIndex - 1])} style={{ background: "none", border: "none", color: "#8a9ab5", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>‹</button>
            )}
            {hasNext && (
              <button onClick={() => onNavigate(allItems[currentIndex + 1])} style={{ background: "none", border: "none", color: "#8a9ab5", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>›</button>
            )}
            <button className="reader-close" onClick={handleClose}>Done</button>
          </div>
        </div>
      )}

      <div className="reader-scroll" style={{ position: "relative" }}>
        {/* Floating overlay topbar for media posts */}
        {hasMedia && (
          <div className="reader-topbar-overlay">
            <div className="reader-source-pill" style={{ background: `rgba(255,255,255,0.15)`, color: "#fff" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span>{`r/${item.subreddit}`}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {hasPrev && (
                <button onClick={() => onNavigate(allItems[currentIndex - 1])} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>‹</button>
              )}
              {hasNext && (
                <button onClick={() => onNavigate(allItems[currentIndex + 1])} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>›</button>
              )}
              <button className="reader-close" onClick={handleClose}>Done</button>
            </div>
          </div>
        )}

        {/* Hero: video player or image */}
        {item.video
          ? <VideoPlayer video={item.video} poster={item.image} autoplay fullscreen startTime={videoStartTime} />
          : item.image && (
              <img
                className="reader-hero-img"
                src={item.image}
                alt={item.title}
                onError={e => { e.target.style.display = "none"; }}
              />
            )
        }

        {/* Content area — warm background sits below full-bleed media */}
        <div style={{ background: "#f7f1e8", borderRadius: hasMedia ? "20px 20px 0 0" : 0, marginTop: hasMedia ? -16 : 0, position: "relative", zIndex: 2, minHeight: 300 }}>
        {/* Scroll handle hint */}
        {hasMedia && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(139,90,43,0.15)" }} />
          </div>
        )}
        {/* Body */}
        <div className="reader-body">
          <div className="reader-meta">
            <span className="reader-meta-tag">{item.ageLabel}</span>
            {item.author && <>
              <div className="reader-meta-dot" />
              <span className="reader-meta-tag">u/{item.author}</span>
            </>}
          </div>

          <div className="reader-title">{item.title}</div>

          {/* Self text (Reddit text posts) */}
          {item.selfText && (
            <div className="reader-summary">{item.selfText}</div>
          )}

          {/* Collapsed stats row — tap to expand */}
          {(
            <div
              className="reader-stats-collapsed"
              onClick={() => setDetailsOpen(o => !o)}
              style={{ cursor: "pointer" }}
            >
              <span className="reader-stats-inline">↑ {item.scoreLabel} · 💬 {item.commentLabel} · {item.category}</span>
              <span className="reader-stats-chevron" style={{ transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)" }}>⌄</span>
            </div>
          )}
        </div>

        {/* Expanded details: full stats + comments */}
        {detailsOpen && (
          <>
            <div className="reader-stats">
              <div className="reader-stat">
                <span className="reader-stat-val">↑ <CountUp value={item.scoreLabel} /></span>
                <span className="reader-stat-label">Upvotes</span>
              </div>
              <div className="reader-stat">
                <span className="reader-stat-val"><CountUp value={item.commentLabel} /></span>
                <span className="reader-stat-label">Comments</span>
              </div>
              <div className="reader-stat">
                <span className="reader-stat-val" style={{ fontSize: 13 }}>{item.category}</span>
                <span className="reader-stat-label">Category</span>
              </div>
            </div>

            <div className="reader-section-label">Top Comments</div>
            {commentsLoading && (
              <div className="reader-loading">
                <span className="reader-loading-text">Loading comments…</span>
              </div>
            )}
            {!commentsLoading && commentsError && (
              <div style={{ padding: "12px 22px 16px", fontSize: 13, color: "#8a9ab5", lineHeight: 1.5 }}>
                Couldn't load comments — Reddit may be rate limiting.<br/>
                <button
                  onClick={() => window.open(item.permalink, "_blank")}
                  style={{ marginTop: 8, background: "none", border: "none", color, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                >
                  Read on Reddit →
                </button>
              </div>
            )}
            {!commentsLoading && !commentsError && comments.length === 0 && (
              <div style={{ padding: "12px 22px 16px", fontSize: 13, color: "#8a9ab5" }}>No comments yet.</div>
            )}
            {comments.map((c, i) => {
              const initials = c.author.slice(0, 2).toUpperCase();
              return (
                <div className="comment" key={i}>
                  <div className={`comment-avatar${c.isOp ? " op-avatar" : ""}`}>{initials}</div>
                  <div className="comment-content">
                    <div className="comment-author">
                      u/{c.author}
                      <span className="comment-score">↑ {c.score}</span>
                      {c.isOp && <span style={{ fontSize: 9, background: color, color: "#fff", padding: "1px 6px", borderRadius: 4, letterSpacing: 0.5 }}>OP</span>}
                    </div>
                    <div className={`comment-body${c.isOp ? " op" : ""}`}>{c.body}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Open in browser button */}
        {item.permalink !== "#" && item.url !== "#" && (
          <button className="reader-open-web" onClick={() => window.open(item.permalink ?? item.url, "_blank")}>
            <span>↗</span> Open in browser
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

// ── FEED SCREEN ───────────────────────────────────────────
function FeedScreen({ enabledSubs, mutedInMode = {}, alwaysBlock = [] }) {
  const feedUser = useAuth();
  const [readerItem, setReaderItem] = useState(null);
  const [readerClosing, setReaderClosing] = useState(false);

  // ── Seen posts ────────────────────────────────────────
  const [seenIds, setSeenIds] = useState(() => {
    try {
      // Version key — bumping this clears all stale seen history from old builds
      const SEEN_VERSION = "v3"; // bumped: fixed article ID generation
      if (localStorage.getItem("ms_seen_version") !== SEEN_VERSION) {
        localStorage.removeItem("ms_seen_posts");
        localStorage.setItem("ms_seen_version", SEEN_VERSION);
        return new Set();
      }
      const stored = JSON.parse(localStorage.getItem("ms_seen_posts") ?? "[]");
      return new Set(stored.filter(id => !String(id).startsWith("mock_")));
    }
    catch { return new Set(); }
  });

  // Snapshot of seen IDs at mount time — used to push previously-seen posts
  // to the bottom of the feed without causing items to jump mid-session.
  const previouslySeenIds = useRef(seenIds);

  const markSeen = (id) => {
    setSeenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        const arr = Array.from(next).slice(-500); // cap at 500 seen posts
        localStorage.setItem("ms_seen_posts", JSON.stringify(arr));
        return new Set(arr);
      } catch { return next; }
    });
  };

  const [videoStartTime, setVideoStartTime] = useState(0);
  const openReader = (item, startTime = 0) => { markSeen(item.id); setVideoStartTime(startTime); setReaderItem(item); };
  const closeReader = () => { setReaderItem(null); setVideoStartTime(0); };
  const [activeMode, setActiveMode] = useState("my-morning");
  const [retryKey, setRetryKey] = useState(0);
  const mode = FEED_MODES.find(m => m.id === activeMode) ?? FEED_MODES[0];
  const [expanded, setExpanded] = useState(true);

  // Pull-to-refresh
  const pullStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const PULL_THRESHOLD = 72;

  const onTouchStart = (e) => {
    if (feedScrollRef.current?.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };
  const onTouchMove = (e) => {
    if (!isPulling) return;
    const dist = Math.max(0, Math.min(e.touches[0].clientY - pullStartY.current, 100));
    setPullDistance(dist);
  };
  const onTouchEnd = () => {
    if (pullDistance >= PULL_THRESHOLD) {
      setRetryKey(k => k + 1);
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  const enabledSubSet = useMemo(() => new Set(enabledSubs.map(s => s.toLowerCase())), [enabledSubs]);

  // Subreddits for the current mode — apply per-mode mutes + always block
  const targetSubs = useMemo(() => {
    const modeMuted = (mutedInMode[mode.id] ?? []).map(s => s.toLowerCase());
    const blocked = alwaysBlock.map(s => s.toLowerCase());
    const filter = s => !modeMuted.includes(s.toLowerCase()) && !blocked.includes(s.toLowerCase());

    if (mode.id === "my-morning") return enabledSubs.filter(filter).slice(0, 20);
    if (mode.id === "drift") return ALL_SUBREDDITS.filter(filter).slice(0, 20);
    if (!mode.categories) return [];
    return mode.categories.flatMap(cat => SUBREDDIT_CATEGORIES[cat] ?? []).filter(filter).slice(0, 20);
  }, [mode, enabledSubs, mutedInMode, alwaysBlock]);

  const { posts: rawPosts, loading: postsLoading } = useRedditFeed(targetSubs, 8, "top&t=day", retryKey);

  const loading = postsLoading;

  // Scroll position memory per tab
  const feedScrollRef = useRef(null);
  const scrollPositions = useRef({});

  const saveScrollPosition = () => {
    if (feedScrollRef.current) {
      scrollPositions.current[activeMode] = feedScrollRef.current.scrollTop;
    }
  };

  const restoreScrollPosition = (modeId) => {
    const saved = scrollPositions.current[modeId] ?? 0;
    requestAnimationFrame(() => {
      if (feedScrollRef.current) feedScrollRef.current.scrollTop = saved;
    });
  };

  // Reset visible count when mode changes, save/restore scroll
  const [visibleCount, setVisibleCount] = useState(15);
  useEffect(() => {
    setVisibleCount(15);
    restoreScrollPosition(activeMode);
  }, [activeMode]); // eslint-disable-line

  const feedItems = useMemo(() => {
    // For my-morning, respect the user's enabled subs. For all other modes, show everything fetched.
    const filteredPosts = mode.id === "my-morning"
      ? rawPosts.filter(p => enabledSubSet.has(p.subreddit.toLowerCase()))
      : rawPosts;

    // Push posts that were already seen (from a previous session) to the bottom,
    // preserving relative order within each group (unseen first, then seen).
    const prevSeen = previouslySeenIds.current;
    if (prevSeen.size > 0) {
      const unseen = filteredPosts.filter(item => !prevSeen.has(item.id));
      const seen = filteredPosts.filter(item => prevSeen.has(item.id));
      return [...unseen, ...seen];
    }
    return filteredPosts;
  }, [rawPosts, enabledSubSet, mode]);

  const FEED_CAP = 50;
  const hero = feedItems[0] ?? null;
  const visibleItems = feedItems.slice(1, visibleCount);
  const hasMore = visibleCount < Math.min(feedItems.length, FEED_CAP);
  const loadMore = () => setVisibleCount(c => Math.min(c + 10, FEED_CAP));

  // Empty state messages per tab
  const emptyMessage = `No ${mode.label} content available.\nTap Settings to adjust your sources.`;

  return (
    <div className="feed-bg">
      <div className="feed-header fade-up fade-up-1">
        <div>
          <div className="feed-title">Your Feed</div>
          <div className="feed-subtitle">{mode.id === "my-morning" ? "your curated morning" : mode.id === "drift" ? "just scroll · something for everyone" : mode.id === "gentle" ? "calm · nature · mindfulness" : mode.id === "plugged-in" ? "science · world · wonder" : "art · music · food · travel"}</div>
        </div>
        {/* Compact / Expanded view toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          title={expanded ? "Compact view" : "Expanded view"}
          style={{
            background: expanded ? "#023047" : "rgba(255,255,255,0.7)",
            border: expanded ? "none" : "1px solid rgba(2,48,71,0.15)",
            borderRadius: 12, padding: "8px 10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s",
            boxShadow: expanded ? "0 2px 8px rgba(2,48,71,0.2)" : "none",
            flexShrink: 0,
          }}
        >
          {expanded ? (
            // Expanded icon: two wide rows
            <svg width="18" height="16" viewBox="0 0 18 16" fill="none">
              <rect x="0" y="0" width="18" height="6" rx="2" fill="#8ECAE6"/>
              <rect x="0" y="9" width="18" height="6" rx="2" fill="#8ECAE6" opacity="0.6"/>
            </svg>
          ) : (
            // Compact icon: three narrow rows with a small thumb
            <svg width="18" height="16" viewBox="0 0 18 16" fill="none">
              <rect x="0" y="0.5" width="10" height="3.5" rx="1.5" fill="#023047"/>
              <rect x="0" y="6" width="14" height="3.5" rx="1.5" fill="#023047" opacity="0.5"/>
              <rect x="0" y="11.5" width="12" height="3.5" rx="1.5" fill="#023047" opacity="0.3"/>
              <rect x="12.5" y="0" width="5.5" height="8" rx="1.5" fill="#023047" opacity="0.2"/>
            </svg>
          )}
        </button>
      </div>

      <div className="filter-scroll fade-up fade-up-2">
        {FEED_MODES.map(m => {
          const isActive = activeMode === m.id;
          return (
            <div
              key={m.id}
              className="mode-pill tappable"
              onClick={() => setActiveMode(m.id)}
              style={{
                fontFamily: m.font,
                fontWeight: m.fontWeight,
                fontSize: m.fontSize,
                letterSpacing: m.letterSpacing,
                fontStyle: m.fontStyle,
                textTransform: m.textTransform ?? "none",
                background: m.bgActive,
                color: m.colorActive,
                borderColor: m.bgActive,
                position: "relative",
              }}
            >
              {m.label}
              {isActive && (
                <div style={{
                  position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                }}>
                  <div style={{
                    width: 16, height: 2, borderRadius: 1,
                    background: m.colorActive, opacity: 0.7,
                  }} />
                  <div style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: "#FDF2E8",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable content — header + tabs stay pinned above */}
      <div className="feed-scroll-area" ref={feedScrollRef} onScroll={saveScrollPosition}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        {pullDistance > 0 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: pullDistance, overflow: "hidden" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)",
              borderTop: `2px solid ${pullDistance >= PULL_THRESHOLD ? "#FFD166" : "rgba(255,255,255,0.8)"}`,
              transform: `rotate(${pullDistance * 3.6}deg)`,
            }} />
          </div>
        )}

      {loading && <FeedSkeleton />}

      {!loading && feedUser && <YouTubeFeedSection user={feedUser} />}

      {!loading && feedItems.length === 0 && (
        <div className="feed-empty" style={{ whiteSpace: "pre-line" }}>{emptyMessage}</div>
      )}

      {!loading && hero && (
        <>
          <div className="feed-card-enter" style={{ animationDelay: '0ms' }}><FeedItem item={hero} hero expanded={expanded} onOpen={openReader} seen={seenIds.has(hero.id)} readerOpen={!!readerItem} /></div>
          {visibleItems.map((item, i) => (
            <div key={item.id} className="feed-card-enter" style={{ animationDelay: `${Math.min(i * 35 + 40, 280)}ms` }}>
              <FeedItem item={item} expanded={expanded} onOpen={openReader} seen={seenIds.has(item.id)} readerOpen={!!readerItem} />
            </div>
          ))}
          {hasMore ? (
            <div
              className="done-btn fade-up fade-up-6"
              onClick={loadMore}
              style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)" }}
            >
              <div className="done-btn-label" style={{ color: "#023047" }}>Load more</div>
              <div className="done-btn-sub">{Math.min(feedItems.length, FEED_CAP) - visibleCount} more posts waiting</div>
            </div>
          ) : (
            <div className="done-btn fade-up fade-up-6" style={{ gap: 6 }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>✅</div>
              <div className="done-btn-label">You're all caught up</div>
              <div className="done-btn-sub">
                {seenIds.size > 0
                  ? `You've read ${seenIds.size} post${seenIds.size === 1 ? "" : "s"} today · Check back later`
                  : "Nothing new right now · Check back later"}
              </div>
              <div
                onClick={() => {
                  try { localStorage.removeItem("ms_seen_posts"); } catch {}
                  setSeenIds(new Set());
                  previouslySeenIds.current = new Set();
                }}
                style={{ marginTop: 4, fontSize: 11, color: "rgba(142,202,230,0.8)", cursor: "pointer", textDecoration: "underline" }}
              >
                Clear seen history
              </div>
            </div>
          )}
        </>
      )}

      </div>

      {/* In-app reader sheet */}
      {readerItem && (
        <ReaderSheet
          item={readerItem}
          onClose={closeReader}
          allItems={feedItems}
          onNavigate={(item) => { markSeen(item.id); setVideoStartTime(0); setReaderItem(item); }}
          videoStartTime={videoStartTime}
        />
      )}
    </div>
  );
}

// ── WORLD SCREEN ──────────────────────────────────────────

// ── SPORTS SCREEN ────────────────────────────────────────
const LEAGUE_ORDER = ["nba", "nhl", "mlb", "nfl"];
const LEAGUE_LABELS = { nba: "NBA", nhl: "NHL", mlb: "MLB", nfl: "NFL" };

function useSportsScores() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const cacheKey = 'sports-v1';
    const now = Date.now();
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && (now - cached.ts) < 10 * 60 * 1000) {
        setState({ loading: false, data: cached.data, error: null });
        return;
      }
    } catch {}

    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/sports`);
        if (res.status === 429) throw new Error("Rate limited — try again shortly");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        setState({ loading: false, data, error: null });
      } catch (err) {
        setState({ loading: false, data: null, error: err.message });
      }
    })();
  }, []);

  return state;
}

function getGameStatus(game) {
  if (game.status === "Match Finished" || game.status === "FT" ||
      (game.homeScore != null && game.awayScore != null && !game.status?.includes("progress"))) {
    return "final";
  }
  if (game.status && (game.status.includes("progress") || game.status.includes("Live") ||
      /^\d/.test(game.status))) {
    return "live";
  }
  return "scheduled";
}

function formatGameTime(game) {
  if (!game.time) return "";
  try {
    const [h, m] = game.time.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m));
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  } catch { return game.time; }
}

function GameCard({ game }) {
  const status = getGameStatus(game);
  const homeScore = game.homeScore != null ? parseInt(game.homeScore) : null;
  const awayScore = game.awayScore != null ? parseInt(game.awayScore) : null;
  const homeWins = status === "final" && homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWins = status === "final" && homeScore != null && awayScore != null && awayScore > homeScore;

  return (
    <div className="game-card">
      <div className="game-status-row">
        <div className={`game-status ${status}`}>
          {status === "live" ? (game.status || "Live") : status === "final" ? "Final" : formatGameTime(game) || "Scheduled"}
        </div>
        {game.date && <div className="game-time">{game.date}</div>}
      </div>
      <div className="game-teams">
        <div className="game-team-row">
          <div className="game-team-left">
            {game.awayBadge
              ? <img src={game.awayBadge} alt="" className="game-team-badge" />
              : <div className="game-team-badge-placeholder" />}
            <div className={`game-team-name ${awayWins ? "winner" : ""}`}>{game.awayTeam}</div>
          </div>
          {homeScore != null
            ? <div className={`game-score ${awayWins ? "winner" : ""}`}>{awayScore}</div>
            : <div className="game-score pending">—</div>}
        </div>
        <div className="game-team-row">
          <div className="game-team-left">
            {game.homeBadge
              ? <img src={game.homeBadge} alt="" className="game-team-badge" />
              : <div className="game-team-badge-placeholder" />}
            <div className={`game-team-name ${homeWins ? "winner" : ""}`}>{game.homeTeam}</div>
          </div>
          {homeScore != null
            ? <div className={`game-score ${homeWins ? "winner" : ""}`}>{homeScore}</div>
            : <div className="game-score pending">—</div>}
        </div>
      </div>
      {game.venue && <div className="game-venue">{game.venue}</div>}
    </div>
  );
}

function SportsSkeletons() {
  return Array.from({ length: 4 }, (_, i) => (
    <div className="sports-skeleton widget-shimmer" key={i}>
      <div className="sports-skeleton-row">
        <div className="skeleton" style={{ width: 50, height: 12 }} />
        <div className="skeleton" style={{ width: 70, height: 10 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="sports-skeleton-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 100, height: 13 }} />
          </div>
          <div className="skeleton" style={{ width: 24, height: 15 }} />
        </div>
        <div className="sports-skeleton-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 90, height: 13 }} />
          </div>
          <div className="skeleton" style={{ width: 24, height: 15 }} />
        </div>
      </div>
    </div>
  ));
}

function SportsScreen() {
  const { loading, data, error } = useSportsScores();

  if (loading) return (
    <div className="sports-bg">
      <div className="sports-header fade-up fade-up-1">
        <div className="sports-title">Scores</div>
        <div className="sports-subtitle">Today's games & recent results</div>
      </div>
      <div className="fade-up fade-up-2"><SportsSkeletons /></div>
    </div>
  );

  if (error || !data) return (
    <div className="sports-bg">
      <div className="sports-header fade-up fade-up-1">
        <div className="sports-title">Scores</div>
        <div className="sports-subtitle">Today's games & recent results</div>
      </div>
      <div className="sports-error fade-up fade-up-2">
        <Icon.Trophy size={36} color="rgba(253,242,232,0.2)" />
        <div className="sports-error-msg">{error || "Scores unavailable right now"}</div>
      </div>
    </div>
  );

  const leagues = data.leagues || {};

  // Sort games: live first, then scheduled (today), then final (recent)
  const sortGames = (games) => {
    const order = { live: 0, scheduled: 1, final: 2 };
    return [...games].sort((a, b) => order[getGameStatus(a)] - order[getGameStatus(b)]);
  };

  // Merge live + recent + upcoming per league, deduplicate by id
  const mergeLeagueGames = (leagueData) => {
    if (!leagueData) return [];
    const all = [...(leagueData.live || []), ...(leagueData.upcoming || []), ...(leagueData.recent || [])];
    const seen = new Set();
    return sortGames(all.filter(g => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    }));
  };

  const hasAnyGames = LEAGUE_ORDER.some(l => mergeLeagueGames(leagues[l]).length > 0);

  return (
    <div className="sports-bg">
      <div className="sports-header fade-up fade-up-1">
        <div className="sports-title">Scores</div>
        <div className="sports-subtitle">Today's games & recent results</div>
      </div>
      {!hasAnyGames ? (
        <div className="sports-error fade-up fade-up-2">
          <Icon.Trophy size={36} color="rgba(253,242,232,0.2)" />
          <div className="sports-error-msg">No games scheduled right now</div>
        </div>
      ) : (
        LEAGUE_ORDER.map((league, li) => {
          const games = mergeLeagueGames(leagues[league]);
          if (!games.length) return null;
          return (
            <div className={`sports-league-section fade-up fade-up-${li + 2}`} key={league}>
              <div className="sports-league-header">
                <div className="sports-league-name">{LEAGUE_LABELS[league]}</div>
              </div>
              {games.map(g => <GameCard game={g} key={g.id} />)}
            </div>
          );
        })
      )}
      <div className="fade-up fade-up-7" style={{ fontSize: 9, textAlign: 'right', margin: '16px 20px 0', color: 'rgba(253,242,232,0.3)' }}>
        Powered by <a href="https://www.thesportsdb.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(253,242,232,0.4)' }}>TheSportsDB</a>
      </div>
    </div>
  );
}

function useArtOfTheDay() {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `art-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { setState({ loading: false, data: cached }); return; }
    } catch {}

    (async () => {
      try {
        const snap = await getDoc(doc(db, "artOfTheDay", today));
        if (snap.exists()) {
          const data = snap.data();
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setState({ loading: false, data });
        } else {
          setState({ loading: false, data: null });
        }
      } catch {
        setState({ loading: false, data: null });
      }
    })();
  }, []);

  return state;
}

function ArtOfTheDayCard() {
  const { loading, data } = useArtOfTheDay();

  if (loading) return (
    <div className="art-card widget-shimmer" style={{ minHeight: 160 }}>
      <div className="art-image"><Icon.Painting size={64} /></div>
      <div className="art-info">
        <div className="skeleton" style={{ width: '60%', height: 14 }} />
        <div className="skeleton" style={{ width: '80%', height: 10, marginTop: 6 }} />
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="art-card">
      <div className="art-image">
        {data.imageUrl ? (
          <img src={data.imageUrl} alt={data.title} />
        ) : (
          <Icon.Painting size={64} />
        )}
      </div>
      <div className="art-info">
        <div className="art-title">{data.title}</div>
        <div className="art-meta">{data.artist}{data.yearSource ? ` · ${data.yearSource}` : ''}</div>
        {data.description && <div className="art-desc">{data.description}</div>}
      </div>
    </div>
  );
}

function WorldScreen() {
  const [vote, setVote] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [globeExpanded, setGlobeExpanded] = useState(false);
  const { question: pollQuestion, options: POLL_OPTIONS } = useTodaysPoll();
  const TOTAL_VOTES = POLL_OPTIONS.reduce((s, o) => s + o.votes, 0);
  const winnerVotes = Math.max(...POLL_OPTIONS.map(o => o.votes));

  const handleVote = (label) => {
    setVote(label);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 50);
  };

  return (
    <div className="community-bg">
      <div className="community-header fade-up fade-up-1">
        <div className="community-title">Our World</div>
        <div className="community-subtitle">What we all share right now</div>
      </div>

      <div
        className="globe-hero fade-up fade-up-2"
        style={{ overflow: "hidden", padding: 0, cursor: "pointer" }}
        onClick={() => setGlobeExpanded(true)}
      >
        <GlobeCanvas style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: "inherit" }} />
        <div
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 10,
            width: 32, height: 32, borderRadius: 10,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", border: "1px solid rgba(140,180,255,0.15)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(160,200,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10,1 15,1 15,6" />
            <polyline points="6,15 1,15 1,10" />
            <line x1="15" y1="1" x2="10" y2="6" />
            <line x1="1" y1="15" x2="6" y2="10" />
          </svg>
        </div>
      </div>

      {globeExpanded && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          zIndex: 9999, background: "#020308",
          animation: "globeOverlayIn 0.35s ease-out both",
          display: "flex", flexDirection: "column",
        }}>
          {/* Top gradient buffer */}
          <div style={{
            height: 60, flexShrink: 0,
            background: "linear-gradient(to bottom, #06091a 0%, #030510 60%, #020308 100%)",
          }} />
          {/* Globe canvas — fills the middle */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <GlobeCanvas style={{ width: "100%", height: "100%" }} fullscreen />
          </div>
          {/* Bottom gradient buffer */}
          <div style={{
            height: 60, flexShrink: 0,
            background: "linear-gradient(to top, #06091a 0%, #030510 60%, #020308 100%)",
          }} />
          {/* Close button */}
          <div
            onClick={() => setGlobeExpanded(false)}
            style={{
              position: "absolute", top: 16, right: 16, zIndex: 10,
              width: 36, height: 36, borderRadius: 12,
              background: "rgba(6,9,26,0.65)", backdropFilter: "blur(10px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", border: "1px solid rgba(140,180,255,0.12)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(160,200,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,1 1,1 1,4" />
              <polyline points="12,15 15,15 15,12" />
              <line x1="1" y1="1" x2="6" y2="6" />
              <line x1="15" y1="15" x2="10" y2="10" />
            </svg>
          </div>
        </div>
      )}

      <div className="comm-card fade-up fade-up-3">
        <div className="comm-card-header">
          <div>
            <div className="comm-card-title">{pollQuestion}</div>
            <div className="comm-card-sub">{vote ? `${(TOTAL_VOTES + 1).toLocaleString()} responses · anonymous` : "Tap to share anonymously"}</div>
          </div>
          <div className="comm-card-tag">{vote ? "Results" : "Today"}</div>
        </div>
        {!vote ? (
          POLL_OPTIONS.map(opt => (
            <button key={opt.label} className="poll-option" onClick={() => handleVote(opt.label)}>{opt.label}</button>
          ))
        ) : (
          <>
            {POLL_OPTIONS.map(opt => {
              const total = TOTAL_VOTES + 1;
              const votes = opt.votes + (opt.label === vote ? 1 : 0);
              const pct = Math.round((votes / total) * 100);
              const isWinner = opt.votes === winnerVotes;
              const isChosen = opt.label === vote;
              return (
                <div className="poll-result" key={opt.label}>
                  <div className="poll-result-top">
                    <div className="poll-result-label">
                      {isChosen && <Icon.Check size={13} color="#FFBC42" />}
                      <span style={{ color: isChosen ? "#FFBC42" : "#023047", fontWeight: isChosen ? 600 : 500 }}>{opt.label}</span>
                    </div>
                    <div className="poll-result-pct" style={{ color: isWinner ? "#FFBC42" : undefined }}>{pct}%</div>
                  </div>
                  <div className="poll-result-track">
                    <div className={`poll-result-fill ${isWinner ? "winner" : ""} ${isChosen && !isWinner ? "chosen" : ""}`}
                      style={{ width: animating ? "0%" : `${pct}%`, transition: animating ? "none" : "width 0.7s cubic-bezier(0.34,1.2,0.64,1)" }} />
                  </div>
                </div>
              );
            })}
            <div className="poll-total">{(TOTAL_VOTES + 1).toLocaleString()} people have responded today</div>
          </>
        )}
      </div>

      <div className="fade-up fade-up-6">
        <ArtOfTheDayCard />
      </div>
    </div>
  );
}

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
      const existing = readIds;
      const updated = [...existing, videoId];
      await setDoc(doc(db, `users/${user.uid}/settings`, "youtubeRead"), { videoIds: updated.slice(-200) });
    } catch {}
  }, [user, readIds]);

  return { readIds, markRead };
}

function YouTubeCard({ channel, video, isNew, onTap }) {
  const ago = video.published ? (() => {
    const diff = Math.floor((Date.now() - new Date(video.published).getTime()) / 1000);
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  })() : "";

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
}

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
        <YouTubeCard
          key={video.videoId}
          channel={channel}
          video={video}
          isNew={isNew}
          onTap={() => {
            markRead(video.videoId);
            setPlaying({ channel, video });
          }}
        />
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

// ── SETTINGS SCREEN ───────────────────────────────────────
// ── ACCORDION COMPONENT ──────────────────────────────────
function Accordion({ title, count, total, accentColor, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion fade-up fade-up-2">
      <div className="accordion-header" onClick={() => setOpen(o => !o)}>
        <div className="accordion-left">
          {accentColor && (
            <div style={{ width: 10, height: 10, borderRadius: 3, background: accentColor, flexShrink: 0 }} />
          )}
          <span className="accordion-title">{title}</span>
          <span className="accordion-counts">{count}/{total}</span>
        </div>
        <span className={`accordion-chevron ${open ? "open" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="accordion-body accordion-body-animate">
          {children}
        </div>
      )}
    </div>
  );
}

function SettingsScreen({ enabledSubs, onToggleSub, mutedInMode, onToggleMutedInMode, alwaysBlock, onToggleAlwaysBlock }) {
  const [toggles, setToggles] = useState({ slowScroll: false, notification: true, sleepData: false });
  const toggle = k => setToggles(t => ({ ...t, [k]: !t[k] }));
  const ytUser = useAuth();

  const CAT_ACCENT = {
    Animals: "#FF9F43", Nature: "#26de81", Sports: "#FF6B6B",
    Music: "#a55eea", Food: "#fd9644", "Art & Design": "#45aaf2",
    Science: "#2bcbba", Uplifting: "#FFD166", "Global/Wonder": "#219EBC",
    Zen: "#a0b8d0", Travel: "#45aaf2",
  };

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

      {/* ── SECTION 1: MY MORNING ── */}
      <span className="section-label fade-up fade-up-2">
        My Morning <span style={{ color: "rgba(253,242,232,0.5)", fontWeight: 400, letterSpacing: 0 }}>· your custom feed</span>
      </span>

      {/* Subreddits for My Morning */}
      {Object.entries(SUBREDDIT_CATEGORIES).map(([category, subs]) => {
        const enabledInCat = subs.filter(s => enabledSubs.includes(s)).length;
        return (
          <Accordion key={category} title={`r/${category.toLowerCase()}`} count={enabledInCat} total={subs.length} accentColor={CAT_ACCENT[category]}>
            {subs.map(sub => (
              <div key={sub} className={`sub-chip ${enabledSubs.includes(sub) ? "on" : "off"}`}
                onClick={() => onToggleSub(sub)}>
                r/{sub}
              </div>
            ))}
          </Accordion>
        );
      })}

      {/* ── SECTION 2: FEED MODES ── */}
      <span className="section-label fade-up fade-up-2" style={{ marginTop: 8 }}>
        Feed Modes <span style={{ color: "rgba(253,242,232,0.5)", fontWeight: 400, letterSpacing: 0 }}>· mute from presets</span>
      </span>
      <div style={{ padding: "0 20px 4px", fontSize: 11, color: "#8a9ab5", lineHeight: 1.5 }}>
        Tap any source to mute it from that mode. Muted sources move to the bottom.
      </div>

      {FEED_MODES.filter(m => m.id !== "my-morning" && m.id !== "drift" && m.categories).map(m => {
        const modeSubs = m.categories.flatMap(cat => SUBREDDIT_CATEGORIES[cat] ?? []);
        const muted = mutedInMode[m.id] ?? [];
        const activeCount = modeSubs.length - muted.length;
        const activeSubs = modeSubs.filter(s => !muted.includes(s));
        const mutedSubs = modeSubs.filter(s => muted.includes(s));
        return (
          <Accordion key={m.id} title={m.label} count={activeCount} total={modeSubs.length}
            accentColor={m.bgActive}>
            {/* Active subs first */}
            {activeSubs.map(sub => (
              <div key={sub} className="sub-chip on"
                style={{ background: m.bgActive, borderColor: m.bgActive, color: m.colorActive }}
                onClick={() => onToggleMutedInMode(m.id, sub)}>
                r/{sub}
              </div>
            ))}
            {/* Muted subs at bottom, greyed */}
            {mutedSubs.map(sub => (
              <div key={sub} className="sub-chip off"
                style={{ opacity: 0.45, textDecoration: "line-through" }}
                onClick={() => onToggleMutedInMode(m.id, sub)}>
                r/{sub}
              </div>
            ))}
          </Accordion>
        );
      })}

      {/* ── SECTION 3: ALWAYS BLOCK ── */}
      <span className="section-label fade-up fade-up-3" style={{ marginTop: 8 }}>
        Always Block <span style={{ color: "rgba(253,242,232,0.5)", fontWeight: 400, letterSpacing: 0 }}>· excluded everywhere</span>
      </span>
      <div style={{ padding: "0 20px 4px", fontSize: 11, color: "#8a9ab5", lineHeight: 1.5 }}>
        Toggle off any source to block it from every feed mode.
      </div>

      {Object.entries(SUBREDDIT_CATEGORIES).map(([category, subs]) => (
        <Accordion key={`block-${category}`} title={`r/${category.toLowerCase()}`}
          count={subs.filter(s => !alwaysBlock.includes(s)).length}
          total={subs.length} accentColor={CAT_ACCENT[category]}>
          {subs.map(sub => {
            const blocked = alwaysBlock.includes(sub);
            return (
              <div key={sub}
                className={`sub-chip ${blocked ? "off" : "on"}`}
                style={blocked
                  ? { opacity: 0.45, textDecoration: "line-through" }
                  : { background: "#023047", borderColor: "#023047", color: "#8ECAE6" }}
                onClick={() => onToggleAlwaysBlock(sub)}>
                r/{sub}
              </div>
            );
          })}
        </Accordion>
      ))}

      {/* ── OTHER SETTINGS ── */}
      <span className="section-label fade-up fade-up-4">Feed Settings</span>
      {[
        { key: "slowScroll", Ico: Icon.Turtle, label: "Slow scroll mode", value: "15 cards per morning" },
      ].map(s => (
        <div className="setting-row fade-up fade-up-4" key={s.key}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#023047" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <Toggle on={toggles[s.key]} onToggle={() => toggle(s.key)} />
        </div>
      ))}

      <span className="section-label fade-up fade-up-4">Widgets</span>
      {[
        { Ico: Icon.Calendar, label: "Calendar", value: "Showing today's events" },
        { Ico: Icon.Image, label: "Photo Memory", value: "On this day · 2 years back" },
        { Ico: Icon.Moon, label: "Moon Phase", value: "Visible on Home tab" },
      ].map((s, i) => (
        <div className="setting-row fade-up fade-up-4" key={i}>
          <div className="setting-left">
            <div className="setting-icon"><s.Ico size={18} color="#023047" /></div>
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
            <div className="setting-icon"><s.Ico size={18} color="#023047" /></div>
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
            <div className="setting-icon"><s.Ico size={18} color="#023047" /></div>
            <div><div className="setting-name">{s.label}</div><div className="setting-value">{s.value}</div></div>
          </div>
          <Toggle on={toggles[s.key]} onToggle={() => toggle(s.key)} />
        </div>
      ))}
    </div>
  );
}

// ── BACKGROUND GRADIENT (per-tab) ────────────────────────
const HOME_GRADIENT = "linear-gradient(in oklch 175deg, #081020 0%, #0B1528 8%, #10203E 18%, #162D52 28%, #1E3D62 38%, #2E5575 48%, #4E7E94 56%, #80A8B5 64%, #AAC8C8 72%, #CCDCCE 78%, #E0E8D6 84%, #EEEEDE 90%, #FFF4E0 100%)";
const OTHER_GRADIENT = "linear-gradient(in oklch 175deg, #081020 0%, #0B1528 8%, #10203E 18%, #162D52 28%, #1E3555 38%, #2E4E68 48%, #4A7080 56%, #6E9098 64%, #90AAA8 72%, #AAB8AC 78%, #C0C8B8 84%, #D0D0C4 90%, #DCD8CC 100%)";

// ── Living sunrise: tall gradient strip, visible window slides up over 270s ──
// 19 stops spanning dark blue → light blue → gold. The gradient is 180% tall.
// Start: window shows top (dark blue to light blue). End: window shows bottom (mid-blue to gold).
const SUNRISE_GRADIENT = `linear-gradient(in oklch 175deg,
  #081020 0%, #0B1528 5.5%, #10203E 11%, #162D52 16.5%, #1E3D62 22%,
  #2B5278 27.5%, #3A6A8E 33%, #4E82A0 38.5%, #6498B0 44%, #7EAEBB 49.5%,
  #98C2C6 55%, #B0D0CC 60.5%, #CCDCCC 66%, #E8EACC 71.5%, #F0EABC 77%,
  #F5E8A8 82.5%, #F8E698 88%, #FAE48E 94%, #FCE488 100%
)`;

const getBgStyle = () => ({
  background: SUNRISE_GRADIENT,
  backgroundSize: '100% 180%',
});

// ── NAV TABS ──────────────────────────────────────────────
const TABS = [
  { id: "home",     label: "Home",     ActiveIcon: p => <Icon.Home     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Home     {...p} color="rgba(12,26,53,0.35)" /> },
  { id: "feed",     label: "Feed",     ActiveIcon: p => <Icon.Feed     {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Feed     {...p} color="rgba(12,26,53,0.35)" /> },
  { id: "world",    label: "World",    ActiveIcon: p => <Icon.Globe    {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Globe    {...p} color="rgba(12,26,53,0.35)" /> },
  { id: "sports",   label: "Scores",   ActiveIcon: p => <Icon.Trophy   {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Trophy   {...p} color="rgba(12,26,53,0.35)" /> },
  { id: "settings", label: "Settings", ActiveIcon: p => <Icon.Settings {...p} color="#0C1A35" />, InactiveIcon: p => <Icon.Settings {...p} color="rgba(12,26,53,0.35)" /> },
];

// ── APP SHELL ─────────────────────────────────────────────
export default function MorningScrollApp() {
  const [tab, setTab] = useState("home");
  const [wordleOpen, setWordleOpen] = useState(false);
  const [wordleClosing, setWordleClosing] = useState(false);
  const screenRef = useRef(null);
  const gyro = useGyroscope();
  const colorTemp = useColorTemp();

  // Living sunrise is pure CSS — no JS state needed (see .phone animation)

  // All subs enabled by default
  const [enabledSubs, setEnabledSubs] = useState(ALL_SUBREDDITS);

  // Per-mode muted subs: { gentle: ['Meditation'], curious: [] ... }
  const [mutedInMode, setMutedInMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ms_muted_in_mode') ?? '{}'); }
    catch { return {}; }
  });

  // Always block — sources/subs excluded from every mode
  const [alwaysBlock, setAlwaysBlock] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ms_always_block') ?? '[]'); }
    catch { return []; }
  });

  const toggleMutedInMode = (modeId, sub) => {
    setMutedInMode(prev => {
      const current = prev[modeId] ?? [];
      const next = current.includes(sub)
        ? current.filter(s => s !== sub)
        : [...current, sub];
      const updated = { ...prev, [modeId]: next };
      try { localStorage.setItem('ms_muted_in_mode', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const toggleAlwaysBlock = (source) => {
    setAlwaysBlock(prev => {
      const next = prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source];
      try { localStorage.setItem('ms_always_block', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleSub = (sub) => {
    setEnabledSubs(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
  };

  useEffect(() => { if (screenRef.current) screenRef.current.scrollTop = 0; }, [tab]);

  const closeWordle = () => {
    setWordleClosing(true);
    setTimeout(() => { setWordleOpen(false); setWordleClosing(false); }, 260);
  };

  const Screen = () => {
    switch (tab) {
      case "home":     return <HomeScreen onOpenWordle={() => setWordleOpen(true)} />;
      case "feed":     return <FeedScreen enabledSubs={enabledSubs} mutedInMode={mutedInMode} alwaysBlock={alwaysBlock} />;
      case "world":    return <WorldScreen />;
      case "sports":   return <SportsScreen />;
      case "settings": return <SettingsScreen enabledSubs={enabledSubs} onToggleSub={toggleSub} mutedInMode={mutedInMode} onToggleMutedInMode={toggleMutedInMode} alwaysBlock={alwaysBlock} onToggleAlwaysBlock={toggleAlwaysBlock} />;
      default:         return <HomeScreen onOpenWordle={() => setWordleOpen(true)} />;
    }
  };

  const now = new Date();
  const clockTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <style>{styles + wordleCss}</style>
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0a1628", padding: "20px" }}>
        <div className="phone" id="phone-shell" style={{ ...getBgStyle(), '--gyro-x': gyro.x, '--gyro-y': gyro.y, filter: colorTemp }}>
          {/* Status Bar */}
          <div className="status-bar">
            <div className="status-time">{clockTime}</div>
            <div style={{ width: 120, height: 30, background: "#0a1628", borderRadius: 15, position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)" }} />
            <div style={{ display: "flex", gap: 2 }}>
              <span className="status-wifi" style={{ fontSize: 10 }}>●●● WiFi ▮▮▮</span>
            </div>
          </div>

          {/* Main Screen */}
          <div className="screen rubber-scroll" ref={screenRef} style={tab === "feed" ? { overflowY: "hidden" } : {}}>
            <Screen />
          </div>

          {/* Bottom Nav */}
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

          {/* Wordle Bottom Sheet */}
          {wordleOpen && (
            <div className={`wordle-sheet${wordleClosing ? " closing" : ""}`}>
              <div className="ws-handle-bar">
                <div className="ws-handle"/>
                <button className="ws-close" onClick={closeWordle}>Done</button>
              </div>
              <WordleGame />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
