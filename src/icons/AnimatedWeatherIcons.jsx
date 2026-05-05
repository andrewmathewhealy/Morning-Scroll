// Animated weather icons — calming, slow looping animations
// Used in the weather widget for a living feel

const STYLE = `
@keyframes aw-ray { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
@keyframes aw-cloud-drift { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(1.5px); } }
@keyframes aw-rain-drop { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0.2; transform: translateY(2.5px); } }
@keyframes aw-snow-fall { 0% { opacity: 1; transform: translateY(0) rotate(0deg); } 100% { opacity: 0.3; transform: translateY(2.5px) rotate(60deg); } }
@keyframes aw-bolt-flash { 0%, 85%, 100% { opacity: 1; } 90% { opacity: 0.2; } 95% { opacity: 0.9; } }
@keyframes aw-wind-gust { 0%, 100% { opacity: 0.5; transform: translateX(0); } 50% { opacity: 1; transform: translateX(1.5px); } }
@keyframes aw-moon-glow { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = STYLE;
  document.head.appendChild(el);
}

// Sun — rays fade in/out in a circular sequence
export function AnimSun({ size = 28, color = "#EAF4FB" }) {
  injectStyle();
  const rays = [
    { x1: 12, y1: 2, x2: 12, y2: 4 },
    { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 },
    { x1: 20, y1: 12, x2: 22, y2: 12 },
    { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 },
    { x1: 12, y1: 20, x2: 12, y2: 22 },
    { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 },
    { x1: 2, y1: 12, x2: 4, y2: 12 },
    { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      {rays.map((r, i) => (
        <line key={i} {...r} style={{ animation: `aw-ray 4s ease-in-out ${i * 0.5}s infinite` }} />
      ))}
    </svg>
  );
}

// Cloud — gentle side-to-side drift
export function AnimCloud({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" style={{ animation: "aw-cloud-drift 6s ease-in-out infinite" }} />
    </svg>
  );
}

// Cloud Rain — cloud drifts, drops stagger down
export function AnimCloudRain({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" style={{ animation: "aw-cloud-drift 6s ease-in-out infinite" }} />
      <line x1="8" y1="19" x2="8" y2="21" style={{ animation: "aw-rain-drop 1.6s ease-in 0s infinite" }} />
      <line x1="12" y1="21" x2="12" y2="23" style={{ animation: "aw-rain-drop 1.6s ease-in 0.4s infinite" }} />
      <line x1="16" y1="19" x2="16" y2="21" style={{ animation: "aw-rain-drop 1.6s ease-in 0.8s infinite" }} />
    </svg>
  );
}

// Cloud Snow — cloud drifts, flakes drift and rotate
export function AnimCloudSnow({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" style={{ animation: "aw-cloud-drift 6s ease-in-out infinite" }} />
      <line x1="8" y1="20" x2="8" y2="20.01" style={{ animation: "aw-snow-fall 2.4s ease-in-out 0s infinite" }} />
      <line x1="12" y1="22" x2="12" y2="22.01" style={{ animation: "aw-snow-fall 2.4s ease-in-out 0.6s infinite" }} />
      <line x1="16" y1="20" x2="16" y2="20.01" style={{ animation: "aw-snow-fall 2.4s ease-in-out 1.2s infinite" }} />
    </svg>
  );
}

// Cloud Lightning — cloud drifts, bolt flickers
export function AnimCloudLightning({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" style={{ animation: "aw-cloud-drift 6s ease-in-out infinite" }} />
      <polyline points="13 11 9 17 15 17 11 23" style={{ animation: "aw-bolt-flash 4s ease-in-out infinite" }} />
    </svg>
  );
}

// Cloud Drizzle — cloud drifts, drops stagger
export function AnimCloudDrizzle({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" style={{ animation: "aw-cloud-drift 6s ease-in-out infinite" }} />
      <line x1="8" y1="19" x2="8" y2="21" style={{ animation: "aw-rain-drop 2.2s ease-in 0s infinite" }} />
      <line x1="16" y1="19" x2="16" y2="21" style={{ animation: "aw-rain-drop 2.2s ease-in 0.6s infinite" }} />
      <line x1="12" y1="21" x2="12" y2="23" style={{ animation: "aw-rain-drop 2.2s ease-in 1.2s infinite" }} />
    </svg>
  );
}

// Wind — gusts shift in and out
export function AnimWind({ size = 22, color = "#EAF4FB" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2" style={{ animation: "aw-wind-gust 4s ease-in-out 0s infinite" }} />
      <path d="M12.59 19.41A2 2 0 1 0 14 16H2" style={{ animation: "aw-wind-gust 4s ease-in-out 1s infinite" }} />
      <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" style={{ animation: "aw-wind-gust 4s ease-in-out 2s infinite" }} />
    </svg>
  );
}

// Moon — gentle glow pulse
export function AnimMoon({ size = 36, color = "#023047" }) {
  injectStyle();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" style={{ animation: "aw-moon-glow 5s ease-in-out infinite" }} />
    </svg>
  );
}
