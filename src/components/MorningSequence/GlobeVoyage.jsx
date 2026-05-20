import { useRef, useState, useEffect, useCallback } from "react";
import Globe from "react-globe.gl";

const TODAY_LOCATION = {
  name: "Tokyo, Japan",
  lat: 35.6762,
  lng: 139.6503,
  photos: [
    "/assets/test/tokyo-1.jpg",
    "/assets/test/tokyo-2.jpg",
    "/assets/test/tokyo-3.jpg",
  ],
  credit: "Photo on Pexels",
};

export default function GlobeVoyage({ active, onAdvance }) {
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [phase, setPhase] = useState("entering");
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoFading, setPhotoFading] = useState(false);
  const [snapIn, setSnapIn] = useState(false);
  const timerRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Preload all photos
  useEffect(() => {
    let loaded = 0;
    TODAY_LOCATION.photos.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === TODAY_LOCATION.photos.length) setPhotosLoaded(true);
      };
      img.src = src;
    });
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

    const startLat = -TODAY_LOCATION.lat;
    const startLng = TODAY_LOCATION.lng + 160;
    globe.pointOfView({ lat: startLat, lng: startLng, altitude: 2.5 }, 0);

    setPhase("entering");

    const t1 = setTimeout(() => {
      setPhase("spinning");
      globe.pointOfView(
        { lat: TODAY_LOCATION.lat, lng: TODAY_LOCATION.lng, altitude: 2.0 },
        3000
      );
    }, 500);

    const t2 = setTimeout(() => {
      setPhase("zoomed");
      globe.pointOfView(
        { lat: TODAY_LOCATION.lat, lng: TODAY_LOCATION.lng, altitude: 1.2 },
        1500
      );
    }, 3500);

    const t3 = setTimeout(() => setPhase("placename"), 5000);
    const t4 = setTimeout(() => setPhase("dissolve"), 6200);
    const t5 = setTimeout(() => setPhase("photo"), 7000);

    // Photo 2: fade out at 9.5s (300ms), swap + fade in at 9.85s
    const t6 = setTimeout(() => {
      if (phaseRef.current === "photo") setPhotoFading(true);
    }, 9500);
    const t6b = setTimeout(() => {
      if (phaseRef.current === "photo") {
        setSnapIn(true);
        setPhotoIndex(1);
        setPhotoFading(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setSnapIn(false)));
      }
    }, 9850);

    // Photo 3: fade out at 12.5s (300ms), swap + fade in at 12.85s
    const t7 = setTimeout(() => {
      if (phaseRef.current === "photo") setPhotoFading(true);
    }, 12500);
    const t7b = setTimeout(() => {
      if (phaseRef.current === "photo") {
        setSnapIn(true);
        setPhotoIndex(2);
        setPhotoFading(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setSnapIn(false)));
      }
    }, 12850);

    // Auto-advance after last photo hold
    const t8 = setTimeout(() => {
      if (phaseRef.current !== "blurring") {
        setPhase("blurring");
        timerRef.current = setTimeout(() => onAdvance(), 900);
      }
    }, 15500);

    return () => {
      [t1, t2, t3, t4, t5, t6, t6b, t7, t7b, t8].forEach(clearTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, onAdvance]);

  const handleTap = useCallback(() => {
    if (phase === "photo") {
      // If more photos, advance to next; otherwise exit
      if (photoIndex < TODAY_LOCATION.photos.length - 1) {
        setPhotoFading(true);
        setTimeout(() => {
          setSnapIn(true);
          setPhotoIndex((i) => i + 1);
          setPhotoFading(false);
          requestAnimationFrame(() => requestAnimationFrame(() => setSnapIn(false)));
        }, 350);
      } else {
        setPhase("blurring");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onAdvance(), 900);
      }
    } else if (phase !== "blurring" && phase !== "entering") {
      setPhase("dissolve");
      setTimeout(() => setPhase("photo"), 500);
    }
  }, [phase, photoIndex, onAdvance]);

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

      <div className={`place-name${showPlaceName ? " visible" : ""}${phase === "dissolve" ? " fading" : ""}`}>
        {TODAY_LOCATION.name}
      </div>

      {showPhoto && (
        <>
          <div
            className={`voyage-photo${phase === "photo" || phase === "blurring" ? " visible ken-burns" : phase === "dissolve" ? " visible" : ""}${phase === "blurring" ? " blurring" : ""}${photoFading ? " crossfade" : ""}${snapIn ? " snap-in" : ""}`}
            style={{ backgroundImage: photosLoaded ? `url(${TODAY_LOCATION.photos[photoIndex]})` : "none" }}
          />
          <div className={`photo-credit${phase === "photo" && !photoFading ? " visible" : ""}`}>
            {TODAY_LOCATION.credit}
          </div>
        </>
      )}
    </div>
  );
}
