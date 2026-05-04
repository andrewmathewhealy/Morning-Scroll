import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { TextureLoader, ShaderMaterial, Vector2 } from "three";
import "./pulseMap.css";

// ── SUN POSITION ─────────────────────────────────────────
function getSunPosition() {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000);
  const declination = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const longitude = (12 - utcH) * 15;
  return [longitude, declination]; // [lng, lat]
}

// ── DAY/NIGHT SHADER ─────────────────────────────────────
// From react-globe.gl official day-night-cycle example
const DAY_NIGHT_SHADER = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

    vec3 Polar2Cartesian(in vec2 c) {
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1, 0, 0,
        0, cos(invLat), -sin(invLat),
        0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0, sin(invLon),
        0, 1, 0,
        -sin(invLon), 0, cos(invLon)
      );
      vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float blendFactor = smoothstep(-0.1, 0.1, intensity);
      gl_FragColor = mix(nightColor, dayColor, blendFactor);
    }
  `,
};

// ── CITY DATABASE ────────────────────────────────────────
const CITIES = [
  { name: "New York", lat: 40.71, lng: -74.01, tz: "America/New_York" },
  { name: "London", lat: 51.51, lng: -0.13, tz: "Europe/London" },
  { name: "Tokyo", lat: 35.68, lng: 139.69, tz: "Asia/Tokyo" },
  { name: "Sydney", lat: -33.87, lng: 151.21, tz: "Australia/Sydney" },
  { name: "Paris", lat: 48.86, lng: 2.35, tz: "Europe/Paris" },
  { name: "Dubai", lat: 25.20, lng: 55.27, tz: "Asia/Dubai" },
  { name: "Singapore", lat: 1.35, lng: 103.82, tz: "Asia/Singapore" },
  { name: "Los Angeles", lat: 34.05, lng: -118.24, tz: "America/Los_Angeles" },
  { name: "Mumbai", lat: 19.08, lng: 72.88, tz: "Asia/Kolkata" },
  { name: "Cairo", lat: 30.04, lng: 31.24, tz: "Africa/Cairo" },
  { name: "Berlin", lat: 52.52, lng: 13.41, tz: "Europe/Berlin" },
  { name: "Rio de Janeiro", lat: -22.91, lng: -43.17, tz: "America/Sao_Paulo" },
  { name: "Moscow", lat: 55.76, lng: 37.62, tz: "Europe/Moscow" },
  { name: "Seoul", lat: 37.57, lng: 126.98, tz: "Asia/Seoul" },
  { name: "Mexico City", lat: 19.43, lng: -99.13, tz: "America/Mexico_City" },
  { name: "Lagos", lat: 6.52, lng: 3.38, tz: "Africa/Lagos" },
  { name: "Bangkok", lat: 13.76, lng: 100.50, tz: "Asia/Bangkok" },
  { name: "Istanbul", lat: 41.01, lng: 28.98, tz: "Europe/Istanbul" },
  { name: "Buenos Aires", lat: -34.60, lng: -58.38, tz: "America/Argentina/Buenos_Aires" },
  { name: "Nairobi", lat: -1.29, lng: 36.82, tz: "Africa/Nairobi" },
  { name: "Chicago", lat: 41.88, lng: -87.63, tz: "America/Chicago" },
  { name: "Denver", lat: 39.74, lng: -104.99, tz: "America/Denver" },
  { name: "Honolulu", lat: 21.31, lng: -157.86, tz: "Pacific/Honolulu" },
  { name: "Auckland", lat: -36.85, lng: 174.76, tz: "Pacific/Auckland" },
  { name: "Cape Town", lat: -33.92, lng: 18.42, tz: "Africa/Johannesburg" },
  { name: "Toronto", lat: 43.65, lng: -79.38, tz: "America/Toronto" },
  { name: "Shanghai", lat: 31.23, lng: 121.47, tz: "Asia/Shanghai" },
  { name: "Hong Kong", lat: 22.32, lng: 114.17, tz: "Asia/Hong_Kong" },
  { name: "Rome", lat: 41.90, lng: 12.50, tz: "Europe/Rome" },
  { name: "Lima", lat: -12.05, lng: -77.04, tz: "America/Lima" },
];

function findNearestCity(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const city of CITIES) {
    const dLat = city.lat - lat;
    const dLng = city.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) { bestDist = dist; best = city; }
  }
  return best;
}

function getLocalTime(tz) {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit",
  }).toLowerCase();
}

function isDaytime(lat, lng, sunLng, sunLat) {
  const toRad = Math.PI / 180;
  const dot =
    Math.cos(lat * toRad) * Math.cos(lng * toRad) * Math.cos(sunLat * toRad) * Math.cos(sunLng * toRad) +
    Math.cos(lat * toRad) * Math.sin(lng * toRad) * Math.cos(sunLat * toRad) * Math.sin(sunLng * toRad) +
    Math.sin(lat * toRad) * Math.sin(sunLat * toRad);
  return dot > 0;
}

// ── COMPONENT ────────────────────────────────────────────
export default function SunriseGlobe({ style }) {
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [globeMaterial, setGlobeMaterial] = useState(null);
  const [sunPos, setSunPos] = useState(getSunPosition); // [lng, lat]
  const [selectedCity, setSelectedCity] = useState(null);
  const [hintVisible, setHintVisible] = useState(true);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load textures and create shader material
  useEffect(() => {
    const loader = new TextureLoader();
    Promise.all([
      loader.loadAsync("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg"),
      loader.loadAsync("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg"),
    ]).then(([dayTex, nightTex]) => {
      const mat = new ShaderMaterial({
        uniforms: {
          dayTexture: { value: dayTex },
          nightTexture: { value: nightTex },
          sunPosition: { value: new Vector2(...getSunPosition()) },
          globeRotation: { value: new Vector2() },
        },
        vertexShader: DAY_NIGHT_SHADER.vertexShader,
        fragmentShader: DAY_NIGHT_SHADER.fragmentShader,
      });
      setGlobeMaterial(mat);
    });
  }, []);

  // Orient to user timezone on mount
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const tzLon = (new Date().getTimezoneOffset() / 60) * -15;
    globe.pointOfView({ lat: 20, lng: tzLon, altitude: 2.2 }, 0);
  }, []);

  // Update sun position every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const pos = getSunPosition();
      setSunPos(pos);
      if (globeMaterial) {
        globeMaterial.uniforms.sunPosition.value.set(...pos);
      }
    }, 30000);
    return () => clearInterval(id);
  }, [globeMaterial]);

  // Sync sun on material ready
  useEffect(() => {
    if (globeMaterial) {
      globeMaterial.uniforms.sunPosition.value.set(...sunPos);
    }
  }, [globeMaterial]);

  // Update globe rotation uniform when user rotates
  const handleZoom = useCallback(({ lng, lat }) => {
    if (globeMaterial) {
      globeMaterial.uniforms.globeRotation.value.set(lng, lat);
    }
  }, [globeMaterial]);

  // Fade hint
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // City dots
  const cityPoints = useMemo(() =>
    CITIES.map(c => ({
      lat: c.lat, lng: c.lng, size: 0.25,
      color: isDaytime(c.lat, c.lng, sunPos[0], sunPos[1]) ? "rgba(255,200,50,0.9)" : "rgba(100,160,255,0.7)",
      name: c.name,
    })),
    [sunPos]
  );

  // Ring on tapped city
  const [ringsData, setRingsData] = useState([]);

  const handleGlobeClick = useCallback(({ lat, lng }) => {
    const city = findNearestCity(lat, lng);
    if (city) {
      setSelectedCity(city);
      setRingsData([{ lat: city.lat, lng: city.lng, maxR: 4, propagationSpeed: 2, repeatPeriod: 1200 }]);
      setTimeout(() => setRingsData([]), 5000);
    }
  }, []);

  return (
    <div ref={containerRef} className="pulse-map-container" style={style}>
      {/* Starfield */}
      <div className="pulse-map-stars">
        {Array.from({ length: 80 }, (_, i) => (
          <div
            key={i}
            className="pulse-map-star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 1.5 + 0.5}px`,
              height: `${Math.random() * 1.5 + 0.5}px`,
              animationDelay: `${Math.random() * 4}s`,
              opacity: Math.random() * 0.5 + 0.1,
            }}
          />
        ))}
      </div>

      {dimensions.width > 0 && dimensions.height > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeMaterial={globeMaterial}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={true}
          atmosphereColor="rgba(80,140,255,0.2)"
          atmosphereAltitude={0.2}
          animateIn={true}
          onGlobeClick={handleGlobeClick}
          onZoom={handleZoom}
          pointsData={cityPoints}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="size"
          pointAltitude={0.01}
          pointsMerge={false}
          ringsData={ringsData}
          ringLat="lat"
          ringLng="lng"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
          ringColor={() => "rgba(255,200,80,0.5)"}
        />
      )}

      {/* Hint */}
      <div className="pulse-map-hint" style={{ opacity: hintVisible ? 1 : 0 }}>
        tap to see local time
      </div>

      {/* City info card */}
      {selectedCity && (
        <div onClick={() => setSelectedCity(null)} style={{
          position: "absolute", bottom: 16, left: 16, right: 16,
          background: "rgba(12,26,53,0.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          borderRadius: 16, padding: "14px 18px",
          border: "1px solid rgba(253,242,232,0.1)",
          cursor: "pointer", zIndex: 10,
          animation: "journalSlideUp 0.3s cubic-bezier(0.36, 1.3, 0.64, 1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 16, fontWeight: 600, color: "#FDF2E8" }}>
                {selectedCity.name}
              </div>
              <div style={{ fontSize: 12, color: "rgba(253,242,232,0.45)", marginTop: 2 }}>
                {isDaytime(selectedCity.lat, selectedCity.lng, sunPos[0], sunPos[1]) ? "Daytime" : "Nighttime"}
              </div>
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600,
              color: isDaytime(selectedCity.lat, selectedCity.lng, sunPos[0], sunPos[1]) ? "#FFB703" : "#8ECAE6",
            }}>
              {getLocalTime(selectedCity.tz)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
