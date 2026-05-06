import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { auth, db } from "../../firebase.js";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit as fbLimit } from "firebase/firestore";
import { useAuth } from "../../hooks/useAuth.js";
import { Icon } from "../../icons/Icon.jsx";
import { WORKER_URL } from "../../config.js";

// ── JOURNAL / GRATITUDE PROMPT ────────────────────────────
function useJournalPrompt() {
  const [state, setState] = useState({ loading: true, prompt: null });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `journal-prompt-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.prompt) { setState({ loading: false, prompt: cached.prompt }); return; }
    } catch {}

    const timeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

    (async () => {
      try {
        // Check Firestore for a manually-set prompt first (with timeout)
        try {
          const manualSnap = await timeout(getDoc(doc(db, "journalPrompts", today)), 3000);
          const manualData = manualSnap.data();
          if (manualData?.manual && manualData?.prompt) {
            const data = { date: today, prompt: manualData.prompt };
            localStorage.setItem(cacheKey, JSON.stringify(data));
            setState({ loading: false, prompt: manualData.prompt });
            return;
          }
        } catch {}

        // Fetch recent prompts from Firestore to avoid repetition (with timeout)
        let recentParam = "";
        try {
          const q = query(collection(db, "journalPrompts"), orderBy("date", "desc"), fbLimit(10));
          const snap = await timeout(getDocs(q), 3000);
          const recent = snap.docs.map(d => d.data().prompt).filter(Boolean);
          if (recent.length) recentParam = `?recent=${encodeURIComponent(recent.join("|||"))}`;
        } catch {}

        const res = await fetch(`${WORKER_URL}/journal-prompt${recentParam}`);
        const data = await res.json();
        if (!data.prompt) throw new Error("No prompt");

        // Store prompt in Firestore for future dedup (fire and forget)
        try { setDoc(doc(db, "journalPrompts", today), { date: today, prompt: data.prompt }); } catch {}

        localStorage.setItem(cacheKey, JSON.stringify(data));
        setState({ loading: false, prompt: data.prompt });
      } catch {
        setState({ loading: false, prompt: "What's one small thing you're looking forward to today?" });
      }
    })();
  }, []);

  return state;
}

function JournalWidget() {
  const user = useAuth();
  const { loading: promptLoading, prompt } = useJournalPrompt();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryClosing, setDiaryClosing] = useState(false);
  const [loginMode, setLoginMode] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [authErr, setAuthErr] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedClosing, setExpandedClosing] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);

  const dismissExpanded = useCallback(() => {
    setExpandedClosing(true);
    setTimeout(() => { setExpanded(false); setExpandedClosing(false); }, 500);
  }, []);

  const dismissDiary = useCallback(() => {
    setDiaryClosing(true);
    setTimeout(() => { setDiaryOpen(false); setDiaryClosing(false); }, 500);
  }, []);

  // Lock body scroll when expanded or diary open
  useEffect(() => {
    if (expanded || diaryOpen) {
      document.body.classList.add("journal-open");
    } else {
      document.body.classList.remove("journal-open");
    }
    return () => document.body.classList.remove("journal-open");
  }, [expanded, diaryOpen]);

  // Load today's entry if user is logged in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/journalEntries`, today));
        if (snap.exists()) {
          setText(snap.data().text || "");
          setSaved(true);
        }
      } catch {}
    })();
  }, [user, today]);

  const handleSave = async () => {
    if (!user || !text.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${user.uid}/journalEntries`, today), {
        date: today,
        prompt: prompt || "",
        text: text.trim(),
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthErr(null);
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setLoginMode(false);
    } catch (ex) {
      setAuthErr(ex.message.replace("Firebase: ", ""));
    }
    setAuthLoading(false);
  };

  const handleTouchStart = (e) => {
    dragRef.current = { startY: e.touches[0].clientY, dragging: true };
  };
  const handleTouchMove = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const handleTouchEnd = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    dragRef.current.dragging = false;
    sheetRef.current.style.transform = "";
    if (dy > 80) dismissExpanded();
  };

  if (promptLoading) return (
    <div className="journal-card journal-shimmer widget-shimmer">
      <Icon.Feather size={24} color="rgba(212,148,10,0.35)" />
      <div className="journal-label">Journal</div>
    </div>
  );

  return (
    <>
      {/* Inline card — collapsed view */}
      <div className="journal-card" onClick={() => { if (user) setExpanded(true); }}>
        <div className="journal-header">
          <Icon.Feather size={14} color="#D898AC" />
          <div className="journal-label">Morning Journal</div>
        </div>
        <div className="journal-prompt">{prompt}</div>
        {user === undefined ? null : user ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'rgba(8,16,32,0.3)', fontStyle: 'italic', fontSize: 12 }}>Tap to write...</div>
            <button className="journal-history-btn" onClick={(e) => { e.stopPropagation(); setDiaryOpen(true); }}>
              <Icon.BookOpen size={13} color="#D898AC" /> Past entries
            </button>
          </div>
        ) : loginMode ? (
          <form onSubmit={handleLogin}>
            <input className="journal-auth-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="journal-auth-input" type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button className="journal-auth-btn" type="submit" disabled={authLoading}>{authLoading ? "Signing in..." : "Sign In"}</button>
            {authErr && <div className="journal-auth-err">{authErr}</div>}
          </form>
        ) : (
          <div className="journal-login-prompt">
            <button className="journal-login-btn" onClick={() => setLoginMode(true)}>Sign in</button> to save your journal entries
          </div>
        )}
      </div>

      {/* Expanded fullscreen sheet — portaled to .phone so it covers nav */}
      {expanded && document.getElementById("phone-shell") && createPortal(
        <>
          <div className={`journal-expanded-overlay ${expandedClosing ? "closing" : ""}`} onClick={dismissExpanded} />
          <div className={`journal-expanded ${expandedClosing ? "closing" : ""}`} ref={sheetRef}>
            <div className="journal-drag-handle"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            <div className="journal-header">
              <Icon.Feather size={14} color="#D898AC" />
              <div className="journal-label">Morning Journal</div>
            </div>
            <div className="journal-prompt">{prompt}</div>
            <textarea
              className="journal-textarea"
              placeholder="Write your thoughts..."
              value={text}
              onChange={(e) => { setText(e.target.value); setSaved(false); }}
              autoFocus
            />
            <div className="journal-actions">
              <button className="journal-history-btn" onClick={() => setDiaryOpen(true)}>
                <Icon.BookOpen size={13} color="#D898AC" /> Past entries
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {saved && <span className="journal-saved">Saved</span>}
                <button className="journal-save" onClick={handleSave} disabled={saving || !text.trim()}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.getElementById("phone-shell")
      )}

      {diaryOpen && <DiarySheet user={user} onClose={dismissDiary} closing={diaryClosing} />}
    </>
  );
}

function DiarySheet({ user, onClose, closing = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const scrubRef = useRef({ startY: 0, startIdx: 0, active: false, lastTs: 0 });
  const closeRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);
  const swipeRef = useRef({ startX: 0, startY: 0, swiping: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    document.body.classList.add("journal-open");
    return () => document.body.classList.remove("journal-open");
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const q = query(
          collection(db, `users/${user.uid}/journalEntries`),
          orderBy("date", "desc"),
          fbLimit(50)
        );
        const snap = await getDocs(q);
        let results = snap.docs.map(d => d.data());

        if (results.length === 0) {
          const seeds = [
            { date: "2026-03-20", prompt: "What made you smile before 9am today?", text: "My dog stretched out in a sunbeam on the kitchen floor and sighed so contentedly. I stood there with my coffee just watching her for a minute. Sometimes the smallest moments are the most grounding." },
            { date: "2026-03-18", prompt: "Describe a sound you heard this morning that you usually ignore.", text: "Birds outside my window — I think they're house finches. I never really stopped to listen before, but this morning the house was quiet and their song filled the whole room. It felt like a little gift." },
            { date: "2026-03-15", prompt: "What's one thing you're learning about yourself lately?", text: "I'm learning that I don't need to have everything figured out to feel okay. There's a kind of peace in just showing up each day and doing my best. Progress doesn't always look dramatic." },
            { date: "2026-03-12", prompt: "If today were a color, what would it be and why?", text: "A soft golden yellow — like late afternoon light. I woke up feeling warm and unhurried. No rush, no anxiety. Just a gentle kind of optimism that I want to hold onto." },
            { date: "2026-03-09", prompt: "Write about someone who made your week better, even in a small way.", text: "The barista at my usual coffee shop remembered my name and my order. She said 'the usual?' with this big smile. It's such a tiny thing but it made me feel seen. Connection doesn't have to be deep to be meaningful." },
          ];
          for (const seed of seeds) {
            await setDoc(doc(db, `users/${user.uid}/journalEntries`, seed.date), { ...seed, updatedAt: new Date().toISOString() });
          }
          results = seeds;
        }

        setEntries(results);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  // Close handle drag
  const handleCloseTouchStart = (e) => { closeRef.current = { startY: e.touches[0].clientY, dragging: true }; };
  const handleCloseTouchMove = (e) => {
    if (!closeRef.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - closeRef.current.startY;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const handleCloseTouchEnd = (e) => {
    if (!closeRef.current.dragging || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - closeRef.current.startY;
    closeRef.current.dragging = false;
    sheetRef.current.style.transform = "";
    if (dy > 80) onClose();
  };

  // Page area: horizontal swipe = prev/next, vertical swipe = scrub
  const handlePageTouchStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY, swiping: true, direction: null };
    scrubRef.current = { startY: t.clientY, startIdx: idx, active: false, lastTs: Date.now() };
  };

  const handlePageTouchMove = (e) => {
    if (!swipeRef.current.swiping) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeRef.current.startX;
    const dy = t.clientY - swipeRef.current.startY;

    // Determine direction on first significant move
    if (!swipeRef.current.direction) {
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        swipeRef.current.direction = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (swipeRef.current.direction === "v") {
          scrubRef.current.active = true;
          setScrubbing(true);
        }
      } else return;
    }

    if (swipeRef.current.direction === "v" && scrubRef.current.active && entries.length > 1) {
      // Vertical scrub: each 30px of movement = 1 entry, accelerates with speed
      const rawDy = t.clientY - scrubRef.current.startY;
      const now = Date.now();
      const velocity = Math.abs(rawDy) / Math.max(now - scrubRef.current.lastTs, 16);
      const accel = Math.max(1, Math.floor(velocity * 3));
      const steps = Math.round(rawDy / 30) * accel;
      const newIdx = Math.max(0, Math.min(entries.length - 1, scrubRef.current.startIdx - steps));
      if (newIdx !== idx) {
        setIdx(newIdx);
        setShowToast(true);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setShowToast(false), 800);
      }
    }
  };

  const handlePageTouchEnd = (e) => {
    if (!swipeRef.current.swiping) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY;

    if (swipeRef.current.direction === "h") {
      // Horizontal swipe: left = next, right = prev
      if (dx < -40 && idx < entries.length - 1) setIdx(i => i + 1);
      else if (dx > 40 && idx > 0) setIdx(i => i - 1);
    }

    swipeRef.current.swiping = false;
    swipeRef.current.direction = null;
    scrubRef.current.active = false;
    setScrubbing(false);
  };

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  const entry = entries[idx];

  return createPortal(
    <>
      <div className={`diary-overlay ${closing ? "closing" : ""}`} onClick={onClose} />
      <div className={`diary-sheet ${closing ? "closing" : ""}`} ref={sheetRef}>
        <div className="diary-drag-handle"
          onTouchStart={handleCloseTouchStart}
          onTouchMove={handleCloseTouchMove}
          onTouchEnd={handleCloseTouchEnd}
        />
        <div className="diary-header">
          <div className="diary-title">My Journal</div>
          <button className="diary-close" onClick={onClose}>Done</button>
        </div>
        {entries.length > 0 && (
          <div className="diary-counter">{idx + 1} of {entries.length}</div>
        )}
        <div className="diary-page-area"
          onTouchStart={handlePageTouchStart}
          onTouchMove={handlePageTouchMove}
          onTouchEnd={handlePageTouchEnd}
        >
          {loading ? (
            <div className="diary-empty">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="diary-empty">No entries yet. Start writing today!</div>
          ) : entry ? (
            <div className="diary-page" key={entry.date}>
              <div className="diary-page-date">
                {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
              <div className="diary-page-weekday">
                {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}
              </div>
              {entry.prompt && <div className="diary-page-prompt">"{entry.prompt}"</div>}
              <div className="diary-page-text">{entry.text}</div>
            </div>
          ) : null}
          {showToast && entry && (
            <div className="diary-date-toast">
              {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
          {!scrubbing && entries.length > 1 && (
            <div className="diary-scrub-hint">swipe left/right or drag up to scrub</div>
          )}
        </div>
      </div>
    </>,
    phoneEl
  );
}

export default JournalWidget;
