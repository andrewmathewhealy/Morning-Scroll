import { useState } from "react";
import ErrorBoundary from "../ErrorBoundary.jsx";
import WordleGame from "../Wordle/WordleGame.jsx";
import BrickBreaker from "../MorningGame/BrickBreaker.jsx";

// The arcade games surfaced in the Morning Games hub. To add a game, drop one
// entry here — the grid and the open/back routing pick it up automatically.
const GAMES = [
  { id: "wordle", name: "Wordle",        blurb: "Guess the daily word",  accent: "#7A9E52", Component: WordleGame },
  { id: "brick",  name: "Brick Breaker", blurb: "Clear the morning wall", accent: "#F2B899", Component: BrickBreaker },
];

export default function GamesHub() {
  const [activeId, setActiveId] = useState(null);
  const active = GAMES.find(g => g.id === activeId);

  // A game is open — show it with a way back to the grid.
  if (active) {
    const Game = active.Component;
    return (
      <div className="games-play">
        <button className="games-back" onClick={() => setActiveId(null)}>← All games</button>
        <div className="games-play-body">
          <ErrorBoundary label={active.name}>
            <Game />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  // The grid of games.
  return (
    <div className="games-hub">
      <div className="games-hub-head">
        <div className="games-hub-title">Morning Games</div>
        <div className="games-hub-sub">A little play to wake the brain up</div>
      </div>
      <div className="games-grid">
        {GAMES.map(g => (
          <button
            key={g.id}
            className="game-tile tappable"
            style={{ "--game-accent": g.accent }}
            onClick={() => setActiveId(g.id)}
          >
            <span className="game-tile-icon">{g.name.charAt(0)}</span>
            <span className="game-tile-name">{g.name}</span>
            <span className="game-tile-blurb">{g.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
