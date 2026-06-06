import { useState, useRef, useEffect } from "react";

export default function DailyMoment({ onAdvance, videoSrc }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  // iOS only autoplays inline video that is *muted as a DOM property* — React's
  // `muted` JSX attribute is applied unreliably, which is why autoplay worked
  // only sometimes. Set it imperatively and (re)try play() as the data loads.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    const tryPlay = () => { const p = v.play(); if (p) p.catch(() => {}); };
    tryPlay();
    v.addEventListener("loadeddata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    // Fallback for Low Power Mode (where iOS blocks autoplay entirely): kick it
    // off on the very first touch/tap anywhere.
    const onFirstInteract = () => tryPlay();
    document.addEventListener("touchstart", onFirstInteract, { once: true, passive: true });
    document.addEventListener("pointerdown", onFirstInteract, { once: true });
    return () => {
      v.removeEventListener("loadeddata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
      document.removeEventListener("touchstart", onFirstInteract);
      document.removeEventListener("pointerdown", onFirstInteract);
    };
  }, [videoSrc]);

  return (
    <div className="moment-screen" data-haptic="light" onClick={onAdvance}>
      {!videoFailed ? (
        <video
          ref={videoRef}
          className="moment-video"
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          src={videoSrc}
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <div className="moment-placeholder" />
      )}

      <div className="moment-tap-prompt">
        <div className="tap-circle" />
        <span className="tap-text">tap to enter</span>
      </div>
    </div>
  );
}
