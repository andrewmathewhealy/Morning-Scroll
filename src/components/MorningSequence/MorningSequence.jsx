import { useState, useCallback } from "react";
import DailyMoment from "./DailyMoment.jsx";
import PhotoReel from "./PhotoReel.jsx";
import "./morningSequence.css";

export default function MorningSequence({ onComplete }) {
  const [screen, setScreen] = useState("moment");
  const [sequenceDone, setSequenceDone] = useState(false);

  const advanceToPhotos = useCallback(() => {
    setScreen("photos");
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
      {screen === "moment" && <DailyMoment onAdvance={advanceToPhotos} />}
      {screen === "photos" && <PhotoReel onComplete={handleSequenceComplete} />}
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
