import { useState, useEffect } from "react";
import { WORKER_URL } from "../../config.js";

function useOnThisDay() {
  const [state, setState] = useState({ loading: true, event: null, error: null });

  useEffect(() => {
    const now = new Date();
    const cacheKey = `otd-v3-${now.getMonth() + 1}-${now.getDate()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setState({ loading: false, event: JSON.parse(cached), error: null }); return; } catch {}
    }

    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/wikipedia`);
        const event = await res.json();
        if (event.error) throw new Error(event.error);
        localStorage.setItem(cacheKey, JSON.stringify(event));
        setState({ loading: false, event, error: null });
      } catch {
        setState({ loading: false, event: null, error: 'Could not load today\'s event.' });
      }
    })();
  }, []);

  return state;
}

function OnThisDayWidget() {
  const { loading, event, error } = useOnThisDay();

  return (
    <div className="otd-widget">
      <div className="otd-label">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#0C1A35" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5" stroke="#0C1A35" strokeWidth="1.2" strokeLinecap="round"/><line x1="5" y1="5" x2="7" y2="5" stroke="#0C1A35" strokeWidth="1.2" strokeLinecap="round"/></svg>
        On This Day
      </div>
      {loading && (
        <div className="otd-loading">
          <div className="otd-dot" /><div className="otd-dot" /><div className="otd-dot" />
          <span>Finding today's moment…</span>
        </div>
      )}
      {!loading && event && (
        <>
          <div className="otd-year">{event.year}</div>
          <div className="otd-meta">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, {event.year}
            {event.location && <><span style={{color:'#8ECAE6'}}>·</span> {event.location}</>}
          </div>
          <div className="otd-text">{event.text}</div>
          {event.wiki_url && (
            <a className="otd-link" href={event.wiki_url} target="_blank" rel="noopener noreferrer">
              Read more on Wikipedia ↗
            </a>
          )}
        </>
      )}
      {!loading && error && <div className="otd-text" style={{ color: 'rgba(2,48,71,0.55)' }}>{error}</div>}
    </div>
  );
}

export default OnThisDayWidget;
