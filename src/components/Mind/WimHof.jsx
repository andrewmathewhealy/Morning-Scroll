import { useState, useRef, useCallback, useEffect } from "react";

const CARD = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.25)",
  boxShadow: "0 4px 16px rgba(0,20,60,0.1), 0 1px 3px rgba(8,20,50,0.04)",
};

const TOTAL_BREATHS = 30;
const TOTAL_ROUNDS = 3;
const RECOVERY_HOLD = 15;
const INHALE_MS = 1800;
const EXHALE_MS = 1600;

// ── Audio cue helpers ──
function getAudioCtx(ref) {
  if (!ref.current) {
    ref.current = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ref.current.state === "suspended") ref.current.resume();
  return ref.current;
}

// Soft rising tone for inhale
function playInhaleTone(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.3);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

// Soft falling tone for exhale
function playExhaleTone(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(0.08, now + 0.06);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

// Bell-like chime for phase transitions
function playBell(ctx, freq = 523.25) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  osc.connect(g).connect(ctx.destination);
  osc2.connect(g2).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.3);
  osc2.start(now);
  osc2.stop(now + 0.9);
}

// Completion chord
function playComplete(ctx) {
  playBell(ctx, 523.25);
  setTimeout(() => playBell(ctx, 659.25), 150);
  setTimeout(() => playBell(ctx, 783.99), 300);
}

export default function WimHof() {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [breathCount, setBreathCount] = useState(0);
  const [inhaling, setInhaling] = useState(true);
  const [round, setRound] = useState(1);
  const [retentionTime, setRetentionTime] = useState(0);
  const [recoveryTime, setRecoveryTime] = useState(RECOVERY_HOLD);
  const [recoveryInhaled, setRecoveryInhaled] = useState(false);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setActive(false);
    setPhase("idle");
    setBreathCount(0);
    setInhaling(true);
    setRound(1);
    setRetentionTime(0);
    setRecoveryTime(RECOVERY_HOLD);
    setRecoveryInhaled(false);
  }, [clearTimer]);

  // ── Breathing phase: cycle inhale/exhale 30 times ──
  const startBreathing = useCallback(() => {
    setPhase("breathing");
    setBreathCount(0);
    setInhaling(true);
    let count = 0;
    let isInhale = true;

    const cycle = () => {
      if (isInhale) {
        count++;
        setBreathCount(count);
        setInhaling(true);
        try { playInhaleTone(getAudioCtx(audioRef)); } catch {}
        timerRef.current = setTimeout(() => {
          setInhaling(false);
          isInhale = false;
          try { playExhaleTone(getAudioCtx(audioRef)); } catch {}
          timerRef.current = setTimeout(() => {
            if (count >= TOTAL_BREATHS) {
              setPhase("retention");
              setRetentionTime(0);
              try { playBell(getAudioCtx(audioRef), 392); } catch {}
              timerRef.current = setInterval(() => {
                setRetentionTime(t => t + 1);
              }, 1000);
              return;
            }
            isInhale = true;
            cycle();
          }, EXHALE_MS);
        }, INHALE_MS);
      }
    };

    cycle();
  }, []);

  // ── Recovery phase ──
  const startRecovery = useCallback(() => {
    clearTimer();
    setPhase("recovery");
    setRecoveryInhaled(false);
    setRecoveryTime(RECOVERY_HOLD);
    try { playBell(getAudioCtx(audioRef), 523.25); } catch {}

    setTimeout(() => {
      setRecoveryInhaled(true);
      try { playInhaleTone(getAudioCtx(audioRef)); } catch {}
      let t = RECOVERY_HOLD;
      timerRef.current = setInterval(() => {
        t--;
        setRecoveryTime(t);
        if (t <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          try { playBell(getAudioCtx(audioRef), 659.25); } catch {}
          setRound(r => {
            const next = r + 1;
            if (next > TOTAL_ROUNDS) {
              setPhase("done");
              try { playComplete(getAudioCtx(audioRef)); } catch {}
            } else {
              setPhase("roundDone");
            }
            return r;
          });
        }
      }, 1000);
    }, 500);
  }, [clearTimer]);

  const handleStart = () => {
    setActive(true);
    setRound(1);
    // Create audio context on user gesture
    getAudioCtx(audioRef);
    try { playBell(getAudioCtx(audioRef)); } catch {}
    startBreathing();
  };

  const handleRetentionTap = () => {
    if (phase === "retention") {
      startRecovery();
    }
  };

  const handleNextRound = () => {
    setRound(r => r + 1);
    try { playBell(getAudioCtx(audioRef)); } catch {}
    startBreathing();
  };

  useEffect(() => () => {
    clearTimer();
    if (audioRef.current) { try { audioRef.current.close(); } catch {} audioRef.current = null; }
  }, [clearTimer]);

  let circleScale = 0.6;
  let circleColor = "rgba(12,26,53,0.08)";
  let instruction = "";
  let subtext = "";

  if (phase === "breathing") {
    circleScale = inhaling ? 1 : 0.55;
    circleColor = inhaling ? "#8ECAE6" : "#A3B8D9";
    instruction = inhaling ? "Breathe in" : "Let go";
    subtext = `${breathCount} / ${TOTAL_BREATHS}`;
  } else if (phase === "retention") {
    circleScale = 0.45;
    circleColor = "#C4A1FF";
    instruction = "Hold";
    subtext = `${retentionTime}s — tap when you need to breathe`;
  } else if (phase === "recovery") {
    circleScale = recoveryInhaled ? 1 : 0.5;
    circleColor = "#A3D9A5";
    instruction = recoveryInhaled ? `Hold — ${recoveryTime}s` : "Big breath in";
    subtext = "Recovery breath";
  } else if (phase === "roundDone") {
    circleScale = 0.7;
    circleColor = "#FFB703";
    instruction = `Round ${round} complete`;
    subtext = "Tap to start next round";
  } else if (phase === "done") {
    circleScale = 0.8;
    circleColor = "#A3D9A5";
    instruction = "Complete";
    subtext = `${TOTAL_ROUNDS} rounds finished`;
  }

  // Colors for round dots
  const ROUND_COLORS = ["#8ECAE6", "#C4A1FF", "#FFB703"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg, #FFB703, #C4A1FF)" }} />
        <div style={{ fontSize: 11, color: "rgba(2,48,71,0.5)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Breathwork
        </div>
      </div>

      <div style={{ ...CARD, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden" }}>
        {/* Background gradient wash that shifts with phase */}
        {active && (
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse at 50% 40%, ${circleColor}12, transparent 70%)`,
            transition: "background 0.8s ease",
          }} />
        )}

        {!active ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#0C1A35", fontFamily: "'Satoshi', sans-serif", marginBottom: 6, position: "relative" }}>
              Wim Hof Method
            </div>
            <div style={{ fontSize: 12, color: "rgba(2,48,71,0.55)", textAlign: "center", lineHeight: 1.6, maxWidth: 260, marginBottom: 4, position: "relative" }}>
              {TOTAL_BREATHS} deep breaths, breath retention, recovery hold. {TOTAL_ROUNDS} rounds.
            </div>
            <div style={{ fontSize: 11, color: "rgba(2,48,71,0.4)", textAlign: "center", lineHeight: 1.5, maxWidth: 260, marginBottom: 18, position: "relative" }}>
              Lie down or sit comfortably. Breathe in through nose or mouth, pushing your belly outward.
            </div>
            <div
              className="tappable"
              onClick={handleStart}
              style={{
                padding: "10px 32px", borderRadius: 14, cursor: "pointer",
                background: "linear-gradient(135deg, #8ECAE618, #C4A1FF12)",
                border: "1.5px solid rgba(142,202,230,0.3)",
                fontSize: 14, fontWeight: 600, color: "#0C1A35",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              Begin
            </div>
          </>
        ) : (
          <>
            {/* Round indicator — colored dots */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, position: "relative" }}>
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
                const done = i < round;
                const current = i === round - 1;
                const dotColor = ROUND_COLORS[i];
                return (
                  <div key={i} style={{
                    width: done ? 10 : 8, height: done ? 10 : 8, borderRadius: "50%",
                    background: done ? dotColor : "rgba(12,26,53,0.1)",
                    boxShadow: current ? `0 0 8px ${dotColor}, 0 0 16px ${dotColor}30` : "none",
                    border: done ? `1px solid ${dotColor}60` : "1px solid transparent",
                    transition: "all 0.4s ease",
                  }} />
                );
              })}
            </div>

            {/* Breathing circle */}
            <div style={{ position: "relative" }}>
              {/* Outer glow ring */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                width: 170, height: 170, borderRadius: "50%",
                border: `1px solid ${circleColor}20`,
                transform: `translate(-50%, -50%) scale(${circleScale})`,
                transition: phase === "breathing"
                  ? `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out, border-color 0.5s ease`
                  : "all 0.5s ease",
                pointerEvents: "none",
              }} />

              <div
                onClick={phase === "retention" ? handleRetentionTap : phase === "roundDone" ? handleNextRound : undefined}
                style={{
                  width: 150, height: 150, borderRadius: "50%",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  background: `radial-gradient(circle, ${circleColor}25, ${circleColor}10)`,
                  border: `2px solid ${circleColor}`,
                  boxShadow: `0 0 30px ${circleColor}20, inset 0 0 20px ${circleColor}10`,
                  transform: `scale(${circleScale})`,
                  transition: phase === "breathing"
                    ? `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out, background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease`
                    : "all 0.5s ease",
                  cursor: (phase === "retention" || phase === "roundDone") ? "pointer" : "default",
                }}
              >
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600,
                  color: "#0C1A35", textAlign: "center", padding: "0 10px",
                }}>
                  {instruction}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: circleColor, marginTop: 16, textAlign: "center", fontWeight: 500, position: "relative", transition: "color 0.5s ease" }}>
              {subtext}
            </div>

            {/* Stop/reset button */}
            <div style={{ display: "flex", gap: 10, marginTop: 16, position: "relative" }}>
              {phase === "done" ? (
                <div
                  className="tappable"
                  onClick={reset}
                  style={{
                    padding: "8px 24px", borderRadius: 12, cursor: "pointer",
                    background: "linear-gradient(135deg, #A3D9A518, #A3D9A508)",
                    border: "1.5px solid #A3D9A540",
                    fontSize: 13, fontWeight: 500, color: "#0C1A35",
                  }}
                >
                  Done
                </div>
              ) : (
                <div
                  className="tappable"
                  onClick={reset}
                  style={{
                    padding: "8px 20px", borderRadius: 12, cursor: "pointer",
                    background: "rgba(12,26,53,0.04)", border: "1px solid rgba(12,26,53,0.1)",
                    fontSize: 12, fontWeight: 500, color: "rgba(2,48,71,0.4)",
                  }}
                >
                  Stop
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
