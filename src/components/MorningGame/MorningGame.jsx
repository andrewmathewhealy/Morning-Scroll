import { useState, useMemo } from "react";
import PopTheMorning from "./PopTheMorning.jsx";
import OneLine from "./OneLine.jsx";
import Stack from "./Stack.jsx";
import Ripples from "./Ripples.jsx";
import Leaves from "./Leaves.jsx";
import Stars from "./Stars.jsx";
import CompletionOverlay from "./CompletionOverlay.jsx";
import "./morningGame.css";

const GAMES = ["pop", "oneline", "stack", "ripples", "leaves", "stars"];

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTodaysGame() {
  const lastGame = localStorage.getItem("mg-last-game");
  let idx = getDayOfYear() % GAMES.length;
  if (GAMES[idx] === lastGame) {
    idx = (idx + 1) % GAMES.length;
  }
  return GAMES[idx];
}

function isCompletedToday() {
  return localStorage.getItem("mg-completed") === getToday();
}

export { default as OneLine } from "./OneLine.jsx";
export { default as Stack } from "./Stack.jsx";
export { default as Ripples } from "./Ripples.jsx";
export { default as Leaves } from "./Leaves.jsx";
export { default as Stars } from "./Stars.jsx";

// Overlay games — full-screen, no widget card, shown on app open
// Use these separately from MorningGame (which is for card-based games)
const OVERLAY_GAMES = { pop: PopTheMorning, ripples: Ripples, leaves: Leaves, stars: Stars };

export function GameOverlay() {
  const game = useMemo(getTodaysGame, []);
  const [done, setDone] = useState(false); // skip completion check for testing

  const GameComponent = OVERLAY_GAMES[game];
  if (!GameComponent || done) return null;

  const handleComplete = () => {
    localStorage.setItem("mg-completed", getToday());
    localStorage.setItem("mg-last-game", game);
    setDone(true);
  };

  return <GameComponent onComplete={handleComplete} />;
}

// MorningGame — card widget for OneLine and Stack
export default function MorningGame({ forceGame }) {
  const game = forceGame || useMemo(getTodaysGame, []);
  const [state, setState] = useState("idle");

  // Pop is handled by PopOverlay, not this card
  if (game === "pop" && !forceGame) return null;

  const handleGameComplete = () => {
    setState("finishing");
  };

  const handleFinished = () => {
    localStorage.setItem("mg-completed", getToday());
    localStorage.setItem("mg-last-game", game);
    setState("completed");
  };

  if (state === "completed") {
    return (
      <div className="mg-card mg-completed">
        <div className="mg-completed-content">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(228,189,88,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span className="mg-completed-text">good morning</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mg-card">
      {state === "finishing" ? (
        <CompletionOverlay onComplete={handleFinished} />
      ) : (
        <>
          {game === "pop" && <PopTheMorning onComplete={handleGameComplete} />}
          {game === "oneline" && <OneLine onComplete={handleGameComplete} />}
          {game === "stack" && <Stack onComplete={handleGameComplete} />}
        </>
      )}
    </div>
  );
}
