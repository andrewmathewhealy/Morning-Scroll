import { useState, useRef, useCallback, useMemo } from "react";
import { useGameAudio } from "./useGameAudio.js";
import { useHaptics } from "./useHaptics.js";
import "./oneline.css";

// Shapes as dotted outlines — normalized 0-1 coordinates, closed paths
const SHAPES = [
  { name: "square", points: [[0.2,0.2],[0.8,0.2],[0.8,0.8],[0.2,0.8],[0.2,0.2]] },
  { name: "triangle", points: [[0.5,0.12],[0.88,0.85],[0.12,0.85],[0.5,0.12]] },
  { name: "diamond", points: [[0.5,0.1],[0.88,0.5],[0.5,0.9],[0.12,0.5],[0.5,0.1]] },
  { name: "circle", points: Array.from({length:40},(_, i) => { const a=i/40*Math.PI*2-Math.PI/2; return [0.5+0.36*Math.cos(a),0.5+0.36*Math.sin(a)]; }).concat([[0.5+0.36*Math.cos(-Math.PI/2),0.5+0.36*Math.sin(-Math.PI/2)]]) },
  { name: "star", points: (() => { const pts=[]; for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2-Math.PI/2;const r=i%2===0?0.38:0.16;pts.push([0.5+r*Math.cos(a),0.5+r*Math.sin(a)]);} pts.push(pts[0].slice()); return pts; })() },
  { name: "heart", points: (() => { const pts=[]; for(let i=0;i<=32;i++){const t=i/32*Math.PI*2;const x=16*Math.pow(Math.sin(t),3);const y=-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t));pts.push([0.5+x/44,0.52+y/44]);} return pts; })() },
  { name: "hexagon", points: Array.from({length:7},(_, i) => { const a=i/6*Math.PI*2-Math.PI/2; return [0.5+0.36*Math.cos(a),0.5+0.36*Math.sin(a)]; }) },
  { name: "arrow", points: [[0.5,0.1],[0.85,0.45],[0.62,0.45],[0.62,0.9],[0.38,0.9],[0.38,0.45],[0.15,0.45],[0.5,0.1]] },
  { name: "zigzag", points: [[0.1,0.65],[0.3,0.3],[0.5,0.65],[0.7,0.3],[0.9,0.65]] },
  { name: "house", points: [[0.5,0.12],[0.85,0.45],[0.85,0.88],[0.15,0.88],[0.15,0.45],[0.5,0.12]] },
  { name: "lightning", points: [[0.55,0.08],[0.35,0.42],[0.55,0.42],[0.4,0.92],[0.7,0.48],[0.5,0.48],[0.65,0.08]] },
  { name: "moon", points: (() => { const pts=[]; for(let i=0;i<=20;i++){const a=i/20*Math.PI*1.6-Math.PI*0.3;pts.push([0.5+0.35*Math.cos(a),0.5+0.35*Math.sin(a)]);} for(let i=20;i>=0;i--){const a=i/20*Math.PI*1.6-Math.PI*0.3;pts.push([0.5+0.2*Math.cos(a)+0.1,0.5+0.2*Math.sin(a)]);} return pts; })() },
];

// Densify a shape so dots are evenly spaced along the path
function densify(points, spacing = 0.02) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = out[out.length - 1];
    const [bx, by] = points[i];
    const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    const steps = Math.max(1, Math.floor(dist / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  }
  return out;
}

const TOLERANCE = 30; // px — how close the finger must be to a path point to "cover" it

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

export default function OneLine({ onComplete }) {
  const audio = useGameAudio();
  const haptics = useHaptics();
  const shape = useMemo(() => SHAPES[getDayOfYear() % SHAPES.length], []);
  const dottedPoints = useMemo(() => densify(shape.points, 0.025), [shape]);

  const [drawing, setDrawing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [userPath, setUserPath] = useState([]); // array of {x, y} in SVG viewBox coords (0-100)
  const [covered, setCovered] = useState(new Set()); // indices of dotted points the user has passed near
  const svgRef = useRef(null);
  const audioRef = useRef(0); // last audio time

  const getPos = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: ((touch.clientX - rect.left) / rect.width) * 100,
      y: ((touch.clientY - rect.top) / rect.height) * 100,
      px: touch.clientX - rect.left, // pixel coords for tolerance
      py: touch.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  }, []);

  const checkCoverage = useCallback((px, py, w, h) => {
    // Check which dotted points the finger is near
    const newCovered = new Set(covered);
    let changed = false;
    for (let i = 0; i < dottedPoints.length; i++) {
      if (newCovered.has(i)) continue;
      const dx = dottedPoints[i][0] * w - px;
      const dy = dottedPoints[i][1] * h - py;
      if (Math.sqrt(dx * dx + dy * dy) < TOLERANCE) {
        newCovered.add(i);
        changed = true;
      }
    }
    if (changed) {
      setCovered(newCovered);

      // Audio tick
      const now = Date.now();
      if (now - audioRef.current > 120) {
        audio.playTrace(Math.floor((newCovered.size / dottedPoints.length) * 11));
        audioRef.current = now;
      }

      // Check completion
      if (newCovered.size >= dottedPoints.length) {
        setCompleted(true);
        haptics.success();
        audio.playCompletion();
        setTimeout(() => onComplete?.(), 600);
      }
    }
  }, [covered, dottedPoints, audio, haptics, onComplete]);

  const handleStart = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos || completed) return;
    setDrawing(true);
    setUserPath([{ x: pos.x, y: pos.y }]);
    haptics.tap();
    checkCoverage(pos.px, pos.py, pos.w, pos.h);
  }, [getPos, completed, haptics, checkCoverage]);

  const handleMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || completed) return;
    const pos = getPos(e);
    if (!pos) return;
    setUserPath(prev => [...prev, { x: pos.x, y: pos.y }]);
    checkCoverage(pos.px, pos.py, pos.w, pos.h);
  }, [drawing, completed, getPos, checkCoverage]);

  const handleEnd = useCallback(() => {
    // User can lift and resume — don't reset anything
    setDrawing(false);
  }, []);

  // Build user's freehand path as SVG
  const userSvgPath = useMemo(() => {
    if (userPath.length < 2) return "";
    return userPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }, [userPath]);

  return (
    <div className="mg-oneline-container">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="mg-oneline-svg"
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleStart}
        onMouseMove={(e) => { if (e.buttons) handleMove(e); }}
        onMouseUp={handleEnd}
      >
        {/* Dotted outline */}
        {dottedPoints.map((p, i) => (
          <circle
            key={i}
            cx={p[0] * 100}
            cy={p[1] * 100}
            r={covered.has(i) ? 0.6 : 1}
            fill={covered.has(i) ? "rgba(228,189,88,0.3)" : "rgba(12,26,53,0.18)"}
            transition="r 0.2s"
          />
        ))}

        {/* User's freehand drawing */}
        {userPath.length > 1 && (
          <path
            d={userSvgPath}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={completed ? "mg-oneline-complete" : ""}
          />
        )}

        {/* Start hint dot */}
        {userPath.length === 0 && (
          <circle
            cx={dottedPoints[0][0] * 100}
            cy={dottedPoints[0][1] * 100}
            r="3.5"
            fill="rgba(228,189,88,0.8)"
            className="mg-oneline-start"
          />
        )}

        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E4BD58" />
            <stop offset="100%" stopColor="#E08070" />
          </linearGradient>
        </defs>
      </svg>

      {userPath.length === 0 && (
        <div className="mg-oneline-hint">trace the shape</div>
      )}
    </div>
  );
}
