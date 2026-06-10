// "Today's Light" — the day's sunrise/sunset shown directly over a fixed sky
// photo. Times come from the weather data, passed down from HomeScreen (same as
// MoonWidget's moonphase), so there's no extra fetch or location prompt.

// Format Visual Crossing's local "HH:MM:SS" into "6:42 AM".
function formatClock(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function TodaysLight({ sunrise, sunset }) {
  return (
    <div className="todays-light">
      <div className="tl-item">
        <span className="tl-label">Sunrise:</span>
        <span className="tl-time">{formatClock(sunrise)}</span>
      </div>
      <div className="tl-item tl-item-right">
        <span className="tl-label">Sunset:</span>
        <span className="tl-time">{formatClock(sunset)}</span>
      </div>
    </div>
  );
}
