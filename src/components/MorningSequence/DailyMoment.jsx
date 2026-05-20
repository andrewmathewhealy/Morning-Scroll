import { useState, useRef, useEffect } from "react";

function HandwrittenGreeting({ visible, fading }) {
  const [reveal, setReveal] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    const duration = 2500;
    let raf;

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      // ease-out curve for natural writing feel
      const eased = 1 - (1 - t) * (1 - t);
      setReveal(eased * 100);
      if (t < 1) raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={`greeting-wrap${fading ? " fading" : ""}`}>
      <div
        className="greeting-text"
        style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
      >
        Good Morning
      </div>
    </div>
  );
}

export default function DailyMoment({ onAdvance, isTransitioning }) {
  const [tapped, setTapped] = useState(false);
  const [promptHidden, setPromptHidden] = useState(false);
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  const handleTap = () => {
    if (!tapped) {
      setTapped(true);
      setPromptHidden(true);
      timerRef.current = setTimeout(() => onAdvance(), 5000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      onAdvance();
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="moment-screen" onClick={handleTap}>
      {!videoFailed ? (
        <video
          ref={videoRef}
          className={`moment-video${isTransitioning ? " blurring" : ""}`}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          src="/assets/test/morning-video.mp4"
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <div className={`moment-placeholder${isTransitioning ? " blurring" : ""}`} />
      )}

      <HandwrittenGreeting visible={tapped} fading={isTransitioning} />

      <div className={`moment-tap-prompt${promptHidden ? " hidden" : ""}`}>
        <div className="tap-circle" />
        <span className="tap-text">tap to begin</span>
      </div>
    </div>
  );
}
