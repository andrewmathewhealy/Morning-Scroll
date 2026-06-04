// Central haptics. Routes through the Capacitor Haptics plugin — the real
// Taptic Engine on native iOS, navigator.vibrate on Android/web, and a silent
// no-op where unsupported (desktop, iOS Safari). Gated by a persisted toggle so
// the user can switch it off. Fire-and-forget: a haptic must never throw into
// the UI.
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

let enabled = localStorage.getItem("ms-haptics") !== "off"; // default on

export function setHapticsEnabled(on) {
  enabled = !!on;
  localStorage.setItem("ms-haptics", on ? "on" : "off");
}
export function hapticsEnabled() {
  return enabled;
}

function impact(style) {
  if (!enabled) return;
  Haptics.impact({ style }).catch(() => {});
}
function notify(type) {
  if (!enabled) return;
  Haptics.notification({ type }).catch(() => {});
}

// Named intents so callers express *what happened*, not a raw intensity.
export const haptic = {
  light:   () => impact(ImpactStyle.Light),   // a tap, a selection
  medium:  () => impact(ImpactStyle.Medium),  // a toggle, opening a sheet
  heavy:   () => impact(ImpactStyle.Heavy),   // a deliberate, weighty action
  select:  () => { if (enabled) Haptics.selectionChanged().catch(() => {}); }, // moving across options/tabs
  success: () => notify(NotificationType.Success), // saved, won, completed
  warning: () => notify(NotificationType.Warning),
  error:   () => notify(NotificationType.Error),
};
