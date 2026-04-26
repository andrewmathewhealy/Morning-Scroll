import { useState, useEffect } from "react";
import { db } from "../../firebase.js";
import { doc, getDoc } from "firebase/firestore";

// ── POLL DATA ─────────────────────────────────────────────
const DEFAULT_POLL_OPTIONS = [
  { label: "Calm & rested", votes: 1240 },
  { label: "Hopeful", votes: 980 },
  { label: "Ready to go", votes: 620 },
  { label: "Still waking up", votes: 870 },
  { label: "Grateful", votes: 730 },
];
const DEFAULT_POLL_QUESTION = "How are you waking up?";

function useTodaysPoll() {
  const [poll, setPoll] = useState({ loading: true, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `poll-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { setPoll({ loading: false, question: cached.question, options: cached.options }); return; }
    } catch {}

    (async () => {
      try {
        const snap = await getDoc(doc(db, "polls", today));
        if (snap.exists()) {
          const data = snap.data();
          const options = data.options.map((label, i) => ({
            label,
            votes: Math.floor(Math.random() * 800) + 200, // simulated votes for display
          }));
          localStorage.setItem(cacheKey, JSON.stringify({ question: data.question, options }));
          setPoll({ loading: false, question: data.question, options });
        } else {
          setPoll({ loading: false, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });
        }
      } catch {
        setPoll({ loading: false, question: DEFAULT_POLL_QUESTION, options: DEFAULT_POLL_OPTIONS });
      }
    })();
  }, []);

  return poll;
}

// ── POLL CARD (reusable) ──────────────────────────────────
function PollCard() {
  const [vote, setVote] = useState(null);
  const [animating, setAnimating] = useState(false);
  const { question: pollQuestion, options: POLL_OPTIONS } = useTodaysPoll();
  const TOTAL_VOTES = POLL_OPTIONS.reduce((s, o) => s + o.votes, 0);
  const winnerVotes = Math.max(...POLL_OPTIONS.map(o => o.votes));

  const handleVote = (label) => {
    setVote(label);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 50);
  };

  return (
    <div className="comm-card">
      <div className="comm-card-header">
        <div>
          <div className="comm-card-title">{pollQuestion}</div>
          <div className="comm-card-sub">{vote ? `${(TOTAL_VOTES + 1).toLocaleString()} responses · anonymous` : "Tap to share anonymously"}</div>
        </div>
        <div className="comm-card-tag">{vote ? "Results" : "Today"}</div>
      </div>
      {!vote ? (
        POLL_OPTIONS.map(opt => (
          <button key={opt.label} className="poll-option" onClick={() => handleVote(opt.label)}>{opt.label}</button>
        ))
      ) : (
        <>
          {POLL_OPTIONS.map(opt => {
            const total = TOTAL_VOTES + 1;
            const votes = opt.votes + (opt.label === vote ? 1 : 0);
            const pct = Math.round((votes / total) * 100);
            const isWinner = opt.votes === winnerVotes;
            const isChosen = opt.label === vote;
            return (
              <div className="poll-result" key={opt.label}>
                <div className="poll-result-top">
                  <div className="poll-result-label">
                    {isChosen && <CheckIcon />}
                    <span style={{ color: isChosen ? "#2E6FF2" : "#0C1A35", fontWeight: isChosen ? 600 : 500 }}>{opt.label}</span>
                  </div>
                  <div className="poll-result-pct" style={{ color: isWinner ? "#2E6FF2" : undefined }}>{pct}%</div>
                </div>
                <div className="poll-result-track">
                  <div className={`poll-result-fill ${isWinner ? "winner" : ""} ${isChosen && !isWinner ? "chosen" : ""}`}
                    style={{ width: animating ? "0%" : `${pct}%`, transition: animating ? "none" : "width 0.7s cubic-bezier(0.34,1.2,0.64,1)" }} />
                </div>
              </div>
            );
          })}
          <div className="poll-total">{(TOTAL_VOTES + 1).toLocaleString()} people have responded today</div>
        </>
      )}
    </div>
  );
}

// Inline check icon to avoid importing the full Icon module
function CheckIcon({ size = 13, color = "#2E6FF2" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export default PollCard;
