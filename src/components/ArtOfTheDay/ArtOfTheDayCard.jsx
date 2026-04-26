import { useState, useEffect } from "react";
import { db } from "../../firebase.js";
import { doc, getDoc } from "firebase/firestore";

function useArtOfTheDay() {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `art-v1-${today}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { setState({ loading: false, data: cached }); return; }
    } catch {}

    (async () => {
      try {
        const snap = await getDoc(doc(db, "artOfTheDay", today));
        if (snap.exists()) {
          const data = snap.data();
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setState({ loading: false, data });
        } else {
          setState({ loading: false, data: null });
        }
      } catch {
        setState({ loading: false, data: null });
      }
    })();
  }, []);

  return state;
}

function ArtOfTheDayCard() {
  const { loading, data } = useArtOfTheDay();

  if (loading) return (
    <div className="art-card widget-shimmer" style={{ minHeight: 160 }}>
      <div className="art-image">
        <PaintingIcon size={64} />
      </div>
      <div className="art-info">
        <div className="skeleton" style={{ width: '60%', height: 14 }} />
        <div className="skeleton" style={{ width: '80%', height: 10, marginTop: 6 }} />
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="art-card">
      <div className="art-image">
        {data.imageUrl ? (
          <img src={data.imageUrl} alt={data.title} />
        ) : (
          <PaintingIcon size={64} />
        )}
      </div>
      <div className="art-info">
        <div className="art-title">{data.title}</div>
        <div className="art-meta">{data.artist}{data.yearSource ? ` · ${data.yearSource}` : ''}</div>
        {data.description && <div className="art-desc">{data.description}</div>}
      </div>
    </div>
  );
}

// Inline painting icon to avoid importing the full Icon module
function PaintingIcon({ size = 56, color = "rgba(142,202,230,0.18)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
    </svg>
  );
}

export default ArtOfTheDayCard;
