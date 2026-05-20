import { useState, useEffect, useRef, useCallback } from "react";
import { useHaptics } from "./useHaptics.js";
import { getSharedAudioContext } from "../../hooks/useAudioContext.js";

// ── CONFIG ───────────────────────────────────────────────
const COLS = 7;
const ROWS = 4;
const BRICK_GAP = 3;
const BRICK_H = 14;
const PADDLE_W = 56;
const PADDLE_H = 10;
const BALL_R = 5;
const BALL_SPEED = 3.5;
const PADDLE_BOTTOM = 24;

// Row 0 (top) = 3 hits, row 1 = 2 hits, rows 2-3 = 1 hit
const ROW_HP = [3, 2, 1, 1];

// Colors per HP level — brick fades as it gets weaker
// Matched to brickbreaker-bg.webp: peach sky, mauve mountains, lavender haze, teal water
const BRICK_COLORS_BY_HP = {
  3: ["#F2B899", "#F5C5A8", "#F8D2B8", "#FADFC8", "#F8D2B8", "#F5C5A8", "#F2B899"],
  2: ["#D898AC", "#E0A8BA", "#E8B8C8", "#F0C8D6", "#E8B8C8", "#E0A8BA", "#D898AC"],
  1: ["#C4B0D8", "#D0BEE0", "#DCCCE8", "#E8DAF0", "#DCCCE8", "#D0BEE0", "#C4B0D8"],
};

// Base row colors (full HP appearance)
const BRICK_COLORS = [
  BRICK_COLORS_BY_HP[3],
  BRICK_COLORS_BY_HP[2],
  BRICK_COLORS_BY_HP[1],
  ["#A0CCC8", "#B0D8D4", "#C0E4E0", "#D0EEEA", "#C0E4E0", "#B0D8D4", "#A0CCC8"],
];

function brickColor(row, col, hp) {
  if (hp >= 3) return BRICK_COLORS_BY_HP[3][col];
  if (hp === 2) return BRICK_COLORS_BY_HP[2][col];
  return BRICK_COLORS[row][col];
}

function buildBricks(canvasW) {
  const bricks = [];
  const brickW = (canvasW - (COLS + 1) * BRICK_GAP) / COLS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const hp = ROW_HP[r];
      bricks.push({
        x: BRICK_GAP + c * (brickW + BRICK_GAP),
        y: 30 + r * (BRICK_H + BRICK_GAP),
        w: brickW,
        h: BRICK_H,
        row: r,
        col: c,
        hp,
        color: BRICK_COLORS[r][c],
        alive: true,
      });
    }
  }
  return bricks;
}

// ── AUDIO ────────────────────────────────────────────────
function getAudioCtx() {
  return getSharedAudioContext();
}

function playTick(ctx, freq = 660, dur = 0.06) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

function playWin(ctx) {
  [523.25, 659.25, 783.99].forEach((f, i) => {
    setTimeout(() => playTick(ctx, f, 0.2), i * 120);
  });
}

// ── COMPONENT ────────────────────────────────────────────
export default function BrickBreaker() {
  const canvasRef = useRef(null);
  const haptics = useHaptics();
  const [phase, setPhase] = useState("idle"); // idle | playing | won | lost
  const [score, setScore] = useState(0);
  const gameRef = useRef(null);
  const rafRef = useRef(null);
  const touchXRef = useRef(null);

  // Set up canvas and return dimensions
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return { ctx, W: rect.width, H: rect.height };
  }, []);

  const initGame = useCallback((W, H) => {
    const bricks = buildBricks(W);
    const paddleX = W / 2 - PADDLE_W / 2;
    return {
      ball: { x: W / 2, y: H - PADDLE_BOTTOM - PADDLE_H - BALL_R - 2, dx: BALL_SPEED * 0.7, dy: -BALL_SPEED },
      paddle: { x: paddleX },
      bricks,
      W,
      H,
      alive: bricks.length,
    };
  }, []);

  // Draw a static frame (used for idle state)
  const drawStatic = useCallback((ctx, g) => {
    const { ball, paddle, bricks, W, H } = g;
    const paddleY = H - PADDLE_BOTTOM - PADDLE_H;
    ctx.clearRect(0, 0, W, H);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
    }

    ctx.fillStyle = "#FDF2E8";
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddleY, PADDLE_W, PADDLE_H, 6);
    ctx.fill();

    ctx.fillStyle = "#FDF2E8";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(12,26,53,0.15)";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 3, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // Draw the idle board on mount and after won/lost
  useEffect(() => {
    if (phase !== "idle") return;
    const setup = setupCanvas();
    if (!setup) return;
    const { ctx, W, H } = setup;
    const game = initGame(W, H);
    gameRef.current = game;
    drawStatic(ctx, game);
  }, [phase, setupCanvas, initGame, drawStatic]);

  const start = useCallback(() => {
    const setup = setupCanvas();
    if (!setup) return;
    const { ctx, W, H } = setup;

    const game = initGame(W, H);
    gameRef.current = game;
    setPhase("playing");
    setScore(0);
    getAudioCtx(); // init on gesture

    const loop = () => {
      const g = gameRef.current;
      if (!g) return;
      const { ball, paddle, bricks } = g;

      // ── Move ball ──
      ball.x += ball.dx;
      ball.y += ball.dy;

      // Wall collisions
      if (ball.x - BALL_R <= 0) { ball.x = BALL_R; ball.dx = Math.abs(ball.dx); }
      if (ball.x + BALL_R >= W) { ball.x = W - BALL_R; ball.dx = -Math.abs(ball.dx); }
      if (ball.y - BALL_R <= 0) { ball.y = BALL_R; ball.dy = Math.abs(ball.dy); }

      // Paddle collision
      const paddleY = H - PADDLE_BOTTOM - PADDLE_H;
      if (
        ball.dy > 0 &&
        ball.y + BALL_R >= paddleY &&
        ball.y + BALL_R <= paddleY + PADDLE_H + 4 &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + PADDLE_W
      ) {
        ball.dy = -Math.abs(ball.dy);
        // Angle based on where ball hits paddle
        const hit = (ball.x - paddle.x) / PADDLE_W; // 0..1
        ball.dx = BALL_SPEED * (hit - 0.5) * 2.2;
        ball.y = paddleY - BALL_R;
        try { playTick(getAudioCtx(), 440, 0.04); } catch {}
        haptics.tap();
      }

      // Ball lost
      if (ball.y - BALL_R > H) {
        cancelAnimationFrame(rafRef.current);
        setPhase("lost");
        return;
      }

      // Brick collisions
      let hitCount = 0;
      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + BALL_R > b.x &&
          ball.x - BALL_R < b.x + b.w &&
          ball.y + BALL_R > b.y &&
          ball.y - BALL_R < b.y + b.h
        ) {
          b.hp--;
          hitCount++;
          if (b.hp <= 0) {
            b.alive = false;
            g.alive--;
          } else {
            b.color = brickColor(b.row, b.col, b.hp);
          }

          // Bounce direction
          const overlapL = (ball.x + BALL_R) - b.x;
          const overlapR = (b.x + b.w) - (ball.x - BALL_R);
          const overlapT = (ball.y + BALL_R) - b.y;
          const overlapB = (b.y + b.h) - (ball.y - BALL_R);
          const minX = Math.min(overlapL, overlapR);
          const minY = Math.min(overlapT, overlapB);
          if (minX < minY) ball.dx = -ball.dx;
          else ball.dy = -ball.dy;

          try { playTick(getAudioCtx(), 600 + hitCount * 80, 0.05); } catch {}
          haptics.tap();
          break; // one collision per frame
        }
      }
      setScore(bricks.length - g.alive);

      // Win check
      if (g.alive <= 0) {
        cancelAnimationFrame(rafRef.current);
        setPhase("won");
        try { playWin(getAudioCtx()); } catch {}
        haptics.success();
        return;
      }

      // ── Draw ──
      ctx.clearRect(0, 0, W, H);

      // Bricks
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 4);
        ctx.fill();
      }

      // Paddle
      ctx.fillStyle = "#FDF2E8";
      ctx.beginPath();
      ctx.roundRect(paddle.x, paddleY, PADDLE_W, PADDLE_H, 6);
      ctx.fill();

      // Ball
      ctx.fillStyle = "#FDF2E8";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      // Ball glow
      ctx.fillStyle = "rgba(12,26,53,0.15)";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R + 3, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [initGame, haptics]);

  // Touch/mouse handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getX = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return clientX - rect.left;
    };

    const onMove = (e) => {
      if (!gameRef.current || phase !== "playing") return;
      e.preventDefault();
      const x = getX(e);
      const W = canvas.getBoundingClientRect().width;
      gameRef.current.paddle.x = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
    };

    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("mousemove", onMove);
    return () => {
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const total = COLS * ROWS;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg, #F2B899, #D898AC)" }} />
        <div style={{ fontSize: 11, color: "rgba(253,242,232,0.5)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Brick Breaker
        </div>
        {phase === "playing" && (
          <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(253,242,232,0.5)", fontWeight: 600 }}>
            {score}/{total}
          </div>
        )}
      </div>

      <div style={{
        borderRadius: 20,
        border: "1.5px solid #FDF2E8",
        boxShadow: "0 4px 16px rgba(0,20,60,0.1), 0 1px 3px rgba(8,20,50,0.04)",
        overflow: "hidden",
        position: "relative",
        backgroundImage: "url(/brickbreaker-bg.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: 260,
            display: "block",
            touchAction: "none",
            position: "relative",
            zIndex: 1,
          }}
        />

        {/* Idle overlay — board visible behind a light frosted layer */}
        {phase === "idle" && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 2,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <div
              className="tappable"
              onClick={start}
              style={{
                padding: "10px 28px", borderRadius: 14, cursor: "pointer",
                background: "#FDF2E8",
                border: "1.5px solid #FDF2E8",
                fontSize: 14, fontWeight: 600, color: "#0C1A35",
              }}
            >
              Play
            </div>
          </div>
        )}

        {/* Won / Lost overlays */}
        {(phase === "won" || phase === "lost") && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 2,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(180,226,238,0.6)",
            backdropFilter: "blur(4px)",
            gap: 8,
          }}>
            {phase === "won" && (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#FDF2E8", fontFamily: "'Fraunces', serif" }}>Hubbahdghtht!</div>
                <div style={{ fontSize: 12, color: "rgba(12,26,53,0.5)" }}>You are going to CONQUER the day!</div>
              </>
            )}
            {phase === "lost" && (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#FDF2E8", fontFamily: "'Fraunces', serif" }}>{score}/{total}</div>
                <div style={{ fontSize: 12, color: "rgba(12,26,53,0.5)" }}>So close!</div>
              </>
            )}
            <div
              className="tappable"
              onClick={() => setPhase("idle")}
              style={{
                padding: "10px 28px", borderRadius: 14, cursor: "pointer",
                background: "#FDF2E8",
                border: "1.5px solid #FDF2E8",
                fontSize: 14, fontWeight: 600, color: "#0C1A35",
                marginTop: 6,
              }}
            >
              Again
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
