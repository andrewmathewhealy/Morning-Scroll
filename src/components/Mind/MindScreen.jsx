import { useState, useRef, useCallback, useEffect } from "react";

const PRESETS = [
  { label: "Focus",   beatHz: 12,  baseHz: 200, desc: "Alpha 12 Hz", color: "#8ECAE6" },
  { label: "Calm",    beatHz: 10,  baseHz: 180, desc: "Alpha 10 Hz", color: "#A3D9A5" },
  { label: "Meditate",beatHz: 6,   baseHz: 150, desc: "Theta 6 Hz",  color: "#C4A1FF" },
  { label: "Deep",    beatHz: 3,   baseHz: 120, desc: "Delta 3 Hz",  color: "#FFB703" },
];

const TIMERS = [null, 60, 180, 300, 600];
const TIMER_LABELS = ["Free", "1 min", "3 min", "5 min", "10 min"];

// Frosted white card style matching the rest of the app
const CARD = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.25)",
  boxShadow: "0 4px 16px rgba(0,20,60,0.1), 0 1px 3px rgba(8,20,50,0.04)",
};

export default function MindScreen() {
  const [activePreset, setActivePreset] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerIdx, setTimerIdx] = useState(0);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const intervalRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }, []);

  const stopAudio = useCallback(() => {
    if (nodesRef.current) {
      const { oscL, oscR, gainL, gainR } = nodesRef.current;
      const ctx = ctxRef.current;
      const now = ctx?.currentTime ?? 0;
      try {
        gainL.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        gainR.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        setTimeout(() => {
          try { oscL.stop(); oscR.stop(); } catch {}
        }, 600);
      } catch {}
      nodesRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startAudio = useCallback((preset) => {
    stopAudio();
    const ctx = getCtx();
    const now = ctx.currentTime;

    const oscL = ctx.createOscillator();
    oscL.type = "sine";
    oscL.frequency.value = preset.baseHz;

    const gainL = ctx.createGain();
    gainL.gain.setValueAtTime(0.001, now);
    gainL.gain.exponentialRampToValueAtTime(0.18, now + 1.5);

    const panL = ctx.createStereoPanner();
    panL.pan.value = -1;
    oscL.connect(gainL).connect(panL).connect(ctx.destination);

    const oscR = ctx.createOscillator();
    oscR.type = "sine";
    oscR.frequency.value = preset.baseHz + preset.beatHz;

    const gainR = ctx.createGain();
    gainR.gain.setValueAtTime(0.001, now);
    gainR.gain.exponentialRampToValueAtTime(0.18, now + 1.5);

    const panR = ctx.createStereoPanner();
    panR.pan.value = 1;
    oscR.connect(gainR).connect(panR).connect(ctx.destination);

    oscL.start(now);
    oscR.start(now);

    nodesRef.current = { oscL, oscR, gainL, gainR };
    setPlaying(true);
    setElapsed(0);

    intervalRef.current = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
  }, [getCtx, stopAudio]);

  const timerDuration = TIMERS[timerIdx];
  useEffect(() => {
    if (playing && timerDuration && elapsed >= timerDuration) {
      stopAudio();
    }
  }, [playing, timerDuration, elapsed, stopAudio]);

  useEffect(() => () => {
    stopAudio();
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
  }, [stopAudio]);

  const handlePresetTap = (preset, idx) => {
    if (activePreset === idx && playing) {
      stopAudio();
      return;
    }
    setActivePreset(idx);
    startAudio(preset);
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = timerDuration ? Math.min(elapsed / timerDuration, 1) : 0;
  const activeColor = activePreset !== null ? PRESETS[activePreset].color : "#8ECAE6";

  return (
    <div className="home-bg" style={{ paddingBottom: 40 }}>
      <div className="home-header spring-in spring-in-1 depth-top">
        <div>
          <div className="home-greeting">Mind</div>
          <div className="home-date">Binaural beats for focus & calm</div>
        </div>
      </div>

      {/* Visualizer card */}
      <div className="section-pad spring-in spring-in-2">
        <div style={{ ...CARD, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "rgba(2,48,71,0.45)", letterSpacing: 0.3, marginBottom: 16 }}>
            Headphones recommended for binaural effect
          </div>

          <div style={{ position: "relative", width: 150, height: 150, marginBottom: 16 }}>
            <svg width={150} height={150} style={{ position: "absolute", top: 0, left: 0 }}>
              <circle cx={75} cy={75} r={65} fill="none" stroke="rgba(12,26,53,0.08)" strokeWidth={4} />
              {playing && timerDuration && (
                <circle
                  cx={75} cy={75} r={65}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 65}
                  strokeDashoffset={2 * Math.PI * 65 * (1 - progress)}
                  transform="rotate(-90 75 75)"
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              )}
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              {playing ? (
                <>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: activeColor,
                    boxShadow: `0 0 16px ${activeColor}`,
                    animation: "mindPulse 2s ease-in-out infinite",
                  }} />
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: "#0C1A35", marginTop: 8, fontWeight: 600 }}>
                    {timerDuration ? fmtTime(timerDuration - elapsed) : fmtTime(elapsed)}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(2,48,71,0.5)", marginTop: 2 }}>
                    {activePreset !== null ? PRESETS[activePreset].desc : ""}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(2,48,71,0.35)" }}>
                  Select a mode
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preset cards */}
      <div className="section-pad spring-in spring-in-3" style={{ paddingTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {PRESETS.map((p, i) => {
            const isActive = activePreset === i && playing;
            return (
              <div
                key={p.label}
                onClick={() => handlePresetTap(p, i)}
                className="tappable"
                style={{
                  ...CARD,
                  padding: "14px 14px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  border: isActive ? `1.5px solid ${p.color}` : CARD.border,
                  boxShadow: isActive
                    ? `0 4px 16px rgba(0,20,60,0.1), 0 0 0 1px ${p.color}44`
                    : CARD.boxShadow,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: isActive ? p.color : "rgba(12,26,53,0.2)",
                    boxShadow: isActive ? `0 0 8px ${p.color}` : "none",
                    transition: "all 0.3s ease",
                  }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0C1A35", fontFamily: "'Satoshi', sans-serif" }}>{p.label}</div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(2,48,71,0.55)" }}>{p.desc}</div>
                <div style={{ fontSize: 10, color: "rgba(2,48,71,0.35)", marginTop: 3 }}>
                  {p.baseHz} Hz base
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timer selector */}
      <div className="section-pad spring-in spring-in-4" style={{ paddingTop: 10 }}>
        <div style={{ ...CARD, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "rgba(2,48,71,0.5)", marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Timer</div>
          <div style={{ display: "flex", gap: 6 }}>
            {TIMERS.map((t, i) => (
              <div
                key={i}
                className="tappable"
                onClick={() => setTimerIdx(i)}
                style={{
                  flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10,
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: timerIdx === i ? "rgba(12,26,53,0.1)" : "rgba(8,16,32,0.03)",
                  color: timerIdx === i ? "#0C1A35" : "rgba(2,48,71,0.4)",
                  border: timerIdx === i ? "1.5px solid rgba(12,26,53,0.18)" : "1.5px solid transparent",
                  transition: "all 0.2s ease",
                }}
              >
                {TIMER_LABELS[i]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
