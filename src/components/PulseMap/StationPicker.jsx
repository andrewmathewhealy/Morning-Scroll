import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../icons/Icon.jsx";
import AudioPlayer from "./AudioPlayer.jsx";

export default function StationPicker({
  stations, loading, error, country, onSelect, onClose,
  currentStation, radioStatus, onTogglePlay, onStop,
}) {
  const [closing, setClosing] = useState(false);
  const [armed, setArmed] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });
  const sheetRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("journal-open");
    // Ignore the trailing "ghost click" from the globe tap that opened this
    // sheet — otherwise the overlay's onClick fires the instant it mounts and
    // the picker closes immediately.
    const armTimer = setTimeout(() => setArmed(true), 300);
    return () => {
      document.body.classList.remove("journal-open");
      clearTimeout(armTimer);
    };
  }, []);

  const dismiss = () => {
    if (!armed) return;
    setClosing(true);
    setTimeout(onClose, 500);
  };

  const handleTouchStart = (e) => { dragRef.current = { startY: e.touches[0].clientY, dragging: true }; };
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
    if (dy > 80) dismiss();
  };

  const phoneEl = document.getElementById("phone-shell");
  if (!phoneEl) return null;

  const isPlaying = (s) => currentStation?.url_resolved === s.url_resolved;

  return createPortal(
    <>
      <div className={`station-picker-overlay ${closing ? "closing" : ""}`} onClick={dismiss} />
      <div className={`station-picker-sheet ${closing ? "closing" : ""}`} ref={sheetRef}>
        <div className="station-picker-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        <div className="station-picker-header">
          <Icon.Radio size={16} color="#B8DDE8" />
          <span className="station-picker-title">{country ? `Radio in ${country}` : "Nearby Stations"}</span>
        </div>

        {loading && (
          <div className="station-picker-loading">
            <div className="station-shimmer" />
            <div className="station-shimmer" />
            <div className="station-shimmer" />
          </div>
        )}

        {error && !loading && (
          <div className="station-picker-empty">{error}</div>
        )}

        {!loading && !error && stations.length > 0 && (
          <div className="station-list">
            {stations.map((s, i) => (
              <button
                key={s.stationuuid || i}
                className={`station-card ${isPlaying(s) ? "active" : ""}`}
                onClick={() => onSelect(s)}
              >
                <div className="station-card-icon">
                  {s.favicon ? (
                    <img src={s.favicon} alt="" className="station-favicon" onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                  ) : null}
                  <div className="station-favicon-fallback" style={s.favicon ? { display: "none" } : undefined}>
                    <Icon.Radio size={18} color="rgba(253,242,232,0.4)" />
                  </div>
                </div>
                <div className="station-card-info">
                  <div className="station-card-name">{s.name}</div>
                  <div className="station-card-meta">
                    {s.country}
                    {s.tags && <span className="station-card-dot">·</span>}
                    {s.tags && <span className="station-card-tags">{s.tags.split(",").slice(0, 2).join(", ")}</span>}
                  </div>
                </div>
                {isPlaying(s) && radioStatus === "playing" && (
                  <span className="station-playing-badge">
                    <span className="radio-live-dot" />
                    <span>Live</span>
                  </span>
                )}
                {isPlaying(s) && radioStatus === "loading" && (
                  <span className="station-loading-badge">...</span>
                )}
              </button>
            ))}
          </div>
        )}

        {currentStation && (
          <AudioPlayer
            station={currentStation}
            status={radioStatus}
            onTogglePlay={onTogglePlay}
            onStop={onStop}
          />
        )}
      </div>
    </>,
    phoneEl
  );
}
