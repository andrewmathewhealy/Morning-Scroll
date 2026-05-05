import { useState, useEffect, useMemo } from "react";
import { Icon } from "../../icons/Icon.jsx";
import { AnimSun, AnimMoon, AnimCloud, AnimCloudRain, AnimCloudSnow, AnimCloudLightning, AnimCloudDrizzle, AnimWind } from "../../icons/AnimatedWeatherIcons.jsx";
import { WORKER_URL } from "../../config.js";

// ── WEATHER CONDITION MAP ─────────────────────────────────
// All 22 Visual Crossing icon values, mapped to:
//   label     → friendly display string
//   icon      → animated icon component
//   bg        → CSS gradient for the widget background
const WEATHER_MAP = {
  'clear-day':             { label: 'Clear Skies',         icon: () => AnimSun,            bg: 'linear-gradient(135deg, #c47a20 0%, #e8a840 40%, #f5c862 100%)', effect: 'sunny', tone: 'night', image: '/weather/clear-day.png' },
  'clear-night':           { label: 'Clear Night',         icon: () => AnimMoon,           bg: 'linear-gradient(135deg, #081020 0%, #0C1A35 50%, #142848 100%)', effect: 'stars', tone: 'night', image: '/weather/clear-day.png', overlay: 'rgba(12,26,53,0.55)' },
  'partly-cloudy-day':     { label: 'Partly Cloudy',       icon: () => AnimCloud,          bg: 'linear-gradient(135deg, #4a7a9a 0%, #7a9ab0 50%, #c4a35a 100%)', effect: 'sunny', tone: 'night', image: '/weather/partly-cloudy-day.png' },
  'partly-cloudy-night':   { label: 'Partly Cloudy Night', icon: () => AnimCloud,          bg: 'linear-gradient(135deg, #0C1A35 0%, #1a3255 50%, #2a4a7a 100%)', effect: 'stars', tone: 'night', image: '/weather/partly-cloudy-day.png', overlay: 'rgba(12,26,53,0.55)' },
  'cloudy':                { label: 'Overcast',            icon: () => AnimCloud,          bg: 'linear-gradient(135deg, #3a4a5a 0%, #5a6a78 50%, #7a8890 100%)', effect: null, tone: 'night', image: '/weather/overcast.png', overlay: 'rgba(80,80,80,0.4)' },
  'fog':                   { label: 'Foggy',               icon: () => AnimWind,           bg: 'linear-gradient(135deg, #4a5568 0%, #718096 50%, #a0aec0 100%)', effect: null, tone: 'night', image: '/weather/overcast.png', overlay: 'rgba(80,80,80,0.5)' },
  'wind':                  { label: 'Windy',               icon: () => AnimWind,           bg: 'linear-gradient(135deg, #2d4a6e 0%, #4a7a9b 50%, #7fb3cc 100%)', effect: null, tone: 'night', image: '/weather/overcast.png', overlay: 'rgba(80,80,80,0.35)' },
  'rain':                  { label: 'Rainy',               icon: () => AnimCloudRain,      bg: 'linear-gradient(135deg, #1a2535 0%, #2a3d55 50%, #3a5570 100%)', effect: 'rain', tone: 'night', image: '/weather/rain.png' },
  'showers-day':           { label: 'Rain Showers',        icon: () => AnimCloudRain,      bg: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a7a 50%, #5a8fa8 100%)', effect: 'rain', tone: 'night', image: '/weather/rain.png' },
  'showers-night':         { label: 'Overnight Showers',   icon: () => AnimCloudRain,      bg: 'linear-gradient(135deg, #0d1f35 0%, #1a3050 50%, #2d4f6e 100%)', effect: 'rain', tone: 'night', image: '/weather/rain.png', overlay: 'rgba(12,26,53,0.4)' },
  'thunder-rain':          { label: 'Thunderstorms',       icon: () => AnimCloudLightning, bg: 'linear-gradient(135deg, #0d0d1f 0%, #16213e 50%, #0f3460 100%)', effect: 'rain', tone: 'night', image: '/weather/stormy.png', overlay: 'rgba(80,80,80,0.4)' },
  'thunder-showers-day':   { label: 'Stormy',              icon: () => AnimCloudLightning, bg: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 50%, #4a3a6e 100%)', effect: 'rain', tone: 'night', image: '/weather/stormy.png', overlay: 'rgba(80,80,80,0.4)' },
  'thunder-showers-night': { label: 'Stormy Night',        icon: () => AnimCloudLightning, bg: 'linear-gradient(135deg, #0d0d1f 0%, #1a1a35 50%, #2d2040 100%)', effect: 'rain', tone: 'night', image: '/weather/stormy.png', overlay: 'rgba(12,26,53,0.55)' },
  'snow':                  { label: 'Snowing',             icon: () => AnimCloudSnow,      bg: 'linear-gradient(135deg, #c8dce8 0%, #a0b8cc 50%, #7a98b0 100%)', effect: 'snow', tone: 'night', image: '/weather/snow.png' },
  'snow-showers-day':      { label: 'Snow Showers',        icon: () => AnimCloudSnow,      bg: 'linear-gradient(135deg, #b0c8d8 0%, #8aa8c0 50%, #6a8aa5 100%)', effect: 'snow', tone: 'night', image: '/weather/snow.png' },
  'snow-showers-night':    { label: 'Overnight Snow',      icon: () => AnimCloudSnow,      bg: 'linear-gradient(135deg, #0d1a2e 0%, #1a2e45 50%, #3a5570 100%)', effect: 'snow', tone: 'night', image: '/weather/snow.png', overlay: 'rgba(12,26,53,0.4)' },
  'sleet':                 { label: 'Sleet',               icon: () => AnimCloudSnow,      bg: 'linear-gradient(135deg, #2a3d55 0%, #455e75 50%, #7a9ab0 100%)', effect: 'snow', tone: 'night', image: '/weather/snow.png' },
  'hail':                  { label: 'Hail',                icon: () => AnimCloudSnow,      bg: 'linear-gradient(135deg, #1f3040 0%, #354f65 50%, #6a8fa8 100%)', effect: 'snow', tone: 'night', image: '/weather/snow.png' },
  'tornado':               { label: 'Tornado Warning',     icon: () => AnimWind,           bg: 'linear-gradient(135deg, #1a0a0a 0%, #3d1515 50%, #6e2020 100%)', effect: null, tone: 'night', image: '/weather/stormy.png', overlay: 'rgba(80,80,80,0.5)' },
  'drizzle':               { label: 'Light Drizzle',       icon: () => AnimCloudDrizzle,   bg: 'linear-gradient(135deg, #243b55 0%, #3d5c78 50%, #6a8fa8 100%)', effect: 'drizzle', tone: 'night', image: '/weather/rain.png' },
  'freezing-drizzle':      { label: 'Freezing Drizzle',    icon: () => AnimCloudDrizzle,   bg: 'linear-gradient(135deg, #1e3040 0%, #304f65 50%, #6080a0 100%)', effect: 'drizzle', tone: 'night', image: '/weather/rain.png' },
  'freezing-rain':         { label: 'Freezing Rain',       icon: () => AnimCloudRain,      bg: 'linear-gradient(135deg, #1a2535 0%, #2d4055 50%, #4a6a85 100%)', effect: 'rain', tone: 'night', image: '/weather/rain.png' },
};

const DEFAULT_WEATHER = { label: 'Loading…', icon: () => AnimSun, bg: 'linear-gradient(135deg, #0C1A35 0%, #219EBC 100%)', effect: null };

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

const MOON_STARS = [
  { x: 12, y: 8, size: 1, dur: 3.2, delay: 0 },
  { x: 28, y: 18, size: 1, dur: 4.8, delay: 1.1 },
  { x: 75, y: 6, size: 1, dur: 2.9, delay: 0.5 },
  { x: 88, y: 22, size: 1, dur: 5.4, delay: 2.3 },
  { x: 45, y: 12, size: 1, dur: 3.7, delay: 0.8 },
  { x: 62, y: 25, size: 1, dur: 4.1, delay: 1.9 },
  { x: 8, y: 28, size: 1, dur: 6.2, delay: 3.1 },
  { x: 92, y: 10, size: 1.5, dur: 3.5, delay: 0.3 },
  { x: 35, y: 4, size: 1, dur: 5.1, delay: 2.7 },
  { x: 55, y: 20, size: 1, dur: 4.4, delay: 1.5 },
  { x: 18, y: 30, size: 1, dur: 6.8, delay: 4.0 },
  { x: 70, y: 15, size: 1.5, dur: 3.9, delay: 0.7 },
];

function MoonWidget({ moonphase }) {
  if (moonphase == null) return (
    <div className="moon-widget widget-shimmer">
      <Icon.Moon size={38} color="#0C1A35" />
      <div className="moon-pct">--</div>
      <div className="moon-phase">Loading…</div>
    </div>
  );
  const { name, file, pct, illum, glowX } = getMoonInfo(moonphase);
  return (
    <div className="moon-widget">
      {MOON_STARS.map((s, i) => (
        <div key={i} className="moon-star" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          animationDuration: `${s.dur}s`,
          animationDelay: `${s.delay}s`,
        }} />
      ))}
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

export function useWeather() {
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

export function WeatherWidget() {
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

  const isDay = cfg.tone === 'day';
  const textColor = isDay ? '#0C1A35' : '#FDF2E8';
  const borderColor = isDay ? 'rgba(12,26,53,0.15)' : 'rgba(253,242,232,0.8)';

  return (
    <div className="weather-widget" style={{ background: cfg.bg }}>
      {cfg.image && (
        <img src={cfg.image} alt="" style={{
          position: 'absolute', inset: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)',
          objectFit: 'cover', objectPosition: cfg.imagePosition || 'center top', borderRadius: 'inherit',
          zIndex: 0,
        }} />
      )}
      {cfg.overlay && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          background: cfg.overlay, zIndex: 0,
        }} />
      )}
      <WeatherEffect effect={cfg.effect} />
      <div className="weather-icon-wrap" style={{ position: 'relative', zIndex: 1 }}><WeatherIcon size={28} color={textColor} /></div>
      <div className="weather-temp" style={{ color: textColor }}>{data.temp}°F</div>
      <div className="weather-condition" style={{ color: textColor }}>{cfg.label}</div>
      {data.hours?.length > 0 && (
        <div className="weather-forecast" style={{ borderTopColor: borderColor }}>
          {data.hours.map((h, i) => {
            const hourCfg = getWeatherConfig(h.icon);
            const HourIcon = hourCfg.icon();
            const hour = parseInt(h.time.split(':')[0], 10);
            const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
            return (
              <div className="weather-hour" key={i}>
                <div className="weather-hour-time" style={{ color: textColor }}>{label}</div>
                <HourIcon size={14} color={textColor} />
                <div className="weather-hour-temp" style={{ color: textColor }}>{h.temp}°</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { MoonWidget };
