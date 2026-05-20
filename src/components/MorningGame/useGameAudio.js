import { useCallback } from "react";
import { getSharedAudioContext } from "../../hooks/useAudioContext.js";

// C Major Pentatonic — 2 octaves, 12 notes
const MORNING_SCALE = [
  261.63, 293.66, 329.63, 392.00, 440.00, 523.25,
  587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66,
];

// 5 evenly-spaced notes for Stack (indices 0, 2, 5, 8, 10)
const STACK_NOTES = [261.63, 329.63, 523.25, 783.99, 1046.50];

// Binaural beat offsets (Hz difference between ears)
// Alpha range (8-13 Hz) — relaxed morning alertness
const BEAT_HZ = 10;          // 10 Hz alpha wave
const COMPLETION_BEAT_HZ = 7; // 7 Hz theta — dreamy reward feeling

export function useGameAudio() {
  const getCtx = useCallback(() => getSharedAudioContext(), []);

  // Core binaural beat tone — plays slightly different freq in each ear
  const playBinaural = useCallback((frequency, time = 0, opts = {}) => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime + time;
      const vol = opts.volume ?? 1;
      const beatHz = opts.beatHz ?? BEAT_HZ;
      const duration = opts.duration ?? 0.6;
      const attack = opts.attack ?? 0.02;

      // Left ear — base frequency
      const oscL = ctx.createOscillator();
      oscL.type = "sine";
      oscL.frequency.value = frequency;

      const gainL = ctx.createGain();
      gainL.gain.setValueAtTime(0.001, now);
      gainL.gain.exponentialRampToValueAtTime(0.2 * vol, now + attack);
      gainL.gain.exponentialRampToValueAtTime(0.001, now + duration);

      const panL = ctx.createStereoPanner();
      panL.pan.value = -1; // full left

      oscL.connect(gainL).connect(panL).connect(ctx.destination);

      // Right ear — base frequency + beat offset
      const oscR = ctx.createOscillator();
      oscR.type = "sine";
      oscR.frequency.value = frequency + beatHz;

      const gainR = ctx.createGain();
      gainR.gain.setValueAtTime(0.001, now);
      gainR.gain.exponentialRampToValueAtTime(0.2 * vol, now + attack);
      gainR.gain.exponentialRampToValueAtTime(0.001, now + duration);

      const panR = ctx.createStereoPanner();
      panR.pan.value = 1; // full right

      oscR.connect(gainR).connect(panR).connect(ctx.destination);

      // Soft harmonic layer (one octave up, quieter) — adds warmth
      const oscHarmL = ctx.createOscillator();
      oscHarmL.type = "sine";
      oscHarmL.frequency.value = frequency * 2;

      const harmGainL = ctx.createGain();
      harmGainL.gain.setValueAtTime(0.001, now);
      harmGainL.gain.exponentialRampToValueAtTime(0.05 * vol, now + attack);
      harmGainL.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

      const harmPanL = ctx.createStereoPanner();
      harmPanL.pan.value = -1;

      oscHarmL.connect(harmGainL).connect(harmPanL).connect(ctx.destination);

      const oscHarmR = ctx.createOscillator();
      oscHarmR.type = "sine";
      oscHarmR.frequency.value = frequency * 2 + beatHz;

      const harmGainR = ctx.createGain();
      harmGainR.gain.setValueAtTime(0.001, now);
      harmGainR.gain.exponentialRampToValueAtTime(0.05 * vol, now + attack);
      harmGainR.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

      const harmPanR = ctx.createStereoPanner();
      harmPanR.pan.value = 1;

      oscHarmR.connect(harmGainR).connect(harmPanR).connect(ctx.destination);

      // Start/stop all
      [oscL, oscR, oscHarmL, oscHarmR].forEach(osc => {
        osc.start(now);
        osc.stop(now + duration + 0.05);
      });
    } catch {}
  }, [getCtx]);

  // Ascending note for Pop/Stars/Leaves/Ripples
  const playPop = useCallback((index) => {
    const note = MORNING_SCALE[Math.min(index, MORNING_SCALE.length - 1)];
    playBinaural(note, 0, { duration: 0.5 });
  }, [playBinaural]);

  // Quieter note for rapid tracing (OneLine)
  const playTrace = useCallback((index) => {
    const note = MORNING_SCALE[Math.min(index, MORNING_SCALE.length - 1)];
    playBinaural(note, 0, { volume: 0.6, duration: 0.35 });
  }, [playBinaural]);

  // Stack/block drop — 5 evenly-spaced notes
  const playDrop = useCallback((index, perfect = false) => {
    const note = STACK_NOTES[Math.min(index, STACK_NOTES.length - 1)];
    playBinaural(note, 0, {
      volume: perfect ? 1 : 0.6,
      duration: perfect ? 0.8 : 0.5,
      beatHz: perfect ? 7 : BEAT_HZ, // theta on perfect for extra reward
    });
  }, [playBinaural]);

  const playShimmer = useCallback(() => {
    playBinaural(659.25, 0, { volume: 0.5, duration: 0.7 });
    playBinaural(783.99, 0.05, { volume: 0.5, duration: 0.7 });
  }, [playBinaural]);

  // Completion chord — layered binaural tones with theta beat
  const playCompletion = useCallback(() => {
    playBinaural(523.25, 0, { beatHz: COMPLETION_BEAT_HZ, duration: 1.2 });
    playBinaural(659.25, 0.05, { beatHz: COMPLETION_BEAT_HZ, duration: 1.1 });
    playBinaural(783.99, 0.10, { beatHz: COMPLETION_BEAT_HZ, duration: 1.0 });
    playBinaural(1046.50, 0.15, { beatHz: COMPLETION_BEAT_HZ, duration: 0.9 });
  }, [playBinaural]);

  // Generic note/chord for backward compat
  const playNote = useCallback((freq) => {
    playBinaural(freq);
  }, [playBinaural]);

  const playChord = useCallback((freqs) => {
    freqs.forEach((f, i) => playBinaural(f, i * 0.05));
  }, [playBinaural]);

  return { playPop, playTrace, playDrop, playShimmer, playCompletion, playNote, playChord, playBinaural };
}
