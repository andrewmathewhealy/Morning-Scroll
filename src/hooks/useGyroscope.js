import { useState, useEffect, useRef } from "react";

// Returns a smoothed { x, y } tilt based on DeviceOrientation events.
// Values are clamped to roughly ±30 degrees and lerped on RAF for stability.
export function useGyroscope() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const smoothed = useRef({ x: 0, y: 0 });
  const raf = useRef(null);

  useEffect(() => {
    const handleOrientation = (e) => {
      const rawX = (e.gamma ?? 0);
      const rawY = (e.beta ?? 45) - 45;

      const clampedX = Math.max(-30, Math.min(30, rawX));
      const clampedY = Math.max(-30, Math.min(30, rawY));

      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        smoothed.current.x += (clampedX - smoothed.current.x) * 0.12;
        smoothed.current.y += (clampedY - smoothed.current.y) * 0.12;
        setTilt({ x: smoothed.current.x, y: smoothed.current.y });
      });
    };

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then(p => { if (p === "granted") window.addEventListener("deviceorientation", handleOrientation); })
        .catch(() => {});
    } else {
      window.addEventListener("deviceorientation", handleOrientation);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return tilt;
}
