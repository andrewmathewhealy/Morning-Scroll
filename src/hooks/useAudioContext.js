// Shared AudioContext singleton — lazily created on first user gesture.
// All components that need Web Audio should use getSharedAudioContext()
// instead of creating their own.

let sharedCtx = null;

export function getSharedAudioContext() {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
}
