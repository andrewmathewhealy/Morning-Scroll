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
  { id: "ocean",  label: "Ocean Waves", desc: "Rolling surf",       color: "#8ECAE6" },
  { id: "rain",   label: "Rain",        desc: "Gentle rainfall",    color: "#A3B8D9" },
  { id: "birds",  label: "Birdsong",    desc: "Morning chorus",     color: "#A3D9A5" },
  { id: "wind",   label: "Wind",        desc: "Soft breeze",        color: "#C4A1FF" },
  { id: "fire",   label: "Fireplace",   desc: "Warm crackling",     color: "#FFB703" },
];

function createNoiseBuffer(ctx, duration = 4) {
  const sr = ctx.sampleRate;
  const len = sr * duration;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return buf;
}

function buildOcean(ctx, dest) {
  const buf = createNoiseBuffer(ctx, 6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 400;
  bp.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0.35;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.12;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.2;
  lfo.connect(lfoGain).connect(gain.gain);

  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;

  src.connect(bp).connect(gain).connect(dest);
  src2.connect(lp).connect(g2).connect(dest);

  src.start();
  src2.start();
  lfo.start();

  return [src, src2, lfo];
}

function buildRain(ctx, dest) {
  const buf = createNoiseBuffer(ctx, 4);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1000;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 8000;

  const gain = ctx.createGain();
  gain.gain.value = 0.25;

  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2500;
  bp.Q.value = 0.3;
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;

  src.connect(hp).connect(lp).connect(gain).connect(dest);
  src2.connect(bp).connect(g2).connect(dest);

  src.start();
  src2.start();

  return [src, src2];
}

function buildBirds(ctx, dest) {
  const oscs = [];
  const intervals = [];

  function chirp() {
    const now = ctx.currentTime;
    const baseFreq = 2000 + Math.random() * 2500;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (0.7 + Math.random() * 0.8), now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.1, now + 0.12);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.06, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;

    osc.connect(g).connect(pan).connect(dest);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  for (let i = 0; i < 3; i++) {
    const base = 400 + Math.random() * 1200;
    intervals.push(setInterval(() => {
      chirp();
      if (Math.random() > 0.5) setTimeout(chirp, 60 + Math.random() * 100);
      if (Math.random() > 0.7) setTimeout(chirp, 150 + Math.random() * 100);
    }, base));
  }

  const buf = createNoiseBuffer(ctx, 4);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 0.2;
  const g = ctx.createGain();
  g.gain.value = 0.04;
  src.connect(bp).connect(g).connect(dest);
  src.start();
  oscs.push(src);

  return { _intervals: intervals, _oscs: oscs };
}

function buildWind(ctx, dest) {
  const buf = createNoiseBuffer(ctx, 6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;

  const gain = ctx.createGain();
  gain.gain.value = 0.3;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.18;
  lfo.connect(lfoGain).connect(gain.gain);

  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1200;
  bp.Q.value = 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.06;

  const lfo2 = ctx.createOscillator();
  lfo2.type = "sine";
  lfo2.frequency.value = 0.15;
  const lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 0.04;
  lfo2.connect(lfo2Gain).connect(g2.gain);

  src.connect(lp).connect(gain).connect(dest);
  src2.connect(bp).connect(g2).connect(dest);

  src.start();
  src2.start();
  lfo.start();
  lfo2.start();

  return [src, src2, lfo, lfo2];
}

function buildFire(ctx, dest) {
  const buf = createNoiseBuffer(ctx, 4);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 800;
  bp.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.value = 0.22;

  src.connect(bp).connect(gain).connect(dest);
  src.start();

  const intervals = [];
  function pop() {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 100 + Math.random() * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03 + Math.random() * 0.04);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    osc.connect(g).connect(pan).connect(dest);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  intervals.push(setInterval(() => {
    pop();
    if (Math.random() > 0.5) setTimeout(pop, 30 + Math.random() * 80);
    if (Math.random() > 0.6) setTimeout(pop, 100 + Math.random() * 100);
  }, 150 + Math.random() * 200));

  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;
  src2.connect(lp).connect(g2).connect(dest);
  src2.start();

  return { _intervals: intervals, _oscs: [src, src2] };
}

const BUILDERS = { ocean: buildOcean, rain: buildRain, birds: buildBirds, wind: buildWind, fire: buildFire };

// Safely stop all nodes returned by a builder
function stopPlayer(player) {
  if (!player) return;
  // Array of oscillators/sources
  if (Array.isArray(player)) {
    player.forEach(n => { try { n.stop(); } catch {} });
    return;
  }
  // Object with _intervals and _oscs (birds, fire)
  if (player._intervals) player._intervals.forEach(clearInterval);
  if (player._oscs) player._oscs.forEach(n => { try { n.stop(); } catch {} });
}

export default function Soundscapes() {
  const [activeId, setActiveId] = useState(null);
  const ctxRef = useRef(null);
  const playerRef = useRef(null);
  const masterRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const stop = useCallback(() => {
    stopPlayer(playerRef.current);
    playerRef.current = null;
    if (masterRef.current) {
      try { masterRef.current.disconnect(); } catch {}
      masterRef.current = null;
    }
    setActiveId(null);
  }, []);

  const play = useCallback((id) => {
    // Stop anything currently playing first
    stopPlayer(playerRef.current);
    playerRef.current = null;
    if (masterRef.current) {
      try { masterRef.current.disconnect(); } catch {}
    }

    const ctx = getCtx();

    // Master gain for fade-in
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
    master.connect(ctx.destination);
    masterRef.current = master;

    playerRef.current = BUILDERS[id](ctx, master);
    setActiveId(id);
  }, [getCtx]);

  const handleTap = (id) => {
    if (activeId === id) {
      stop();
    } else {
      play(id);
    }
  };

  useEffect(() => () => {
    stopPlayer(playerRef.current);
    playerRef.current = null;
    if (ctxRef.current) { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
  }, []);

  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(2,48,71,0.5)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        Soundscapes
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
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                transition: "all 0.3s ease",
                border: isActive ? `1.5px solid ${s.color}` : CARD.border,
                boxShadow: isActive ? `0 4px 16px rgba(0,20,60,0.1), 0 0 0 1px ${s.color}44` : CARD.boxShadow,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: isActive ? `${s.color}30` : "rgba(12,26,53,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s ease",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: isActive ? s.color : "rgba(12,26,53,0.2)",
                  boxShadow: isActive ? `0 0 8px ${s.color}` : "none",
                  animation: isActive ? "mindPulse 2s ease-in-out infinite" : "none",
                  transition: "all 0.3s ease",
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0C1A35", fontFamily: "'Satoshi', sans-serif" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "rgba(2,48,71,0.5)" }}>{s.desc}</div>
              </div>
              {isActive && (
                <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>Playing</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
