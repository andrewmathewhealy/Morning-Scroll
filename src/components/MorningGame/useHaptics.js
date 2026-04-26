import { useCallback } from "react";

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

export function useHaptics() {
  const tap = useCallback(() => {
    if (canVibrate) navigator.vibrate(10);
  }, []);

  const success = useCallback(() => {
    if (canVibrate) navigator.vibrate([10, 50, 10]);
  }, []);

  return { tap, success };
}
