import { useState, useRef, useCallback, useEffect } from "react";
import Soundscapes from "./Soundscapes.jsx";
import WimHof from "./WimHof.jsx";

const PRESETS = [
  { label: "Focus",   beatHz: 12,  baseHz: 200, desc: "Alpha 12 Hz", color: "#B8DDE8", gradient: "linear-gradient(135deg, #B8DDE820, #B8DDE808)" },
  { label: "Calm",    beatHz: 10,  baseHz: 180, desc: "Alpha 10 Hz", color: "#C0C080", gradient: "linear-gradient(135deg, #C0C08020, #C0C08008)" },
  { label: "Meditate",beatHz: 6,   baseHz: 150, desc: "Theta 6 Hz",  color: "#C8B8D8", gradient: "linear-gradient(135deg, #C8B8D820, #C8B8D808)" },
  { label: "Deep",    beatHz: 3,   baseHz: 120, desc: "Delta 3 Hz",  color: "#D898AC", gradient: "linear-gradient(135deg, #D898AC20, #D898AC08)" },
];

const TIMERS = [null, 60, 180, 300, 600];
const TIMER_LABELS = ["Free", "1 min", "3 min", "5 min", "10 min"];

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
  const activeColor = activePreset !== null ? PRESETS[activePreset].color : "#B8DDE8";

  return (
    <div className="home-bg" style={{ paddingBottom: 40 }}>
      <div className="home-header spring-in spring-in-1 depth-top">
        <div>
          <div className="home-greeting">Mind</div>
          <div className="home-date">Focus, breathe, and listen</div>
        </div>
      </div>

      {/* ── BINAURAL BEATS ── */}
      <div className="section-pad spring-in spring-in-2">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg, #B8DDE8, #C8B8D8)" }} />
          <div style={{ fontSize: 11, color: "rgba(12,26,53,0.5)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Binaural Beats
          </div>
        </div>
        <div style={{
          ...CARD,
          padding: "24px 20px",
          display: "flex", flexDirection: "column", alignItems: "center",
          position: "relative", overflow: "hidden",
        }}>
          {/* Subtle colored gradient wash at top */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 80,
            background: playing
              ? `linear-gradient(180deg, ${activeColor}15, transparent)`
              : "linear-gradient(180deg, rgba(184,221,232,0.06), transparent)",
            transition: "background 0.8s ease",
            pointerEvents: "none",
          }} />

          <div style={{ fontSize: 11, color: "rgba(12,26,53,0.45)", letterSpacing: 0.3, marginBottom: 16, position: "relative" }}>
            Headphones recommended for binaural effect
          </div>

          <div style={{ position: "relative", width: 150, height: 150, marginBottom: 16 }}>
            {/* Soft glow behind ring when playing */}
            {playing && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                width: 100, height: 100, borderRadius: "50%",
                background: `radial-gradient(circle, ${activeColor}25, transparent 70%)`,
                transform: "translate(-50%, -50%)",
                animation: "mindPulse 3s ease-in-out infinite",
              }} />
            )}
            <svg width={150} height={150} style={{ position: "absolute", top: 0, left: 0 }}>
              <circle cx={75} cy={75} r={65} fill="none" stroke="rgba(12,26,53,0.06)" strokeWidth={3} />
              {/* Subtle colored background ring */}
              <circle cx={75} cy={75} r={65} fill="none" stroke={playing ? `${activeColor}20` : "rgba(184,221,232,0.08)"} strokeWidth={8} />
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
                    boxShadow: `0 0 16px ${activeColor}, 0 0 40px ${activeColor}40`,
                    animation: "mindPulse 2s ease-in-out infinite",
                  }} />
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: "#0C1A35", marginTop: 8, fontWeight: 600 }}>
                    {timerDuration ? fmtTime(timerDuration - elapsed) : fmtTime(elapsed)}
                  </div>
                  <div style={{ fontSize: 11, color: activeColor, marginTop: 2, fontWeight: 500 }}>
                    {activePreset !== null ? PRESETS[activePreset].desc : ""}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(12,26,53,0.3)" }}>
                  Select a mode
                </div>
              )}
            </div>
          </div>

          {/* Preset grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", position: "relative" }}>
            {PRESETS.map((p, i) => {
              const isActive = activePreset === i && playing;
              return (
                <div
                  key={p.label}
                  onClick={() => handlePresetTap(p, i)}
                  className="tappable"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    background: isActive ? p.color : `${p.color}40`,
                    border: isActive ? `1.5px solid ${p.color}` : `1.5px solid ${p.color}60`,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0C1A35", fontFamily: "'Satoshi', sans-serif" }}>{p.label}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(12,26,53,0.6)" }}>{p.desc}</div>
                </div>
              );
            })}
          </div>

          {/* Timer selector */}
          <div style={{ width: "100%", marginTop: 14, position: "relative" }}>
            <div style={{ fontSize: 10, color: "rgba(12,26,53,0.4)", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Timer</div>
            <div style={{ display: "flex", gap: 5 }}>
              {TIMERS.map((t, i) => (
                <div
                  key={i}
                  className="tappable"
                  onClick={() => setTimerIdx(i)}
                  style={{
                    flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8,
                    fontSize: 11, fontWeight: 500, cursor: "pointer",
                    background: timerIdx === i
                      ? (playing ? `${activeColor}18` : "rgba(12,26,53,0.08)")
                      : "rgba(8,16,32,0.02)",
                    color: timerIdx === i ? "#0C1A35" : "rgba(12,26,53,0.35)",
                    border: timerIdx === i
                      ? (playing ? `1.5px solid ${activeColor}40` : "1.5px solid rgba(12,26,53,0.15)")
                      : "1.5px solid transparent",
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

      {/* ── SOUNDSCAPES ── */}
      <div className="section-pad spring-in spring-in-3" style={{ paddingTop: 18 }}>
        <Soundscapes />
      </div>

      {/* ── BREATHWORK ── */}
      <div className="section-pad spring-in spring-in-4" style={{ paddingTop: 18 }}>
        <WimHof />
      </div>
    </div>
  );
}
