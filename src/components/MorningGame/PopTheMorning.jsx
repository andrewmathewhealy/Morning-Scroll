import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./pop.css";

const BUBBLE_COUNT = 11;

export default function PopTheMorning({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const [popped, setPopped] = useState(new Set());
  const [pops, setPops] = useState([]); // {id, x, y} for burst animations
  const poppedCount = useRef(0);
  const animRef = useRef(null);
  const startTime = useRef(performance.now());
  const positionsRef = useRef({}); // track current positions for burst placement
  const [fadeOut, setFadeOut] = useState(false);

  const bubbles = useMemo(() =>
    Array.from({ length: BUBBLE_COUNT }, (_, i) => {
      const size = 40 + Math.random() * 24;
      return {
        id: i,
        x: 8 + Math.random() * 76, // percent
        startY: -8 - Math.random() * 15, // just above screen
        size,
        speed: 8 + Math.random() * 5, // percent per second — gentle
        wobbleAmp: 3 + Math.random() * 4,
        wobbleOffset: Math.random() * Math.PI * 2,
        wobblePeriod: 2.5 + Math.random() * 1.5,
        hue: 190 + Math.random() * 50,
      };
    }),
  []);

  // Animate falling
  const [positions, setPositions] = useState(() =>
    bubbles.map(b => ({ ...b, y: b.startY, visible: false }))
  );

  useEffect(() => {
    let lastTime = performance.now();
    function tick(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const elapsed = (now - startTime.current) / 1000;

      setPositions(prev => prev.map((b, i) => {
        const spawnTime = (i / BUBBLE_COUNT) * 1.5; // stagger over 1.5s
        if (elapsed < spawnTime) return { ...b, visible: false };
        const newY = b.y + b.speed * dt;
        const pos = { ...b, y: newY, visible: newY <= 105 };
        positionsRef.current[b.id] = pos;
        return pos;
      }));

      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [bubbles]);

  const handlePop = useCallback((id) => {
    if (popped.has(id)) return;
    const newPopped = new Set(popped);
    newPopped.add(id);
    setPopped(newPopped);

    const count = poppedCount.current;
    poppedCount.current = count + 1;

    // Record burst position
    const pos = positionsRef.current[id];
    if (pos) {
      const t = (performance.now() - startTime.current) / 1000;
      const wobbleX = Math.sin(t / pos.wobblePeriod * Math.PI * 2 + pos.wobbleOffset) * pos.wobbleAmp;
      setPops(prev => [...prev, { id, x: pos.x + wobbleX, y: pos.y }]);
    }

    haptics.tap();

    if (newPopped.size >= BUBBLE_COUNT) {
      audio.playChord([262, 330, 392, 523], 0.8);
      haptics.success();
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 600);
      }, 400);
    } else {
      audio.playPop(count);
    }
  }, [popped, audio, haptics, onComplete]);

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  return createPortal(
    <div
      className={`mg-pop-overlay ${fadeOut ? "mg-pop-fadeout" : ""}`}
      style={{ pointerEvents: "none" }}
    >
      {positions.map(b => {
        if (!b.visible || popped.has(b.id)) return null;
        const t = (performance.now() - startTime.current) / 1000;
        const wobbleX = Math.sin(t / b.wobblePeriod * Math.PI * 2 + b.wobbleOffset) * b.wobbleAmp;
        return (
          <div
            key={b.id}
            className="mg-bubble"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handlePop(b.id); }}
            style={{
              left: `calc(${b.x}% + ${wobbleX}%)`,
              top: `${b.y}%`,
              width: b.size,
              height: b.size,
              "--bubble-hue": b.hue,
            }}
          >
            <div className="mg-bubble-inner" />
          </div>
        );
      })}

      {/* Pop burst animations */}
      {pops.map(p => (
        <div key={`burst-${p.id}`} className="mg-pop-burst" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="mg-pop-particle" style={{
              "--angle": `${(i / 6) * 360}deg`,
              "--dist": `${18 + Math.random() * 12}px`,
              background: `hsla(${190 + Math.random() * 50}, 60%, 80%, 0.6)`,
            }} />
          ))}
        </div>
      ))}
    </div>,
    phoneEl
  );
}
