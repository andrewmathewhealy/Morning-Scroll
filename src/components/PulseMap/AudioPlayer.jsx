import { Icon } from "../../icons/Icon.jsx";

export default function AudioPlayer({ station, status, onTogglePlay, onStop, isMinimized }) {
  if (!station) return null;

  if (isMinimized) {
    return (
      <div className="radio-mini-inner">
        <div className="radio-mini-live">
          {status === "playing" && <span className="radio-live-dot" />}
          {status === "loading" && <span className="radio-loading-dot" />}
          {status === "error" && <span className="radio-error-dot" />}
        </div>
        <div className="radio-mini-info">
          <div className="radio-mini-name">{station.name}</div>
          <div className="radio-mini-country">
            {status === "error" ? "Stream unavailable" : station.country}
          </div>
        </div>
        <button className="radio-mini-btn" onClick={onTogglePlay} aria-label={status === "playing" ? "Pause" : "Play"}>
          {status === "playing" ? <Icon.Pause size={16} color="#0C1A35" /> : <Icon.Play size={16} color="#0C1A35" />}
        </button>
        <button className="radio-mini-btn" onClick={onStop} aria-label="Stop">
          <Icon.X size={16} color="rgba(12,26,53,0.5)" />
        </button>
      </div>
    );
  }

  // Full mode (inside station picker)
  return (
    <div className="radio-now-playing">
      <div className="radio-np-header">
        <span className="radio-np-label">Now Playing</span>
        {status === "playing" && <span className="radio-live-dot" />}
        {status === "loading" && <span className="radio-loading-dot" />}
      </div>
      <div className="radio-np-station">{station.name}</div>
      <div className="radio-np-country">{station.country}</div>
      {status === "error" && (
        <div className="radio-np-error">Stream unavailable — try another station</div>
      )}
      <div className="radio-np-controls">
        <button className="radio-np-btn" onClick={onTogglePlay}>
          {status === "playing" ? <Icon.Pause size={22} color="#0C1A35" /> : <Icon.Play size={22} color="#0C1A35" />}
        </button>
        <button className="radio-np-stop" onClick={onStop}>
          <Icon.X size={18} color="rgba(12,26,53,0.5)" />
        </button>
      </div>
    </div>
  );
}
