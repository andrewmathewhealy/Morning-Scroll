import { useState, useEffect, useRef, useCallback } from "react";

// ── WORDLE LOGIC ──────────────────────────────────────────
// Word lists are fetched from a free public CDN at runtime.
// This keeps the file size tiny. The lists are cached in memory
// after first load so there's no delay on subsequent opens.

const KEYBOARD_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];

const getLetterStates = (guess, answer) => {
  const result = Array(5).fill("absent");
  const answerArr = answer.split("");
  const guessArr = guess.split("");
  const used = Array(5).fill(false);
  guessArr.forEach((l, i) => { if (l === answerArr[i]) { result[i] = "correct"; used[i] = true; } });
  guessArr.forEach((l, i) => {
    if (result[i] === "correct") return;
    const j = answerArr.findIndex((a, idx) => a === l && !used[idx]);
    if (j !== -1) { result[i] = "present"; used[j] = true; }
  });
  return result;
};

// Cached word data (persists across Wordle opens within session)
let cachedAnswers = null;
let cachedValid = null;

async function loadWordLists() {
  if (cachedAnswers && cachedValid) return { answers: cachedAnswers, valid: cachedValid };
  try {
    // Using the official Wordle answer list from a public GitHub repo
    const answersRes = await fetch("https://raw.githubusercontent.com/tabatkins/wordle-list/main/words");
    const answersText = await answersRes.text();
    const words = answersText.trim().split("\n").map(w => w.trim().toUpperCase()).filter(w => w.length === 5);
    cachedAnswers = words;
    cachedValid = new Set(words);
    return { answers: words, valid: cachedValid };
  } catch {
    // Fallback: a small built-in list so the game always works
    const fallback = ["CRANE","SLATE","AUDIO","TRAIN","CLOUD","SHARP","BLAZE","CRIMP","FLOCK","GROAN","PLUMB","SWIRL","TROUT","VIVID","WRATH","YACHT","ZESTY","ABODE","BRISK","CHUNK"];
    cachedAnswers = fallback;
    cachedValid = new Set(fallback);
    return { answers: fallback, valid: cachedValid };
  }
}

function getTodaysWord(answers) {
  const start = new Date("2025-01-01");
  const today = new Date();
  const day = Math.floor((today - start) / 86400000);
  return answers[day % answers.length];
}

// ── WORDLE TILE ────────────────────────────────────────────
function WordleTile({ letter, state, animDelay = 0, winBounce = false, isNew = false }) {
  const [revealed, setRevealed] = useState(false);
  const [displayState, setDisplayState] = useState(null);

  useEffect(() => {
    if (state && state !== "tbd") {
      const t = setTimeout(() => { setRevealed(true); setDisplayState(state); }, animDelay);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
      setDisplayState(null);
    }
  }, [state, animDelay]);

  let cls = "w-tile ";
  if (!letter) cls += "w-tile-empty";
  else if (!revealed) cls += "w-tile-active" + (isNew ? " w-tile-pop" : "");
  else cls += `w-tile-revealed w-tile-${displayState}`;
  if (winBounce && revealed) cls += " w-tile-win";

  return (
    <div className={cls} style={winBounce && revealed ? { animationDelay: `${animDelay}ms` } : {}}>
      {letter}
    </div>
  );
}

// ── WORDLE GAME ───────────────────────────────────────────
const WORDLE_STORAGE_KEY = "morning-scroll:wordle";
const todayKey = () => new Date().toISOString().slice(0, 10);

function loadWordleProgress() {
  try {
    const raw = localStorage.getItem(WORDLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.date !== todayKey()) return null;
    return parsed;
  } catch { return null; }
}

function saveWordleProgress(data) {
  try {
    localStorage.setItem(WORDLE_STORAGE_KEY, JSON.stringify({ date: todayKey(), ...data }));
  } catch {}
}

function WordleGame() {
  const [wordData, setWordData] = useState(null); // { answer, valid }
  const [loading, setLoading] = useState(true);
  const saved = useRef(loadWordleProgress());
  const [guesses, setGuesses] = useState(() => saved.current?.guesses || []);
  const [current, setCurrent] = useState("");
  const [gameState, setGameState] = useState(() => saved.current?.gameState || "playing");
  const [toast, setToast] = useState("");
  const [shakeRow, setShakeRow] = useState(null);
  const [newLetterIdx, setNewLetterIdx] = useState(null);

  useEffect(() => {
    loadWordLists().then(({ answers, valid }) => {
      setWordData({ answer: getTodaysWord(answers), valid });
      setLoading(false);
    });
  }, []);

  // Persist progress whenever guesses or game state changes
  useEffect(() => {
    if (loading) return;
    saveWordleProgress({ guesses, gameState });
  }, [guesses, gameState, loading]);

  const letterStates = {};
  guesses.forEach(({ word, states }) => {
    word.split("").forEach((l, i) => {
      const existing = letterStates[l];
      const s = states[i];
      if (!existing || s === "correct" || (s === "present" && existing === "absent")) letterStates[l] = s;
    });
  });

  const showToast = (msg, duration = 1800) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  };

  const submitGuess = useCallback(() => {
    if (!wordData) return;
    if (current.length !== 5) { showToast("Not enough letters"); setShakeRow(guesses.length); setTimeout(() => setShakeRow(null), 500); return; }
    if (!wordData.valid.has(current)) { showToast("Not a valid word"); setShakeRow(guesses.length); setTimeout(() => setShakeRow(null), 500); return; }
    const states = getLetterStates(current, wordData.answer);
    const newGuesses = [...guesses, { word: current, states }];
    setGuesses(newGuesses);
    setCurrent("");
    setNewLetterIdx(null);
    if (current === wordData.answer) {
      const msgs = ["Brilliant!","Magnificent!","Splendid!","Great!","Phew!","Lucky!"];
      setTimeout(() => { showToast(msgs[Math.min(guesses.length, 5)], 2500); setGameState("won"); }, 300);
    } else if (newGuesses.length === 6) {
      setTimeout(() => { showToast(wordData.answer, 3000); setGameState("lost"); }, 300);
    }
  }, [current, guesses, wordData]);

  const handleKey = useCallback((key) => {
    if (gameState !== "playing" || !wordData) return;
    if (key === "ENTER") { submitGuess(); return; }
    if (key === "⌫" || key === "BACKSPACE") { setCurrent(c => c.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && current.length < 5) {
      setNewLetterIdx(current.length);
      setCurrent(c => c + key);
    }
  }, [gameState, current, submitGuess, wordData]);

  useEffect(() => {
    const handler = (e) => handleKey(e.key.toUpperCase());
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  if (loading) return <div className="wordle-loading">Loading today's word…</div>;

  const grid = [];
  for (let r = 0; r < 6; r++) {
    const isSubmitted = r < guesses.length;
    const isCurrent = r === guesses.length;
    const row = [];
    for (let c = 0; c < 5; c++) {
      let letter = "", state = null, isNew = false;
      if (isSubmitted) { letter = guesses[r].word[c]; state = guesses[r].states[c]; }
      else if (isCurrent) { letter = current[c] || ""; state = letter ? "tbd" : null; isNew = c === newLetterIdx && letter !== ""; }
      row.push(<WordleTile key={c} letter={letter} state={state} animDelay={isSubmitted ? c * 220 : 0} winBounce={gameState === "won" && isSubmitted && r === guesses.length - 1} isNew={isNew} />);
    }
    grid.push(<div key={r} className={`w-grid-row${shakeRow === r ? " w-row-shake" : ""}`}>{row}</div>);
  }

  return (
    <div className="wordle-game">
      <div className="wg-header">
        <div className="wg-ornament">· Morning Scroll ·</div>
        <div className="wg-title">Wordle</div>
        <div className="wg-sub">Daily word · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
        <div className="wg-divider"><div className="wg-dline"/><div className="wg-ddot"/><div className="wg-dline"/></div>
      </div>
      <div className="wg-area">
        <div className={`w-toast${!toast ? " w-toast-hidden" : ""}`}>{toast || " "}</div>
        <div className="w-grid">{grid}</div>
        <div className="w-legend">
          <div className="w-legend-item"><div className="w-swatch w-swatch-correct"/><span>Correct</span></div>
          <div className="w-legend-item"><div className="w-swatch w-swatch-present"/><span>Wrong spot</span></div>
          <div className="w-legend-item"><div className="w-swatch w-swatch-absent"/><span>Not in word</span></div>
        </div>
        {gameState !== "playing" && (
          <div className="w-result">
            <div className="w-result-title">{gameState === "won" ? "Well Played" : "Better Luck"}</div>
            {gameState === "lost" && <div className="w-result-word">The word was <span>{wordData.answer}</span></div>}
            <div className="w-result-next">A new word arrives tomorrow at midnight</div>
            <button className="w-play-again" onClick={() => { setGuesses([]); setCurrent(""); setGameState("playing"); setToast(""); }}>Play Again</button>
          </div>
        )}
      </div>
      <div className="w-keyboard">
        <div className="w-kb-action">
          <button className="w-key-enter" onClick={() => handleKey("ENTER")}>↵ Enter</button>
          <button className="w-key-delete" onClick={() => handleKey("⌫")}>⌫ Delete</button>
        </div>
        {KEYBOARD_ROWS.map((row, ri) => (
          <div className="w-kb-row" key={ri}>
            {row.map(key => {
              const st = letterStates[key];
              return <button key={key} className={`w-key w-key-${st || "default"}`} onClick={() => handleKey(key)}>{key}</button>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default WordleGame;
