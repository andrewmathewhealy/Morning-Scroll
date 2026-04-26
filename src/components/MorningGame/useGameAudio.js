import { useRef, useCallback } from "react";

// Warm pentatonic — lower octave, more soothing
const PENTATONIC = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

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

  // Soft, warm tone — slow attack, long gentle decay
  const playNote = useCallback((freq, duration = 0.6) => {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Soft sine with gentle harmonics
      osc.type = "sine";
      osc.frequency.value = freq;
      // Slow attack (50ms), gentle peak, long fade
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [getCtx]);

  const playChord = useCallback((freqs, duration = 0.8) => {
    try {
      const ctx = getCtx();
      freqs.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      });
    } catch {}
  }, [getCtx]);

  // Gentle chime for tracing progress — quiet, warm
  const playPop = useCallback((index) => {
    const note = PENTATONIC[Math.min(index, PENTATONIC.length - 1)];
    playNote(note, 0.5);
  }, [playNote]);

  // Soft wooden tap for stack drops
  const playDrop = useCallback((index) => {
    try {
      const ctx = getCtx();
      const freq = 250 + index * 50;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, [getCtx]);

  const playShimmer = useCallback(() => {
    playNote(659, 0.6);  // E5
    playNote(784, 0.5);  // G5
  }, [playNote]);

  // Warm resolved chord — like a deep breath
  const playCompletion = useCallback(() => {
    playChord([262, 330, 392, 523], 1.0); // C major with octave
  }, [playChord]);

  return { playNote, playChord, playPop, playDrop, playShimmer, playCompletion };
}
