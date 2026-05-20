import { useState, useCallback } from "react";
import DailyMoment from "./DailyMoment.jsx";
import GlobeVoyage from "./GlobeVoyage.jsx";
import "./morningSequence.css";

export default function MorningSequence({ onComplete }) {
  const [screen, setScreen] = useState("moment");
  const [transitioning, setTransitioning] = useState(false);
  const [sequenceDone, setSequenceDone] = useState(false);

  // Pre-mount globe hidden during Screen 1 for WebGL warmup
  const [globePreMounted] = useState(true);

  const advanceToGlobe = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setScreen("globe");
      setTransitioning(false);
    }, 1000);
  }, []);

  const handleSequenceComplete = useCallback(() => {
    setSequenceDone(true);
    setTimeout(() => {
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem("morning_sequence_date", today);
      onComplete();
    }, 800);
  }, [onComplete]);

  return (
    <div className={`morning-sequence${sequenceDone ? " fade-out" : ""}`}>
      {screen === "moment" && (
        <DailyMoment
          onAdvance={advanceToGlobe}
          isTransitioning={transitioning}
        />
      )}

      {(screen === "globe" || globePreMounted) && (
        <div style={{
          position: "absolute", inset: 0,
          visibility: screen === "globe" ? "visible" : "hidden",
          pointerEvents: screen === "globe" ? "auto" : "none",
        }}>
          <GlobeVoyage
            active={screen === "globe"}
            onAdvance={handleSequenceComplete}
          />
        </div>
      )}
    </div>
  );
}

// Session gate: check if the sequence should show today
// TODO: remove override before shipping
const ALWAYS_SHOW = true;
export function shouldShowMorningSequence() {
  if (ALWAYS_SHOW) return true;
  const today = new Date().toISOString().split("T")[0];
  const lastShown = localStorage.getItem("morning_sequence_date");
  return lastShown !== today;
}
