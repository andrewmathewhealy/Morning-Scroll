// Thin shim kept for the games' existing { tap, success } API. Real haptics now
// live in the central module (Capacitor Taptic Engine), which actually fires on
// native iOS — the old navigator.vibrate here never did.
import { haptic } from "../../hooks/haptics.js";

export function useHaptics() {
  return { tap: haptic.light, success: haptic.success };
}
