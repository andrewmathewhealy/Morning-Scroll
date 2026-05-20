import { useRef, useState, useEffect, useCallback } from "react";
import Globe from "react-globe.gl";

const TODAY_LOCATION = {
  name: "Tokyo, Japan",
  lat: 35.6762,
  lng: 139.6503,
  photo: "/assets/test/tokyo-1.jpg",
  credit: "Photo on Pexels",
};

export default function GlobeVoyage({ active, onAdvance }) {
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [phase, setPhase] = useState("entering"); // entering | spinning | settled | zoomed | placename | dissolve | photo | blurring
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const timerRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Preload photo
  useEffect(() => {
    const img = new Image();
    img.onload = () => setPhotoLoaded(true);
    img.src = TODAY_LOCATION.photo;
  }, []);

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

  // Run the cinematic sequence when active
  useEffect(() => {
    if (!active) return;
    const globe = globeRef.current;
    if (!globe) return;

    // Start on opposite side of earth
    const startLat = -TODAY_LOCATION.lat;
    const startLng = TODAY_LOCATION.lng + 160;
    globe.pointOfView({ lat: startLat, lng: startLng, altitude: 2.5 }, 0);

    // Phase 1 — entering, globe fades in (handled by CSS)
    setPhase("entering");

    const t1 = setTimeout(() => {
      setPhase("spinning");
      // Phase 2 — decelerate to target
      globe.pointOfView(
        { lat: TODAY_LOCATION.lat, lng: TODAY_LOCATION.lng, altitude: 2.0 },
        3000
      );
    }, 500);

    const t2 = setTimeout(() => {
      setPhase("zoomed");
      // Phase 3 — zoom in
      globe.pointOfView(
        { lat: TODAY_LOCATION.lat, lng: TODAY_LOCATION.lng, altitude: 1.2 },
        1500
      );
    }, 3500);

    const t3 = setTimeout(() => {
      setPhase("placename");
    }, 5000);

    const t4 = setTimeout(() => {
      setPhase("dissolve");
    }, 6200);

    const t5 = setTimeout(() => {
      setPhase("photo");
    }, 7000);

    // Auto-advance after photo hold
    const t6 = setTimeout(() => {
      if (phaseRef.current !== "blurring") {
        setPhase("blurring");
        timerRef.current = setTimeout(() => onAdvance(), 900);
      }
    }, 9500);

    return () => {
      [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, onAdvance]);

  const handleTap = useCallback(() => {
    if (phase === "photo") {
      setPhase("blurring");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onAdvance(), 900);
    } else if (phase !== "blurring" && phase !== "entering") {
      // Skip to photo
      setPhase("dissolve");
      setTimeout(() => setPhase("photo"), 500);
    }
  }, [phase, onAdvance]);

  const showGlobe = phase !== "dissolve" && phase !== "photo" && phase !== "blurring";
  const showPlaceName = phase === "placename" || phase === "zoomed";
  const showPhoto = phase === "dissolve" || phase === "photo" || phase === "blurring";

  return (
    <div
      ref={containerRef}
      className={`globe-voyage${active ? " visible" : ""}`}
      onClick={handleTap}
      style={{ background: "#0a0a0f" }}
    >
      {/* Globe */}
      {showGlobe && dimensions.width > 0 && dimensions.height > 0 && (
        <div className="globe-container" style={{ opacity: phase === "entering" ? 0 : 1, transition: "opacity 500ms ease-out" }}>
          <Globe
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            globeImageUrl="/Land_ocean_ice.jpg"
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor="#4488ff"
            atmosphereAltitude={0.15}
            showAtmosphere={true}
            enableZoomInteraction={false}
            enablePanInteraction={false}
            enableRotateInteraction={false}
            animateIn={false}
          />
        </div>
      )}

      {/* Place name */}
      <div className={`place-name${showPlaceName ? " visible" : ""}${phase === "dissolve" ? " fading" : ""}`}>
        {TODAY_LOCATION.name}
      </div>

      {/* Photo */}
      {showPhoto && (
        <>
          <div
            className={`voyage-photo${phase === "photo" || phase === "blurring" ? " visible ken-burns" : phase === "dissolve" ? " visible" : ""}${phase === "blurring" ? " blurring" : ""}`}
            style={{ backgroundImage: photoLoaded ? `url(${TODAY_LOCATION.photo})` : "none" }}
          />
          <div className={`photo-credit${phase === "photo" ? " visible" : ""}`}>
            {TODAY_LOCATION.credit}
          </div>
        </>
      )}
    </div>
  );
}
