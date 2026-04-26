import { useRef, useState, useEffect, useCallback } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import { useRadioBrowser } from "./useRadioBrowser.js";
import { useGlobeData } from "./useGlobeData.js";
import StationPicker from "./StationPicker.jsx";
import "./pulseMap.css";

export default function PulseMap({ style, fullscreen = false, radioPlayer }) {
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const { stations, loading, error, country, fetchStations } = useRadioBrowser();
  const { pointsData, ringsData, sunPos } = useGlobeData(selectedCoords, stations);

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

  // Orient to user timezone on mount
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const tzLon = (new Date().getTimezoneOffset() / 60) * -15;
    globe.pointOfView({ lat: 20, lng: tzLon, altitude: fullscreen ? 2.8 : 2.2 }, 0);
  }, [fullscreen]);

  // Solar terminator lighting
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const scene = globe.scene();
    if (!scene) return;

    // Remove old lights we added
    scene.children
      .filter(c => c.userData?.pulseMapLight)
      .forEach(c => scene.remove(c));

    // Ambient for night side
    const ambient = new THREE.AmbientLight(0x222244, 0.4);
    ambient.userData = { pulseMapLight: true };
    scene.add(ambient);

    // Directional light at subsolar point
    const sunR = 100;
    const latRad = sunPos.lat * Math.PI / 180;
    const lngRad = sunPos.lng * Math.PI / 180;
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(
      sunR * Math.cos(latRad) * Math.cos(lngRad),
      sunR * Math.sin(latRad),
      sunR * Math.cos(latRad) * Math.sin(lngRad)
    );
    sunLight.userData = { pulseMapLight: true };
    scene.add(sunLight);
  }, [sunPos]);

  // Fade hint after 4s
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const handleGlobeClick = useCallback(({ lat, lng }) => {
    if (radioPlayer) radioPlayer.stop();
    setSelectedCoords({ lat, lng });
    setShowPicker(true);
    fetchStations(lat, lng);
  }, [fetchStations, radioPlayer]);

  const handleSelectStation = useCallback((station) => {
    if (radioPlayer) radioPlayer.play(station);
  }, [radioPlayer]);

  const handleClosePicker = useCallback(() => {
    setShowPicker(false);
  }, []);

  return (
    <div ref={containerRef} className="pulse-map-container" style={style}>
      {/* CSS starfield */}
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
          globeImageUrl="/Land_ocean_ice.jpg"
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={true}
          atmosphereColor="rgba(60,140,255,0.25)"
          atmosphereAltitude={0.2}
          animateIn={true}
          onGlobeClick={handleGlobeClick}
          pointsData={pointsData}
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
          ringColor={() => "rgba(255,204,0,0.6)"}
        />
      )}

      {/* Hint */}
      <div className="pulse-map-hint" style={{ opacity: hintVisible ? 1 : 0 }}>
        tap to tune in
      </div>

      {/* Station picker */}
      {showPicker && (
        <StationPicker
          stations={stations}
          loading={loading}
          error={error}
          country={country}
          onSelect={handleSelectStation}
          onClose={handleClosePicker}
          currentStation={radioPlayer?.station}
          radioStatus={radioPlayer?.status}
          onTogglePlay={radioPlayer?.togglePlay}
          onStop={radioPlayer?.stop}
        />
      )}
    </div>
  );
}
