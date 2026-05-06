import { useState, useRef, useCallback, useEffect } from "react";

const CARD = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.25)",
  boxShadow: "0 4px 16px rgba(0,20,60,0.1), 0 1px 3px rgba(8,20,50,0.04)",
};

const SOUNDS = [
  { id: "ocean",  label: "Ocean Waves", desc: "Rolling surf",       color: "#B8DDE8", file: "/sounds/ocean.mp3" },
  { id: "rain",   label: "Rain",        desc: "Gentle rainfall",    color: "#F0A8A0", file: "/sounds/rain.mp3" },
  { id: "birds",  label: "Birdsong",    desc: "Morning chorus",     color: "#C0C080", file: "/sounds/birds.mp3" },
  { id: "stream", label: "Stream",      desc: "Trickling creek",    color: "#C8B8D8", file: "/sounds/stream.mp3" },
  { id: "forest", label: "Forest",      desc: "Woodland ambience",  color: "#8CB898", file: "/sounds/forest.mp3" },
];

export default function Soundscapes() {
  const [activeId, setActiveId] = useState(null);
  const audioRef = useRef(null);
  const fadeRef = useRef(null);

  const stop = useCallback(() => {
    if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
    fadeRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setActiveId(null);
  }, []);

  const play = useCallback((id) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (fadeRef.current) cancelAnimationFrame(fadeRef.current);

    const sound = SOUNDS.find(s => s.id === id);
    if (!sound) return;

    const audio = new Audio(sound.file);
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;

    audio.play().then(() => {
      // Fade in
      const fadeIn = () => {
        if (audio.volume < 0.95) {
          audio.volume = Math.min(1, audio.volume + 0.05);
          fadeRef.current = requestAnimationFrame(fadeIn);
        } else {
          audio.volume = 1;
        }
      };
      fadeIn();
    }).catch(() => {});

    setActiveId(id);
  }, []);

  const handleTap = (id) => {
    if (activeId === id) {
      stop();
    } else {
      play(id);
    }
  };

  // Cleanup on unmount
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg, #C0C080, #B8DDE8)" }} />
        <div style={{ fontSize: 11, color: "rgba(12,26,53,0.5)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Soundscapes
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SOUNDS.map(s => {
          const isActive = activeId === s.id;
          return (
            <div
              key={s.id}
              onClick={() => handleTap(s.id)}
              className="tappable"
              style={{
                ...CARD,
                padding: 0,
                display: "flex",
                alignItems: "stretch",
                cursor: "pointer",
                transition: "all 0.3s ease",
                border: isActive ? `1.5px solid ${s.color}55` : CARD.border,
                boxShadow: isActive ? `0 4px 16px rgba(0,20,60,0.1), 0 0 0 1px ${s.color}30` : CARD.boxShadow,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* Colored left edge strip */}
              <div style={{
                width: 4, flexShrink: 0,
                background: isActive
                  ? `linear-gradient(180deg, ${s.color}, ${s.color}80)`
                  : `linear-gradient(180deg, ${s.color}35, ${s.color}15)`,
                transition: "all 0.3s ease",
              }} />

              {/* Content */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: isActive
                    ? `linear-gradient(135deg, ${s.color}35, ${s.color}15)`
                    : `linear-gradient(135deg, ${s.color}12, ${s.color}06)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.3s ease",
                  border: `1px solid ${isActive ? `${s.color}40` : `${s.color}15`}`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: isActive ? s.color : `${s.color}60`,
                    boxShadow: isActive ? `0 0 10px ${s.color}, 0 0 20px ${s.color}40` : "none",
                    animation: isActive ? "mindPulse 2s ease-in-out infinite" : "none",
                    transition: "all 0.3s ease",
                  }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0C1A35", fontFamily: "'Satoshi', sans-serif" }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: isActive ? s.color : "rgba(12,26,53,0.45)", fontWeight: isActive ? 500 : 400, transition: "all 0.3s ease" }}>{s.desc}</div>
                </div>
                {isActive && (
                  <div style={{
                    fontSize: 10, color: s.color, fontWeight: 600, letterSpacing: 0.5,
                    padding: "3px 8px", borderRadius: 6,
                    background: `${s.color}15`, border: `1px solid ${s.color}30`,
                  }}>Playing</div>
                )}
              </div>

              {/* Active glow wash */}
              {isActive && (
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: `linear-gradient(90deg, ${s.color}08, transparent 60%)`,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
