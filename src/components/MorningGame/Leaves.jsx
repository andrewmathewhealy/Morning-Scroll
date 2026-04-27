import { useState, useEffect, useRef, useCallback, useMemo } from "react";
const AUTO_COMPLETE_MS = 4000;
import { createPortal } from "react-dom";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./leaves.css";

const LEAF_COUNT = 9;
const LEAF_COLORS = [
  "#D4793A", "#C4603A", "#E8A84C", "#B85535", "#D98E4E",
  "#CC6B3A", "#E0964A", "#A84E30", "#DBA050",
];
// Detailed leaf SVGs — maple, oak, birch styles
const LEAF_SVGS = [
  // Maple leaf
  (color, size) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 2 L14 8 L8 6 L11 12 L4 12 L10 16 L6 22 L12 19 L14 26 L16 30 L18 26 L20 19 L26 22 L22 16 L28 12 L21 12 L24 6 L18 8 Z" fill={color} opacity="0.85"/>
      <path d="M16 4 L16 28" stroke={`${color}dd`} strokeWidth="0.6" fill="none" opacity="0.5"/>
      <path d="M11 12 L16 16 L21 12" stroke={`${color}dd`} strokeWidth="0.4" fill="none" opacity="0.3"/>
      <path d="M12 19 L16 22 L20 19" stroke={`${color}dd`} strokeWidth="0.4" fill="none" opacity="0.3"/>
    </svg>
  ),
  // Oak leaf
  (color, size) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 2 C14 5 10 6 8 9 C10 10 9 13 7 15 C9 16 9 19 8 21 C10 21 11 24 10 26 C13 25 15 28 16 30 C17 28 19 25 22 26 C21 24 22 21 24 21 C23 19 23 16 25 15 C23 13 22 10 24 9 C22 6 18 5 16 2Z" fill={color} opacity="0.85"/>
      <path d="M16 4 L16 28" stroke={`${color}dd`} strokeWidth="0.6" fill="none" opacity="0.5"/>
      <path d="M10 10 L16 14" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.3"/>
      <path d="M22 10 L16 14" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.3"/>
      <path d="M9 17 L16 20" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.3"/>
      <path d="M23 17 L16 20" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.3"/>
    </svg>
  ),
  // Rounded/birch leaf
  (color, size) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <ellipse cx="16" cy="15" rx="9" ry="12" fill={color} opacity="0.85" transform="rotate(-5 16 15)"/>
      <path d="M16 3 L16 28" stroke={`${color}dd`} strokeWidth="0.7" fill="none" opacity="0.5"/>
      <path d="M10 9 L16 12" stroke={`${color}dd`} strokeWidth="0.35" fill="none" opacity="0.3"/>
      <path d="M22 9 L16 12" stroke={`${color}dd`} strokeWidth="0.35" fill="none" opacity="0.3"/>
      <path d="M9 15 L16 17" stroke={`${color}dd`} strokeWidth="0.35" fill="none" opacity="0.3"/>
      <path d="M23 15 L16 17" stroke={`${color}dd`} strokeWidth="0.35" fill="none" opacity="0.3"/>
      <path d="M10 21 L16 22" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.25"/>
      <path d="M22 21 L16 22" stroke={`${color}dd`} strokeWidth="0.3" fill="none" opacity="0.25"/>
    </svg>
  ),
];

export default function Leaves({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const [swiped, setSwiped] = useState(new Set());
  const [swipeAnims, setSwipeAnims] = useState({}); // id -> {direction}
  const [fadeOut, setFadeOut] = useState(false);
  const swipedCount = useRef(0);
  const startTime = useRef(performance.now());
  const animRef = useRef(null);
  const touchRef = useRef({}); // track swipe start per leaf

  const leaves = useMemo(() =>
    Array.from({ length: LEAF_COUNT }, (_, i) => ({
      id: i,
      x: 8 + Math.random() * 78,
      startY: -10 - (i / LEAF_COUNT) * 50,
      size: 28 + Math.random() * 16,
      speed: 6 + Math.random() * 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 30,
      wobbleAmp: 2 + Math.random() * 3,
      wobbleOffset: Math.random() * Math.PI * 2,
      color: LEAF_COLORS[i % LEAF_COLORS.length],
      shapeIdx: i % LEAF_SVGS.length,
      spawnDelay: (i / LEAF_COUNT) * 2,
    })),
  []);

  const [positions, setPositions] = useState(() =>
    leaves.map(l => ({ ...l, y: l.startY, rot: l.rotation, visible: false }))
  );

  // Animate falling
  useEffect(() => {
    let lastTime = performance.now();
    function tick(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const elapsed = (now - startTime.current) / 1000;

      setPositions(prev => prev.map(l => {
        if (elapsed < l.spawnDelay) return { ...l, visible: false };
        const t = elapsed - l.spawnDelay;
        const wobbleX = Math.sin(t / 2 * Math.PI + l.wobbleOffset) * l.wobbleAmp;
        return {
          ...l,
          y: l.y + l.speed * dt,
          x: l.x + wobbleX * dt * 10,
          rot: l.rot + l.rotSpeed * dt,
          visible: l.y <= 110,
        };
      }));

      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [leaves]);

  // Auto-complete after 4 seconds regardless
  const completedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 800);
      }
    }, AUTO_COMPLETE_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleTouchStart = useCallback((id, e) => {
    const touch = e.touches?.[0] || e;
    touchRef.current[id] = { startX: touch.clientX, startY: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((id, e) => {
    const start = touchRef.current[id];
    if (!start || swiped.has(id)) return;

    const touch = e.changedTouches?.[0] || e;
    const dx = touch.clientX - start.startX;
    const dy = touch.clientY - start.startY;

    // Need a horizontal swipe of at least 30px
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;

    const direction = dx > 0 ? 1 : -1;
    const newSwiped = new Set(swiped);
    newSwiped.add(id);
    setSwiped(newSwiped);
    setSwipeAnims(prev => ({ ...prev, [id]: { direction } }));

    swipedCount.current += 1;
    haptics.tap();

    // Ascending whoosh pitch
    const freq = 200 + (swipedCount.current / LEAF_COUNT) * 400;
    audio.playNote(freq, 0.4);

    if (newSwiped.size >= LEAF_COUNT && !completedRef.current) {
      completedRef.current = true;
      audio.playCompletion();
      haptics.success();
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 800);
      }, 400);
    }

    delete touchRef.current[id];
  }, [swiped, audio, haptics, onComplete]);

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  return createPortal(
    <div
      className={`mg-leaves-overlay ${fadeOut ? "mg-leaves-fadeout" : ""}`}
      style={{ pointerEvents: "auto" }}
    >
      {positions.map(l => {
        if (!l.visible || swiped.has(l.id)) return null;
        const swipeAnim = swipeAnims[l.id];
        return (
          <div
            key={l.id}
            className={`mg-leaf ${swipeAnim ? "mg-leaf-swiped" : ""}`}
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: l.size,
              height: l.size,
              transform: `rotate(${l.rot}deg)`,
              pointerEvents: "auto",
              "--swipe-dir": swipeAnim ? swipeAnim.direction : 1,
            }}
            onTouchStart={(e) => { e.preventDefault(); handleTouchStart(l.id, e); }}
            onTouchEnd={(e) => handleTouchEnd(l.id, e)}
            onMouseDown={(e) => handleTouchStart(l.id, e)}
            onMouseUp={(e) => handleTouchEnd(l.id, e)}
          >
            {LEAF_SVGS[l.shapeIdx](l.color, l.size)}
          </div>
        );
      })}
    </div>,
    phoneEl
  );
}
