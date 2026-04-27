import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./ripples.css";

const TAP_COUNT = 8;

export default function Ripples({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const [ripples, setRipples] = useState([]);
  const [fadeOut, setFadeOut] = useState(false);
  const tapCount = useRef(0);
  const containerRef = useRef(null);

  const handleTap = useCallback((e) => {
    if (fadeOut) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.touches?.[0] || e;
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;

    // Pitch based on vertical position — higher at top, lower at bottom
    const normalizedY = 1 - (y / 100);
    const freq = 220 + normalizedY * 440; // A3 to A4 range

    tapCount.current += 1;
    const count = tapCount.current;

    haptics.tap();
    audio.playNote(freq, 0.8);

    // Add 3 concentric rings per tap
    const id = Date.now() + Math.random();
    setRipples(prev => [
      ...prev,
      { id: id + 0, x, y, delay: 0, size: 1 },
      { id: id + 1, x, y, delay: 0.12, size: 0.7 },
      { id: id + 2, x, y, delay: 0.24, size: 0.45 },
    ]);

    if (count >= TAP_COUNT) {
      audio.playCompletion();
      haptics.success();
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 800);
      }, 600);
    }
  }, [fadeOut, audio, haptics, onComplete]);

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`mg-ripples-overlay ${fadeOut ? "mg-ripples-fadeout" : ""}`}
      onPointerDown={handleTap}
    >
      {ripples.map(r => (
        <div
          key={r.id}
          className="mg-ripple-ring"
          style={{
            left: `${r.x}%`,
            top: `${r.y}%`,
            animationDelay: `${r.delay}s`,
            "--ripple-size": r.size,
          }}
        />
      ))}
    </div>,
    phoneEl
  );
}
