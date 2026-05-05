import { useEffect, useMemo } from "react";

export default function CompletionOverlay({ onComplete }) {
  const particles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 40 + Math.random() * 30;
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size: 4 + Math.random() * 4,
        color: [
          "rgba(251,232,211,0.7)",
          "rgba(228,189,88,0.6)",
          "rgba(240,208,128,0.65)",
          "rgba(253,242,232,0.7)",
          "rgba(160,204,200,0.5)",
        ][i % 5],
        delay: Math.random() * 0.15,
      };
    }),
  []);

  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), 1400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="mg-completion">
      <div className="mg-completion-burst">
        {particles.map(p => (
          <div
            key={p.id}
            className="mg-completion-particle"
            style={{
              "--px": `${p.x}px`,
              "--py": `${p.y}px`,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="mg-completion-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(228,189,88,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </div>
      <div className="mg-completion-text">good morning</div>
    </div>
  );
}
