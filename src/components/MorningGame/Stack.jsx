import { useState, useEffect, useRef, useCallback } from "react";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./stack.css";

const BLOCK_COLORS = ["#F0A8A0", "#D898AC", "#C8B8D8", "#B8DDE8", "#C0C080"];
const BLOCK_COUNT = 5;
const SPEEDS = [80, 100, 120, 140, 160];
const BLOCK_HEIGHT = 32;
const GAP = 3;
const BLOCK_WIDTH_PCT = 55;
const SLIDE_HEIGHT = 44; // px above landing spot

export default function Stack({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const [placed, setPlaced] = useState([]);
  const [sliding, setSliding] = useState(null);
  const [dropping, setDropping] = useState(null);
  const [encouragement, setEncouragement] = useState(null); // "Flawless!" etc
  const [goodMorning, setGoodMorning] = useState(false);
  const [done, setDone] = useState(false);
  const animRef = useRef(null);

  const currentBlock = placed.length;
  const towerBottom = 24;

  const landingY = (blockIndex) => towerBottom + blockIndex * (BLOCK_HEIGHT + GAP);
  const slideY = (blockIndex) => landingY(blockIndex) + SLIDE_HEIGHT;

  // Start sliding the next block
  useEffect(() => {
    if (currentBlock >= BLOCK_COUNT || done) return;
    if (currentBlock === 0) {
      setPlaced([{ x: 0, quality: "perfect" }]);
      audio.playDrop(0);
      haptics.tap();
      return;
    }
    setSliding({ x: -50, direction: 1 });
  }, [currentBlock, done]);

  // Animate sliding
  useEffect(() => {
    if (!sliding) return;
    const speed = SPEEDS[currentBlock - 1] || 120;
    let lastTime = performance.now();

    function tick(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setSliding(prev => {
        if (!prev) return null;
        let newX = prev.x + prev.direction * speed * dt;
        let newDir = prev.direction;
        if (newX > 50) { newX = 50; newDir = -1; }
        if (newX < -50) { newX = -50; newDir = 1; }
        return { x: newX, direction: newDir };
      });
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [sliding !== null, currentBlock]);

  const handleDrop = useCallback(() => {
    if (!sliding || dropping) return;
    cancelAnimationFrame(animRef.current);

    const offset = Math.abs(sliding.x - (placed[placed.length - 1]?.x || 0));
    let quality;
    if (offset <= 5) quality = "perfect";
    else if (offset <= 20) quality = "good";
    else if (offset <= 40) quality = "okay";
    else quality = "off";

    const newPlaced = [...placed, { x: sliding.x, quality }];
    setDropping({ x: sliding.x, quality, index: currentBlock });
    setSliding(null);

    audio.playDrop(currentBlock, quality === "perfect");
    haptics.tap();

    // After drop animation completes
    setTimeout(() => {
      setPlaced(newPlaced);
      setDropping(null);

      if (newPlaced.length >= BLOCK_COUNT) {
        const perfects = newPlaced.filter(b => b.quality === "perfect").length;
        let msg;
        if (perfects >= BLOCK_COUNT) msg = "Flawless!";
        else if (perfects >= BLOCK_COUNT - 1) msg = "Great job!";
        else if (perfects >= 2) msg = "Nice stack!";
        else msg = "Well done!";

        setTimeout(() => {
          setEncouragement(msg);
          audio.playCompletion();
          haptics.success();

          // Fade encouragement → good morning
          setTimeout(() => {
            setEncouragement(null);
            setTimeout(() => {
              setGoodMorning(true);
              setTimeout(() => {
                setDone(true);
                onComplete?.();
              }, 1500);
            }, 200);
          }, 1400);
        }, 600);
      }
    }, 350);
  }, [sliding, dropping, placed, currentBlock, audio, haptics, onComplete]);

  return (
    <div className="mg-stack-container" onPointerDown={handleDrop}>
      {/* Ground line */}
      <div className="mg-stack-ground" />

      {/* Placed blocks */}
      {placed.map((block, i) => (
        <div
          key={i}
          className={`mg-stack-block mg-stack-placed ${block.quality !== "perfect" && block.quality !== "good" ? "mg-stack-wobble" : ""} ${i === placed.length - 1 && placed.length >= BLOCK_COUNT ? "mg-stack-celebrate" : ""}`}
          style={{
            background: BLOCK_COLORS[i],
            bottom: landingY(i),
            left: `calc(50% + ${block.x}px - ${BLOCK_WIDTH_PCT / 2}%)`,
            width: `${BLOCK_WIDTH_PCT}%`,
            height: BLOCK_HEIGHT,
          }}
        />
      ))}

      {/* Dropping block — animates from slide position to landing position */}
      {dropping && (
        <div
          className="mg-stack-block mg-stack-dropping"
          style={{
            background: BLOCK_COLORS[dropping.index],
            left: `calc(50% + ${dropping.x}px - ${BLOCK_WIDTH_PCT / 2}%)`,
            width: `${BLOCK_WIDTH_PCT}%`,
            height: BLOCK_HEIGHT,
            "--drop-from": `${slideY(dropping.index)}px`,
            "--drop-to": `${landingY(dropping.index)}px`,
          }}
        />
      )}

      {/* Sliding block */}
      {sliding && !dropping && (
        <div
          className="mg-stack-block mg-stack-sliding"
          style={{
            background: BLOCK_COLORS[currentBlock],
            left: `calc(50% + ${sliding.x}px - ${BLOCK_WIDTH_PCT / 2}%)`,
            width: `${BLOCK_WIDTH_PCT}%`,
            height: BLOCK_HEIGHT,
            bottom: slideY(currentBlock),
          }}
        />
      )}

      {/* Encouragement label */}
      {encouragement && (
        <div className="mg-stack-label mg-stack-encourage">{encouragement}</div>
      )}

      {/* Good morning */}
      {goodMorning && (
        <div className="mg-stack-label mg-stack-goodmorning">good morning ☀️</div>
      )}

      {/* Tap hint */}
      {sliding && !dropping && placed.length === 1 && (
        <div className="mg-stack-hint">tap to drop</div>
      )}
    </div>
  );
}
