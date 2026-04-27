import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./stars.css";

const STAR_COUNT = 9;
const CONNECT_DIST = 35; // percent — stars within this distance get a line

export default function Stars({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const [stars, setStars] = useState([]);
  const [fadeOut, setFadeOut] = useState(false);
  const [complete, setComplete] = useState(false);
  const containerRef = useRef(null);
  const completedRef = useRef(false);

  const handleTap = useCallback((e) => {
    if (fadeOut || complete) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.touches?.[0] || e;
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;

    const count = stars.length + 1;
    haptics.tap();
    audio.playPop(count - 1);

    const newStars = [...stars, { x, y, id: Date.now() + Math.random() }];
    setStars(newStars);

    if (count >= STAR_COUNT) {
      completedRef.current = true;
      setComplete(true);
      audio.playCompletion();
      haptics.success();
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 1000);
      }, 1500);
    }
  }, [stars, fadeOut, complete, audio, haptics, onComplete]);

  // Find constellation lines — connect stars that are close enough
  const lines = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dx = stars[i].x - stars[j].x;
      const dy = stars[i].y - stars[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < CONNECT_DIST) {
        lines.push({ x1: stars[i].x, y1: stars[i].y, x2: stars[j].x, y2: stars[j].y, key: `${i}-${j}` });
      }
    }
  }

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`mg-stars-overlay ${fadeOut ? "mg-stars-fadeout" : ""}`}
      onPointerDown={handleTap}
    >
      {/* Constellation lines */}
      <svg className="mg-stars-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map(l => (
          <line
            key={l.key}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(253,242,232,0.15)"
            strokeWidth="0.3"
            className="mg-constellation-line"
          />
        ))}
      </svg>

      {/* Stars */}
      {stars.map((s, i) => (
        <div
          key={s.id}
          className={`mg-placed-star ${complete ? "mg-star-pulse" : ""}`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            animationDelay: complete ? `${i * 0.08}s` : undefined,
          }}
        >
          <div className="mg-star-glow" />
          <div className="mg-star-dot" />
        </div>
      ))}

      {/* Counter hint */}
      {!complete && (
        <div className="mg-stars-hint">
          {stars.length === 0 ? "tap to place stars" : `${stars.length} / ${STAR_COUNT}`}
        </div>
      )}
    </div>,
    phoneEl
  );
}
