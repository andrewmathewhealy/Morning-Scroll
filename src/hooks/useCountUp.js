import { useState, useEffect, useRef } from "react";

// Animates a numeric value from 0 to `target` with an ease-out-quart curve.
// Accepts a string target like "128°" and preserves the non-numeric suffix.
export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const start = useRef(null);
  const targetNum = parseFloat(String(target).replace(/[^0-9.]/g, "")) || 0;
  const suffix = String(target).replace(/[0-9.]/g, "");
  useEffect(() => {
    if (targetNum === 0) return;
    start.current = null;
    const step = (ts) => {
      if (!start.current) start.current = ts;
      const p = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(ease * targetNum));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [targetNum, duration]);
  return val + suffix;
}
