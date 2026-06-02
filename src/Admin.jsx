import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "./compressImage.js";

// ── STYLES ──────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Satoshi:wght@400;500;600;700&family=Space+Mono&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Satoshi', sans-serif; background: #0C1A35; color: #FDF2E8; min-height: 100vh; }

  .admin-shell { max-width: 900px; margin: 0 auto; padding: 32px 20px 80px; }
  .admin-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  .admin-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; }
  .admin-logout { font-size: 12px; color: rgba(253,242,232,0.5); background: rgba(253,242,232,0.08); border: 1px solid rgba(253,242,232,0.15); border-radius: 8px; padding: 6px 14px; cursor: pointer; }
  .admin-logout:hover { background: rgba(253,242,232,0.15); }

  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-card { background: rgba(253,242,232,0.06); border: 1.5px solid rgba(253,242,232,0.15); border-radius: 24px; padding: 40px 32px; width: 360px; }
  .login-title { font-family: 'Fraunces', serif; font-size: 24px; text-align: center; margin-bottom: 24px; }
  .login-input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1.5px solid rgba(253,242,232,0.2); background: rgba(253,242,232,0.06); color: #FDF2E8; font-size: 14px; font-family: 'Satoshi', sans-serif; outline: none; margin-bottom: 12px; }
  .login-input:focus { border-color: rgba(253,242,232,0.5); }
  .login-input::placeholder { color: rgba(253,242,232,0.3); }
  .login-btn { width: 100%; padding: 12px; border-radius: 12px; border: none; background: #F2B899; color: #0C1A35; font-size: 14px; font-weight: 600; font-family: 'Satoshi', sans-serif; cursor: pointer; }
  .login-btn:hover { background: #D9A088; }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .login-err { font-size: 12px; color: #D898AC; text-align: center; margin-top: 10px; }

  .form-section { background: rgba(253,242,232,0.06); border: 1.5px solid rgba(253,242,232,0.15); border-radius: 24px; padding: 24px; margin-bottom: 24px; }
  .form-section-title { font-size: 12px; color: rgba(253,242,232,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .form-row > * { flex: 1; }
  .form-label { font-size: 11px; color: rgba(253,242,232,0.5); font-weight: 500; margin-bottom: 4px; display: block; }
  .form-input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1.5px solid rgba(253,242,232,0.15); background: rgba(253,242,232,0.04); color: #FDF2E8; font-size: 13px; font-family: 'Satoshi', sans-serif; outline: none; }
  .form-input:focus { border-color: rgba(253,242,232,0.4); }
  .form-input::placeholder { color: rgba(253,242,232,0.25); }
  .form-textarea { resize: vertical; min-height: 70px; }

  .dropzone {
    border: 2px dashed rgba(253,242,232,0.2); border-radius: 16px; padding: 32px; text-align: center;
    cursor: pointer; transition: all 0.2s; margin-bottom: 12px; position: relative;
  }
  .dropzone:hover, .dropzone.drag-over { border-color: #F2B899; background: rgba(242,184,153,0.05); }
  .dropzone-text { font-size: 13px; color: rgba(253,242,232,0.4); }
  .dropzone-hint { font-size: 11px; color: rgba(253,242,232,0.25); margin-top: 4px; }
  .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .dropzone-preview { width: 100%; max-height: 300px; object-fit: contain; border-radius: 12px; }

  .save-btn { padding: 12px 32px; border-radius: 12px; border: none; background: #F2B899; color: #0C1A35; font-size: 14px; font-weight: 600; font-family: 'Satoshi', sans-serif; cursor: pointer; }
  .save-btn:hover { background: #D9A088; }
  .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .save-status { font-size: 12px; color: rgba(253,242,232,0.5); margin-left: 12px; }
  .save-row { display: flex; align-items: center; margin-top: 16px; }

  .queue-section { margin-top: 32px; }
  .queue-title { font-size: 12px; color: rgba(253,242,232,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
  .queue-empty { font-size: 13px; color: rgba(253,242,232,0.3); text-align: center; padding: 24px; }
  .queue-item { display: flex; align-items: center; gap: 14px; padding: 12px; background: rgba(253,242,232,0.04); border-radius: 14px; margin-bottom: 8px; border: 1px solid rgba(253,242,232,0.08); }
  .queue-thumb { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; background: #0C1A35; flex-shrink: 0; }
  .queue-info { flex: 1; min-width: 0; }
  .queue-date { font-size: 11px; color: #F2B899; font-weight: 600; font-family: 'Space Mono', monospace; }
  .queue-art-title { font-size: 14px; color: #FDF2E8; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .queue-art-meta { font-size: 11px; color: rgba(253,242,232,0.4); }
  .queue-today { border-color: #F2B899; background: rgba(242,184,153,0.06); }
  .queue-delete { font-size: 11px; color: #D898AC; background: rgba(216,152,172,0.1); border: 1px solid rgba(216,152,172,0.2); border-radius: 8px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; }
  .queue-delete:hover { background: rgba(216,152,172,0.2); }

  .admin-tabs { display: flex; gap: 4px; margin-bottom: 28px; background: rgba(253,242,232,0.06); border-radius: 14px; padding: 4px; }
  .admin-tab { flex: 1; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; font-family: 'Satoshi', sans-serif; color: rgba(253,242,232,0.4); background: none; border: none; cursor: pointer; text-align: center; transition: all 0.2s; }
  .admin-tab.active { background: rgba(253,242,232,0.12); color: #FDF2E8; }
  .admin-tab:hover:not(.active) { color: rgba(253,242,232,0.6); }

  .poll-option-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .poll-option-row .form-input { flex: 1; }
  .poll-remove-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(216,152,172,0.2); background: rgba(216,152,172,0.1); color: #D898AC; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .poll-remove-btn:hover { background: rgba(216,152,172,0.2); }
  .poll-add-btn { padding: 8px 16px; border-radius: 10px; border: 1.5px dashed rgba(253,242,232,0.2); background: none; color: rgba(253,242,232,0.4); font-size: 12px; font-weight: 500; font-family: 'Satoshi', sans-serif; cursor: pointer; width: 100%; margin-top: 4px; }
  .poll-add-btn:hover { border-color: rgba(253,242,232,0.4); color: rgba(253,242,232,0.6); }
  .poll-preview-card { background: rgba(253,242,232,0.55); border-radius: 24px; padding: 20px; border: 1.5px solid #FDF2E8; }
  .poll-preview-title { font-family: 'Satoshi', sans-serif; font-size: 17px; color: #0C1A35; margin-bottom: 4px; }
  .poll-preview-sub { font-size: 11px; color: rgba(8,16,32,0.45); margin-bottom: 14px; }
  .poll-preview-option { padding: 11px 16px; border-radius: 14px; font-size: 13px; font-weight: 500; background: rgba(8,16,32,0.04); border: 1.5px solid rgba(8,16,32,0.15); color: #0C1A35; margin-bottom: 8px; }
  .poll-preview-option:last-child { margin-bottom: 0; }

  .journal-char-count { font-size: 11px; color: rgba(253,242,232,0.3); text-align: right; margin-top: 4px; }
  .journal-preview-card { background: rgba(253,242,232,0.55); border-radius: 24px; padding: 20px; border: 1.5px solid #FDF2E8; }
  .journal-preview-prompt { font-family: 'Fraunces', serif; font-size: 17px; color: #0C1A35; line-height: 1.5; }
  .journal-badge { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; margin-left: 8px; }
  .journal-badge.manual { background: rgba(242,184,153,0.2); color: #F2B899; }
  .journal-badge.auto { background: rgba(253,242,232,0.1); color: rgba(253,242,232,0.35); }

  .preview-section { margin-top: 24px; }
  .preview-label { font-size: 12px; color: rgba(253,242,232,0.5); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
  .preview-frame { background: linear-gradient(175deg, #081020, #162D52, #80A8B5, #FFF4E0); border-radius: 24px; padding: 20px; max-width: 390px; margin: 0 auto; }

  /* App card preview — matches real app styles */
  .art-card { border-radius: 24px; overflow: hidden; border: 1.5px solid #FDF2E8; }
  .art-image { min-height: 160px; max-height: 360px; background: #FDF2E8; display: flex; align-items: center; justify-content: center; position: relative; }
  .art-image img { width: 100%; height: 100%; object-fit: contain; }
  .art-info { background: #FDF2E8; padding: 28px 20px 18px; }
  .art-title { font-family: 'Satoshi', sans-serif; font-size: 16px; color: #0C1A35; }
  .art-meta { font-size: 11px; color: rgba(8,16,32,0.5); margin-top: 3px; }
  .art-desc { font-size: 12px; color: rgba(8,16,32,0.45); margin-top: 6px; line-height: 1.5; }
`;

// ── LOGIN SCREEN ────────────────────────────────────────
function LoginScreen({ onAuth }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (ex) {
      setErr(ex.message.replace("Firebase: ", ""));
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-title">Morning Scroll Admin</div>
        <input className="login-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="login-input" type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button className="login-btn" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
        {err && <div className="login-err">{err}</div>}
      </form>
    </div>
  );
}

// ── ADMIN DASHBOARD ─────────────────────────────────────
// ── POLL EDITOR ─────────────────────────────────────────
function PollEditor({ initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState("single"); // "single" | "bulk"

  // Single mode state
  const [date, setDate] = useState(initialDate || today);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Bulk mode state
  const [bulkText, setBulkText] = useState("");
  const [bulkStart, setBulkStart] = useState(today);
  const [bulkSkipExisting, setBulkSkipExisting] = useState(true);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  // Shared queue
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const q = query(collection(db, "polls"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 30));
    } catch {}
    setQueueLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Single mode: load existing poll when date changes
  useEffect(() => {
    if (mode !== "single") return;
    const existing = queue.find((q) => q.date === date);
    if (existing) {
      setQuestion(existing.question || "");
      setOptions(existing.options || ["", "", ""]);
    } else {
      setQuestion("");
      setOptions(["", "", ""]);
    }
    setSaveMsg(null);
  }, [date, queue, mode]);

  // Bulk mode: parse "Question | Option A | Option B" lines and assign dates
  useEffect(() => {
    if (mode !== "bulk") return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setBulkPreview([]); return; }
    const existingDates = new Set(queue.map((q) => q.date));
    const preview = [];
    let dateOffset = 0;
    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      const question = parts[0] || "";
      const opts = parts.slice(1).filter(Boolean);
      const valid = Boolean(question) && opts.length >= 2;

      const d = new Date(bulkStart + "T12:00:00");
      d.setDate(d.getDate() + dateOffset);
      let dateStr = d.toISOString().slice(0, 10);
      if (bulkSkipExisting) {
        while (existingDates.has(dateStr)) {
          dateOffset++;
          const d2 = new Date(bulkStart + "T12:00:00");
          d2.setDate(d2.getDate() + dateOffset);
          dateStr = d2.toISOString().slice(0, 10);
        }
      }
      preview.push({ date: dateStr, question, options: opts, valid, exists: existingDates.has(dateStr) });
      dateOffset++;
    }
    setBulkPreview(preview);
  }, [bulkText, bulkStart, bulkSkipExisting, queue, mode]);

  const updateOption = (i, val) => {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  };

  const removeOption = (i) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== i));
  };

  const addOption = () => {
    if (options.length >= 8) return;
    setOptions([...options, ""]);
  };

  const handleSave = async () => {
    const filledOptions = options.filter((o) => o.trim());
    if (!date || !question.trim() || filledOptions.length < 2) {
      setSaveMsg("Need a date, question, and at least 2 options.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await setDoc(doc(db, "polls", date), {
        date,
        question: question.trim(),
        options: filledOptions,
        createdAt: new Date().toISOString(),
      });
      setSaveMsg("Saved!");
      loadQueue();
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

  const handleBulkSave = async () => {
    const valid = bulkPreview.filter((p) => p.valid);
    if (!valid.length) return;
    setBulkSaving(true);
    setBulkMsg(null);
    setBulkProgress({ done: 0, total: valid.length });
    try {
      let done = 0;
      for (const item of valid) {
        await setDoc(doc(db, "polls", item.date), {
          date: item.date,
          question: item.question,
          options: item.options,
          createdAt: new Date().toISOString(),
        });
        done++;
        setBulkProgress({ done, total: valid.length });
      }
      setBulkMsg(`Saved ${done} polls!`);
      setBulkText("");
      setBulkPreview([]);
      loadQueue();
    } catch (err) {
      setBulkMsg(`Error: ${err.message}`);
    }
    setBulkSaving(false);
    setBulkProgress(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this poll?")) return;
    try {
      await deleteDoc(doc(db, "polls", id));
      loadQueue();
    } catch {}
  };

  const validCount = bulkPreview.filter((p) => p.valid).length;

  return (
    <>
      {/* Mode toggle */}
      <div className="form-section" style={{ padding: "4px" }}>
        <div className="admin-tabs">
          <button className={`admin-tab ${mode === "single" ? "active" : ""}`} onClick={() => setMode("single")}>Single</button>
          <button className={`admin-tab ${mode === "bulk" ? "active" : ""}`} onClick={() => setMode("bulk")}>Bulk Import</button>
        </div>
      </div>

      {mode === "single" ? (
        <>
          {/* Date picker */}
          <div className="form-section">
            <div className="form-section-title">Poll Date</div>
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Question */}
          <div className="form-section">
            <div className="form-section-title">Question</div>
            <input className="form-input" placeholder="How are you waking up?" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>

          {/* Options */}
          <div className="form-section">
            <div className="form-section-title">Options</div>
            {options.map((opt, i) => (
              <div className="poll-option-row" key={i}>
                <input
                  className="form-input"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                {options.length > 2 && (
                  <button className="poll-remove-btn" onClick={() => removeOption(i)}>×</button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <button className="poll-add-btn" onClick={addOption}>+ Add Option</button>
            )}
          </div>

          {/* Save */}
          <div className="save-row">
            <button className="save-btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Poll"}</button>
            {saveMsg && <span className="save-status">{saveMsg}</span>}
          </div>

          {/* Preview */}
          <div className="preview-section">
            <div className="preview-label">Live Preview</div>
            <div className="preview-frame">
              <div className="poll-preview-card">
                <div className="poll-preview-title">{question || "Your question here"}</div>
                <div className="poll-preview-sub">Tap to share anonymously</div>
                {options.filter((o) => o.trim()).map((opt, i) => (
                  <div className="poll-preview-option" key={i}>{opt}</div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Bulk paste */}
          <div className="form-section">
            <div className="form-section-title">Paste Polls (one per line: Question | Option A | Option B)</div>
            <textarea
              className="form-input form-textarea"
              placeholder={"How are you waking up? | Slowly | Wired | Somewhere in between\nFirst thing you reached for? | Phone | Water | Snooze button\nToday feels like a... | Sprint | Marathon | Rest day"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              style={{ minHeight: "180px" }}
            />
            <div className="journal-char-count">
              {validCount} valid poll{validCount === 1 ? "" : "s"} detected
              {bulkPreview.length > validCount ? ` · ${bulkPreview.length - validCount} need a question + 2+ options` : ""}
            </div>
          </div>

          {/* Start date + options */}
          <div className="form-section">
            <div className="form-section-title">Starting Date</div>
            <input className="form-input" type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px", color: "rgba(253,242,232,0.6)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={bulkSkipExisting}
                onChange={(e) => setBulkSkipExisting(e.target.checked)}
                style={{ accentColor: "#F2B899" }}
              />
              Skip dates that already have a poll
            </label>
          </div>

          {/* Bulk preview */}
          {bulkPreview.length > 0 && (
            <div className="form-section">
              <div className="form-section-title">Preview ({validCount} polls)</div>
              <div style={{ maxHeight: "320px", overflowY: "auto", borderRadius: "12px" }}>
                {bulkPreview.map((item, i) => (
                  <div className="queue-item" key={i} style={{ opacity: item.valid ? (item.exists && !bulkSkipExisting ? 0.5 : 1) : 0.4 }}>
                    <div className="queue-info">
                      <div className="queue-date">
                        {item.valid ? item.date : "skipped"}
                        {item.valid && item.exists && !bulkSkipExisting && (
                          <span className="journal-badge manual" style={{ marginLeft: "6px" }}>overwrite</span>
                        )}
                        {!item.valid && (
                          <span className="journal-badge auto" style={{ marginLeft: "6px" }}>invalid</span>
                        )}
                      </div>
                      <div className="queue-art-title">{item.question || "(no question)"}</div>
                      <div className="queue-art-meta">{item.options.length} option{item.options.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk save */}
          <div className="save-row">
            <button className="save-btn" onClick={handleBulkSave} disabled={bulkSaving || !validCount}>
              {bulkSaving ? `Saving ${bulkProgress?.done}/${bulkProgress?.total}...` : `Save ${validCount} Polls`}
            </button>
            {bulkMsg && <span className="save-status">{bulkMsg}</span>}
          </div>
        </>
      )}

      {/* Queue — shared across both modes */}
      <div className="queue-section">
        <div className="queue-title">Poll Schedule</div>
        {queueLoading ? (
          <div className="queue-empty">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="queue-empty">No polls scheduled yet</div>
        ) : (
          queue.map((item) => (
            <div className={`queue-item ${item.date === today ? "queue-today" : ""}`} key={item.id}>
              <div className="queue-info">
                <div className="queue-date">{item.date}{item.date === today ? " — TODAY" : ""}</div>
                <div className="queue-art-title">{item.question}</div>
                <div className="queue-art-meta">{item.options?.length || 0} options</div>
              </div>
              <button className="queue-delete" onClick={() => handleDelete(item.id)}>Delete</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── JOURNAL PROMPT EDITOR ────────────────────────────────
function JournalPromptEditor({ initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState("single"); // "single" | "bulk"

  // Single mode state
  const [date, setDate] = useState(initialDate || today);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Bulk mode state
  const [bulkText, setBulkText] = useState("");
  const [bulkStart, setBulkStart] = useState(today);
  const [bulkSkipExisting, setBulkSkipExisting] = useState(true);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  // Shared queue
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const q = query(collection(db, "journalPrompts"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {}
    setQueueLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Single mode: load existing prompt when date changes
  useEffect(() => {
    if (mode !== "single") return;
    const existing = queue.find((q) => q.date === date);
    if (existing) {
      setPrompt(existing.prompt || "");
    } else {
      setPrompt("");
    }
    setSaveMsg(null);
  }, [date, queue, mode]);

  // Bulk mode: build preview when text or start date changes
  useEffect(() => {
    if (mode !== "bulk") return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setBulkPreview([]); return; }
    const existingDates = new Set(queue.filter((q) => q.manual).map((q) => q.date));
    const preview = [];
    let dateOffset = 0;
    for (const line of lines) {
      // Find next available date
      const d = new Date(bulkStart + "T12:00:00");
      d.setDate(d.getDate() + dateOffset);
      let dateStr = d.toISOString().slice(0, 10);
      if (bulkSkipExisting) {
        while (existingDates.has(dateStr)) {
          dateOffset++;
          const d2 = new Date(bulkStart + "T12:00:00");
          d2.setDate(d2.getDate() + dateOffset);
          dateStr = d2.toISOString().slice(0, 10);
        }
      }
      preview.push({ date: dateStr, prompt: line, exists: existingDates.has(dateStr) });
      dateOffset++;
    }
    setBulkPreview(preview);
  }, [bulkText, bulkStart, bulkSkipExisting, queue, mode]);

  const handleSave = async () => {
    if (!date || !prompt.trim()) {
      setSaveMsg("Date and prompt are required.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await setDoc(doc(db, "journalPrompts", date), {
        date,
        prompt: prompt.trim(),
        manual: true,
        createdAt: new Date().toISOString(),
      });
      setSaveMsg("Saved!");
      loadQueue();
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

  const handleBulkSave = async () => {
    if (!bulkPreview.length) return;
    setBulkSaving(true);
    setBulkMsg(null);
    setBulkProgress({ done: 0, total: bulkPreview.length });
    try {
      let done = 0;
      for (const item of bulkPreview) {
        await setDoc(doc(db, "journalPrompts", item.date), {
          date: item.date,
          prompt: item.prompt,
          manual: true,
          createdAt: new Date().toISOString(),
        });
        done++;
        setBulkProgress({ done, total: bulkPreview.length });
      }
      setBulkMsg(`Saved ${done} prompts!`);
      setBulkText("");
      setBulkPreview([]);
      loadQueue();
    } catch (err) {
      setBulkMsg(`Error: ${err.message}`);
    }
    setBulkSaving(false);
    setBulkProgress(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this prompt?")) return;
    try {
      await deleteDoc(doc(db, "journalPrompts", id));
      loadQueue();
    } catch {}
  };

  return (
    <>
      {/* Mode toggle */}
      <div className="form-section" style={{ padding: "4px" }}>
        <div className="admin-tabs">
          <button className={`admin-tab ${mode === "single" ? "active" : ""}`} onClick={() => setMode("single")}>Single</button>
          <button className={`admin-tab ${mode === "bulk" ? "active" : ""}`} onClick={() => setMode("bulk")}>Bulk Import</button>
        </div>
      </div>

      {mode === "single" ? (
        <>
          {/* Date picker */}
          <div className="form-section">
            <div className="form-section-title">Prompt Date</div>
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Prompt text */}
          <div className="form-section">
            <div className="form-section-title">Journal Prompt</div>
            <textarea
              className="form-input form-textarea"
              placeholder="What's a place in your house where you feel slightly different than you do in the rest of it?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
            <div className="journal-char-count">{prompt.length} characters</div>
          </div>

          {/* Save */}
          <div className="save-row">
            <button className="save-btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Prompt"}</button>
            {saveMsg && <span className="save-status">{saveMsg}</span>}
          </div>

          {/* Preview */}
          <div className="preview-section">
            <div className="preview-label">Live Preview</div>
            <div className="preview-frame">
              <div className="journal-preview-card">
                <div className="journal-preview-prompt">{prompt || "Your prompt here..."}</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Bulk paste */}
          <div className="form-section">
            <div className="form-section-title">Paste Prompts (one per line)</div>
            <textarea
              className="form-input form-textarea"
              placeholder={"What's a sound you heard recently that made you stop for a second?\nWhat's something you own that you'd grab if you had to leave in 60 seconds?\nWhat's a meal you ate years ago that you still think about?"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              style={{ minHeight: "180px" }}
            />
            <div className="journal-char-count">
              {bulkText.split("\n").map((l) => l.trim()).filter(Boolean).length} prompts detected
            </div>
          </div>

          {/* Start date + options */}
          <div className="form-section">
            <div className="form-section-title">Starting Date</div>
            <input className="form-input" type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px", color: "rgba(253,242,232,0.6)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={bulkSkipExisting}
                onChange={(e) => setBulkSkipExisting(e.target.checked)}
                style={{ accentColor: "#F2B899" }}
              />
              Skip dates that already have a manual prompt
            </label>
          </div>

          {/* Bulk preview */}
          {bulkPreview.length > 0 && (
            <div className="form-section">
              <div className="form-section-title">Preview ({bulkPreview.length} prompts)</div>
              <div style={{ maxHeight: "320px", overflowY: "auto", borderRadius: "12px" }}>
                {bulkPreview.map((item, i) => (
                  <div className="queue-item" key={i} style={{ opacity: item.exists && !bulkSkipExisting ? 0.5 : 1 }}>
                    <div className="queue-info">
                      <div className="queue-date">
                        {item.date}
                        {item.exists && !bulkSkipExisting && (
                          <span className="journal-badge manual" style={{ marginLeft: "6px" }}>overwrite</span>
                        )}
                      </div>
                      <div className="queue-art-title">{item.prompt}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk save */}
          <div className="save-row">
            <button className="save-btn" onClick={handleBulkSave} disabled={bulkSaving || !bulkPreview.length}>
              {bulkSaving ? `Saving ${bulkProgress?.done}/${bulkProgress?.total}...` : `Save ${bulkPreview.length} Prompts`}
            </button>
            {bulkMsg && <span className="save-status">{bulkMsg}</span>}
          </div>
        </>
      )}

      {/* Queue — shared across both modes */}
      <div className="queue-section">
        <div className="queue-title">Prompt History</div>
        {queueLoading ? (
          <div className="queue-empty">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="queue-empty">No prompts yet</div>
        ) : (
          queue.map((item) => (
            <div className={`queue-item ${item.date === today ? "queue-today" : ""}`} key={item.id}>
              <div className="queue-info">
                <div className="queue-date">
                  {item.date}{item.date === today ? " — TODAY" : ""}
                  <span className={`journal-badge ${item.manual ? "manual" : "auto"}`}>
                    {item.manual ? "Manual" : "Auto"}
                  </span>
                </div>
                <div className="queue-art-title">{item.prompt}</div>
              </div>
              <button className="queue-delete" onClick={() => handleDelete(item.id)}>Delete</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── OVERVIEW CALENDAR ───────────────────────────────────
// Month grid showing which daily content each day has. A=Art, P=Poll,
// J=Journal, E=Entrance — filled marker = scheduled, hollow = missing.
// Click any marker to jump to that editor with the date prefilled.
function OverviewCalendar({ onJump }) {
  const today = new Date().toISOString().slice(0, 10);
  const [sets, setSets] = useState(null);
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  useEffect(() => {
    (async () => {
      const cols = { art: "artOfTheDay", poll: "polls", journal: "journalPrompts", entrance: "morningSequence" };
      const result = {};
      for (const [key, name] of Object.entries(cols)) {
        try {
          const snap = await getDocs(collection(db, name));
          result[key] = new Set(snap.docs.map((d) => d.id));
        } catch {
          result[key] = new Set();
        }
      }
      setSets(result);
    })();
  }, []);

  const pad = (n) => String(n).padStart(2, "0");
  const { y, m } = view;
  const firstDay = new Date(y, m, 1);
  const leadBlanks = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const TYPES = [
    { key: "art", label: "A", tab: "art" },
    { key: "poll", label: "P", tab: "polls" },
    { key: "journal", label: "J", tab: "journal" },
    { key: "entrance", label: "E", tab: "entrance" },
  ];

  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const cream = "rgba(253,242,232,";
  const markerStyle = (present) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", height: 20, borderRadius: 6, fontSize: 10, fontWeight: 700,
    cursor: "pointer", border: present ? "none" : `1px solid ${cream}0.2)`,
    background: present ? "#F2B899" : "transparent",
    color: present ? "#0C1A35" : `${cream}0.35)`,
  });

  return (
    <div className="form-section">
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button className="poll-add-btn" onClick={prevMonth} style={{ width: "auto", padding: "4px 14px" }}>‹</button>
        <div className="form-section-title" style={{ margin: 0 }}>{monthName}</div>
        <button className="poll-add-btn" onClick={nextMonth} style={{ width: "auto", padding: "4px 14px" }}>›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: `${cream}0.4)` }}>{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const dateStr = `${y}-${pad(m + 1)}-${pad(d)}`;
          const isToday = dateStr === today;
          return (
            <div key={dateStr} style={{
              border: isToday ? "1.5px solid #F2B899" : `1px solid ${cream}0.1)`,
              borderRadius: 10, padding: 6, minHeight: 64, background: `${cream}0.03)`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: `${cream}0.6)`, marginBottom: 6 }}>{d}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    title={`${t.key} — ${sets?.[t.key]?.has(dateStr) ? "scheduled" : "missing"} (click to edit ${dateStr})`}
                    style={markerStyle(sets?.[t.key]?.has(dateStr))}
                    onClick={() => onJump(t.tab, dateStr)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 12, color: `${cream}0.5)`, flexWrap: "wrap" }}>
        <span><b style={{ color: `${cream}0.75)` }}>A</b> Art</span>
        <span><b style={{ color: `${cream}0.75)` }}>P</b> Poll</span>
        <span><b style={{ color: `${cream}0.75)` }}>J</b> Journal</span>
        <span><b style={{ color: `${cream}0.75)` }}>E</b> Entrance</span>
        <span style={{ marginLeft: "auto" }}>filled = scheduled · hollow = missing</span>
      </div>

      {!sets && <div className="queue-empty">Loading…</div>}
    </div>
  );
}

// ── ENTRANCE EDITOR ─────────────────────────────────────
// Daily morning-sequence content: one video + a set of photos, saved to
// morningSequence/{date}. Photos are compressed on upload; the video is
// uploaded as-is (source is already phone-sized 720x1280).
function EntranceEditor({ initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate || today);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [progress, setProgress] = useState(null);

  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const q = query(collection(db, "morningSequence"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {}
    setQueueLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Load existing content when the date changes; clear any pending selection.
  useEffect(() => {
    setExisting(queue.find((q) => q.date === date) || null);
    setVideoFile(null);
    setVideoName("");
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setSaveMsg(null);
  }, [date, queue]);

  const handleVideoSelect = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    setVideoFile(file);
    setVideoName(file.name);
  };

  const handlePhotosSelect = (files) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setPhotoFiles(imgs);
    Promise.all(
      imgs.map((f) => new Promise((res) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result);
        r.readAsDataURL(f);
      }))
    ).then(setPhotoPreviews);
  };

  const handleSave = async () => {
    if (!date) { setSaveMsg("Date is required."); return; }
    if (!videoFile && !photoFiles.length && !existing) {
      setSaveMsg("Add a video or photos.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);

    try {
      let videoUrl = existing?.videoUrl || null;
      let photos = existing?.photos || [];

      const total = (videoFile ? 1 : 0) + photoFiles.length;
      let done = 0;
      if (total) setProgress({ done, total });

      if (videoFile) {
        const r = ref(storage, `morningSequence/${date}-video-${Date.now()}.mp4`);
        await uploadBytes(r, videoFile);
        videoUrl = await getDownloadURL(r);
        setProgress({ done: ++done, total });
      }

      if (photoFiles.length) {
        const urls = [];
        for (let i = 0; i < photoFiles.length; i++) {
          const compressed = await compressImage(photoFiles[i]);
          const r = ref(storage, `morningSequence/${date}-photo-${i}-${Date.now()}.jpg`);
          await uploadBytes(r, compressed);
          urls.push(await getDownloadURL(r));
          setProgress({ done: ++done, total });
        }
        photos = urls; // a new photo selection replaces the previous set
      }

      await setDoc(doc(db, "morningSequence", date), {
        date,
        videoUrl,
        photos,
        createdAt: new Date().toISOString(),
      });
      setSaveMsg("Saved!");
      loadQueue();
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
    setProgress(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entrance?")) return;
    try {
      await deleteDoc(doc(db, "morningSequence", id));
      loadQueue();
    } catch {}
  };

  // What to show in the photo preview area: new selection, else existing.
  const previewPhotos = photoPreviews.length ? photoPreviews : (existing?.photos || []);
  const hasVideo = videoFile || existing?.videoUrl;

  return (
    <>
      {/* Date picker */}
      <div className="form-section">
        <div className="form-section-title">Publish Date</div>
        <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* Video upload */}
      <div className="form-section">
        <div className="form-section-title">Entrance Video</div>
        <div className="dropzone">
          <input type="file" accept="video/*" onChange={(e) => handleVideoSelect(e.target.files[0])} />
          {hasVideo ? (
            <div className="dropzone-text">
              {videoFile ? `Selected: ${videoName}` : "Current video uploaded — choose a file to replace"}
            </div>
          ) : (
            <>
              <div className="dropzone-text">Drop a video here or click to browse</div>
              <div className="dropzone-hint">MP4 · 720×1080, uploaded as-is</div>
            </>
          )}
        </div>
      </div>

      {/* Photos upload */}
      <div className="form-section">
        <div className="form-section-title">Photos</div>
        <div className="dropzone">
          <input type="file" accept="image/*" multiple onChange={(e) => handlePhotosSelect(e.target.files)} />
          {previewPhotos.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {previewPhotos.map((src, i) => (
                <img key={i} src={src} alt={`Photo ${i + 1}`} style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <>
              <div className="dropzone-text">Drop photos here or click to browse</div>
              <div className="dropzone-hint">Shown in order · compressed on upload</div>
            </>
          )}
        </div>
        {photoPreviews.length > 0 && (
          <div className="journal-char-count">{photoPreviews.length} new photo{photoPreviews.length === 1 ? "" : "s"} — replaces the current set</div>
        )}
      </div>

      {/* Save */}
      <div className="save-row">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (progress ? `Uploading ${progress.done}/${progress.total}...` : "Saving...") : "Save Entrance"}
        </button>
        {saveMsg && <span className="save-status">{saveMsg}</span>}
      </div>

      {/* Schedule */}
      <div className="queue-section">
        <div className="queue-title">Entrance Schedule</div>
        {queueLoading ? (
          <div className="queue-empty">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="queue-empty">No entrances scheduled yet</div>
        ) : (
          queue.map((item) => (
            <div className={`queue-item ${item.date === today ? "queue-today" : ""}`} key={item.id}>
              {item.photos?.[0] ? (
                <img src={item.photos[0]} alt="" className="queue-thumb" />
              ) : (
                <div className="queue-thumb" />
              )}
              <div className="queue-info">
                <div className="queue-date">{item.date}{item.date === today ? " — TODAY" : ""}</div>
                <div className="queue-art-meta">
                  {item.videoUrl ? "Video" : "No video"} · {item.photos?.length || 0} photo{item.photos?.length === 1 ? "" : "s"}
                </div>
              </div>
              <button className="queue-delete" onClick={() => handleDelete(item.id)}>Delete</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── ART EDITOR ──────────────────────────────────────────
function AdminDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState("overview");
  // Date carried from the overview when you click a day, prefilled into editors.
  const [selectedDate, setSelectedDate] = useState(today);

  // Jump from the overview calendar to an editor for a specific date.
  const goToEditor = (tab, dateStr) => {
    setSelectedDate(dateStr);
    if (tab === "art") setDate(dateStr); // the Art form lives in this component
    setActiveTab(tab);
  };

  // Form state
  const [date, setDate] = useState(today);
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [yearSource, setYearSource] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Queue state
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);

  // Load queue
  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const q = query(
        collection(db, "artOfTheDay"),
        where("date", ">=", today),
        orderBy("date", "asc")
      );
      const snap = await getDocs(q);
      setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      // Also load past entries to show recently published
      try {
        const q = query(collection(db, "artOfTheDay"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 30));
      } catch {}
    }
    setQueueLoading(false);
  }, [today]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Image handling
  const handleImageSelect = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleImageSelect(file);
  };

  // Save
  const handleSave = async () => {
    if (!date || !title || !artist) {
      setSaveMsg("Date, artist, and title are required.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);

    try {
      let imageUrl = null;

      if (imageFile) {
        const compressed = await compressImage(imageFile);
        const path = `art/${date}-${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, compressed);
        imageUrl = await getDownloadURL(storageRef);
      }

      const docData = {
        date,
        artist,
        title,
        yearSource,
        description,
        imageUrl,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "artOfTheDay", date), docData);
      setSaveMsg("Saved!");
      setArtist("");
      setTitle("");
      setYearSource("");
      setDescription("");
      setImageFile(null);
      setImagePreview(null);
      loadQueue();
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

  // Delete
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await deleteDoc(doc(db, "artOfTheDay", id));
      loadQueue();
    } catch {}
  };

  // Load existing entry when date changes, or clear fields for empty dates
  useEffect(() => {
    const existing = queue.find((q) => q.date === date);
    if (existing) {
      setArtist(existing.artist || "");
      setTitle(existing.title || "");
      setYearSource(existing.yearSource || "");
      setDescription(existing.description || "");
      setImagePreview(existing.imageUrl || null);
      setImageFile(null);
    } else {
      setArtist("");
      setTitle("");
      setYearSource("");
      setDescription("");
      setImagePreview(null);
      setImageFile(null);
    }
    setSaveMsg(null);
  }, [date, queue]);

  return (
    <div className="admin-shell">
      <div className="admin-top">
        <div className="admin-title">Morning Scroll Admin</div>
        <button className="admin-logout" onClick={() => signOut(auth)}>Sign Out</button>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>Overview</button>
        <button className={`admin-tab ${activeTab === "art" ? "active" : ""}`} onClick={() => setActiveTab("art")}>Art of the Day</button>
        <button className={`admin-tab ${activeTab === "polls" ? "active" : ""}`} onClick={() => setActiveTab("polls")}>Polls</button>
        <button className={`admin-tab ${activeTab === "journal" ? "active" : ""}`} onClick={() => setActiveTab("journal")}>Journal Prompts</button>
        <button className={`admin-tab ${activeTab === "entrance" ? "active" : ""}`} onClick={() => setActiveTab("entrance")}>Entrance</button>
      </div>

      {activeTab === "overview" ? <OverviewCalendar onJump={goToEditor} /> : activeTab === "journal" ? <JournalPromptEditor initialDate={selectedDate} /> : activeTab === "polls" ? <PollEditor initialDate={selectedDate} /> : activeTab === "entrance" ? <EntranceEditor initialDate={selectedDate} /> : <>

      {/* Date picker */}
      <div className="form-section">
        <div className="form-section-title">Publish Date</div>
        <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* Image upload */}
      <div className="form-section">
        <div className="form-section-title">Artwork Image</div>
        <div
          className={`dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e.target.files[0])} />
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" className="dropzone-preview" />
          ) : (
            <>
              <div className="dropzone-text">Drop an image here or click to browse</div>
              <div className="dropzone-hint">JPG, PNG, WebP</div>
            </>
          )}
        </div>
      </div>

      {/* Text fields */}
      <div className="form-section">
        <div className="form-section-title">Details</div>
        <div className="form-row">
          <div>
            <label className="form-label">Artist Name</label>
            <input className="form-input" placeholder="Vincent van Gogh" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Artwork Title</label>
            <input className="form-input" placeholder="Starry Night Over the Rhone" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label className="form-label">Year / Source</label>
            <input className="form-input" placeholder="1888 · Musee d'Orsay, Paris" value={yearSource} onChange={(e) => setYearSource(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea className="form-input form-textarea" placeholder="A short description of the artwork..." value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {/* Save */}
      <div className="save-row">
        <button className="save-btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Entry"}</button>
        {saveMsg && <span className="save-status">{saveMsg}</span>}
      </div>

      {/* Live preview */}
      <div className="preview-section">
        <div className="preview-label">Live Preview</div>
        <div className="preview-frame">
          <div className="art-card">
            <div className="art-image">
              {imagePreview ? (
                <img src={imagePreview} alt={title} />
              ) : (
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(160,204,200,0.18)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
                </svg>
              )}
            </div>
            <div className="art-info">
              <div className="art-title">{title || "Artwork Title"}</div>
              <div className="art-meta">
                {artist || "Artist"}{yearSource ? ` · ${yearSource}` : ""}
              </div>
              {description && <div className="art-desc">{description}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Art Queue */}
      <div className="queue-section">
        <div className="queue-title">Art Schedule</div>
        {queueLoading ? (
          <div className="queue-empty">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="queue-empty">No entries scheduled yet</div>
        ) : (
          queue.map((item) => (
            <div className={`queue-item ${item.date === today ? "queue-today" : ""}`} key={item.id}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="queue-thumb" />
              ) : (
                <div className="queue-thumb" />
              )}
              <div className="queue-info">
                <div className="queue-date">{item.date}{item.date === today ? " — TODAY" : ""}</div>
                <div className="queue-art-title">{item.title}</div>
                <div className="queue-art-meta">{item.artist}{item.yearSource ? ` · ${item.yearSource}` : ""}</div>
              </div>
              <button className="queue-delete" onClick={() => handleDelete(item.id)}>Delete</button>
            </div>
          ))
        )}
      </div>
      </>}
    </div>
  );
}

// ── ROOT ────────────────────────────────────────────────
export default function AdminApp() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  return (
    <>
      <style>{STYLES}</style>
      {user === undefined ? null : user ? <AdminDashboard /> : <LoginScreen />}
    </>
  );
}
