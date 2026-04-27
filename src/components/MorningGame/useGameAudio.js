import { useRef, useCallback } from "react";

// C Major Pentatonic — 2 octaves, 12 notes
const MORNING_SCALE = [
  261.63, 293.66, 329.63, 392.00, 440.00, 523.25,
  587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66,
];

// 5 evenly-spaced notes for Stack (indices 0, 2, 5, 8, 10)
const STACK_NOTES = [261.63, 329.63, 523.25, 783.99, 1046.50];

export function useGameAudio() {
  const ctxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }, []);

  // Core FM synthesis pluck — minimal techno style
  const playTechnoPluck = useCallback((frequency, time = 0, opts = {}) => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime + time;
      const vol = opts.volume ?? 1;
      const subBoost = opts.subBoost ?? 1;

      // === CARRIER (the tone you hear) ===
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = frequency;

      // Slight detune for stereo width
      const carrierDetune = ctx.createOscillator();
      carrierDetune.type = "sine";
      carrierDetune.frequency.value = frequency;
      carrierDetune.detune.value = 3;

      // === MODULATOR (bright attack → warm settle) ===
      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.value = frequency * 2; // 2:1 ratio

      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(frequency * 1.5, now);
      modGain.gain.exponentialRampToValueAtTime(1, now + 0.08);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      modGain.connect(carrierDetune.frequency);

      // === SUB BASS (physical weight) ===
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = frequency / 2;

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.08 * subBoost * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      // === CARRIER ENVELOPE (snappy 0.4s) ===
      const carrierGain = ctx.createGain();
      carrierGain.gain.setValueAtTime(0.25 * vol, now);
      carrierGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      const carrierDetuneGain = ctx.createGain();
      carrierDetuneGain.gain.setValueAtTime(0.15 * vol, now);
      carrierDetuneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      // === CLICK TRANSIENT (percussive tap) ===
      const clickOsc = ctx.createOscillator();
      clickOsc.type = "square";
      clickOsc.frequency.value = frequency * 6;

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.04 * vol, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      // === CONNECT ===
      carrier.connect(carrierGain).connect(ctx.destination);
      carrierDetune.connect(carrierDetuneGain).connect(ctx.destination);
      sub.connect(subGain).connect(ctx.destination);
      clickOsc.connect(clickGain).connect(ctx.destination);

      // === START/STOP ===
      [carrier, carrierDetune, modulator, sub, clickOsc].forEach(osc => {
        osc.start(now);
        osc.stop(now + 0.6);
      });
    } catch {}
  }, [getCtx]);

  // Ascending note for Pop/Stars/Leaves/Ripples
  const playPop = useCallback((index) => {
    const note = MORNING_SCALE[Math.min(index, MORNING_SCALE.length - 1)];
    playTechnoPluck(note);
  }, [playTechnoPluck]);

  // Quieter note for rapid tracing (OneLine)
  const playTrace = useCallback((index) => {
    const note = MORNING_SCALE[Math.min(index, MORNING_SCALE.length - 1)];
    playTechnoPluck(note, 0, { volume: 0.7 });
  }, [playTechnoPluck]);

  // Stack/block drop — 5 evenly-spaced notes
  const playDrop = useCallback((index, perfect = false) => {
    const note = STACK_NOTES[Math.min(index, STACK_NOTES.length - 1)];
    playTechnoPluck(note, 0, {
      volume: perfect ? 1 : 0.6,
      subBoost: perfect ? 1.5 : 1,
    });
  }, [playTechnoPluck]);

  const playShimmer = useCallback(() => {
    playTechnoPluck(659.25, 0, { volume: 0.5 });
    playTechnoPluck(783.99, 0.03, { volume: 0.5 });
  }, [playTechnoPluck]);

  // Completion chord — confident, tight stagger (30ms)
  const playCompletion = useCallback(() => {
    playTechnoPluck(523.25, 0);          // C5
    playTechnoPluck(659.25, 0.03);       // E5
    playTechnoPluck(783.99, 0.06);       // G5
    playTechnoPluck(1046.50, 0.09);      // C6 sparkle
  }, [playTechnoPluck]);

  // Generic note/chord for backward compat
  const playNote = useCallback((freq) => {
    playTechnoPluck(freq);
  }, [playTechnoPluck]);

  const playChord = useCallback((freqs) => {
    freqs.forEach((f, i) => playTechnoPluck(f, i * 0.03));
  }, [playTechnoPluck]);

  return { playPop, playTrace, playDrop, playShimmer, playCompletion, playNote, playChord, playTechnoPluck };
}
