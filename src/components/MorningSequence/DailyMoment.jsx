import { useState, useRef } from "react";

export default function DailyMoment({ onAdvance, videoSrc }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="moment-screen" onClick={onAdvance}>
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
