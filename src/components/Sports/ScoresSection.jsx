import { useState, useEffect, useMemo } from "react";
import { WORKER_URL } from "../../config.js";
import { Icon } from "../../icons/Icon.jsx";

// ── SPORTS SCREEN ────────────────────────────────────────
const LEAGUE_ORDER = ["nba", "nhl", "mlb", "nfl"];
const LEAGUE_LABELS = { nba: "NBA", nhl: "NHL", mlb: "MLB", nfl: "NFL" };

function useSportsScores() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const cacheKey = 'sports-v1';
    const now = Date.now();
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && (now - cached.ts) < 10 * 60 * 1000) {
        setState({ loading: false, data: cached.data, error: null });
        return;
      }
    } catch {}

    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/sports`);
        if (res.status === 429) throw new Error("Rate limited — try again shortly");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        setState({ loading: false, data, error: null });
      } catch (err) {
        setState({ loading: false, data: null, error: err.message });
      }
    })();
  }, []);

  return state;
}

function getGameStatus(game) {
  if (game.status === "Match Finished" || game.status === "FT" ||
      (game.homeScore != null && game.awayScore != null && !game.status?.includes("progress"))) {
    return "final";
  }
  if (game.status && (game.status.includes("progress") || game.status.includes("Live") ||
      /^\d/.test(game.status))) {
    return "live";
  }
  return "scheduled";
}

function formatGameTime(game) {
  if (!game.time) return "";
  try {
    const [h, m] = game.time.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m));
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  } catch { return game.time; }
}

function GameCard({ game }) {
  const status = getGameStatus(game);
  const homeScore = game.homeScore != null ? parseInt(game.homeScore) : null;
  const awayScore = game.awayScore != null ? parseInt(game.awayScore) : null;
  const homeWins = status === "final" && homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWins = status === "final" && homeScore != null && awayScore != null && awayScore > homeScore;

  return (
    <div className="game-card">
      <div className="game-status-row">
        <div className={`game-status ${status}`}>
          {status === "live" ? (game.status || "Live") : status === "final" ? "Final" : formatGameTime(game) || "Scheduled"}
        </div>
        {game.date && <div className="game-time">{game.date}</div>}
      </div>
      <div className="game-teams">
        <div className="game-team-row">
          <div className="game-team-left">
            {game.awayBadge
              ? <img src={game.awayBadge} alt="" className="game-team-badge" />
              : <div className="game-team-badge-placeholder" />}
            <div className={`game-team-name ${awayWins ? "winner" : ""}`}>{game.awayTeam}</div>
          </div>
          {homeScore != null
            ? <div className={`game-score ${awayWins ? "winner" : ""}`}>{awayScore}</div>
            : <div className="game-score pending">—</div>}
        </div>
        <div className="game-team-row">
          <div className="game-team-left">
            {game.homeBadge
              ? <img src={game.homeBadge} alt="" className="game-team-badge" />
              : <div className="game-team-badge-placeholder" />}
            <div className={`game-team-name ${homeWins ? "winner" : ""}`}>{game.homeTeam}</div>
          </div>
          {homeScore != null
            ? <div className={`game-score ${homeWins ? "winner" : ""}`}>{homeScore}</div>
            : <div className="game-score pending">—</div>}
        </div>
      </div>
      {game.venue && <div className="game-venue">{game.venue}</div>}
    </div>
  );
}

function SportsSkeletons() {
  return Array.from({ length: 4 }, (_, i) => (
    <div className="sports-skeleton widget-shimmer" key={i}>
      <div className="sports-skeleton-row">
        <div className="skeleton" style={{ width: 50, height: 12 }} />
        <div className="skeleton" style={{ width: 70, height: 10 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="sports-skeleton-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 100, height: 13 }} />
          </div>
          <div className="skeleton" style={{ width: 24, height: 15 }} />
        </div>
        <div className="sports-skeleton-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 90, height: 13 }} />
          </div>
          <div className="skeleton" style={{ width: 24, height: 15 }} />
        </div>
      </div>
    </div>
  ));
}

function ScoresSection() {
  const { loading, data, error } = useSportsScores();

  const sortGames = (games) => {
    const order = { live: 0, scheduled: 1, final: 2 };
    return [...games].sort((a, b) => order[getGameStatus(a)] - order[getGameStatus(b)]);
  };

  // Flatten all leagues into a single sorted list, dedup by id.
  // Drop "final" games older than 7 days so stale results (e.g. an offseason
  // NFL Super Bowl) don't crowd out current sports.
  const allGames = (() => {
    if (!data?.leagues) return [];
    const RECENCY_DAYS = 7;
    const cutoff = Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000;
    const isFresh = (g) => {
      if (getGameStatus(g) !== "final") return true;
      if (!g.date) return false;
      const t = Date.parse(g.date);
      return Number.isFinite(t) && t >= cutoff;
    };
    const seen = new Set();
    const merged = [];
    for (const league of LEAGUE_ORDER) {
      const ld = data.leagues[league];
      if (!ld) continue;
      for (const g of [...(ld.live || []), ...(ld.upcoming || []), ...(ld.recent || [])]) {
        if (seen.has(g.id)) continue;
        if (!isFresh(g)) continue;
        seen.add(g.id);
        merged.push(g);
      }
    }
    return sortGames(merged);
  })();

  const header = (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "0 20px", marginBottom: 10,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: "#D898AC" }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(12,26,53,0.6)" }}>Scores</span>
    </div>
  );

  const rowStyle = {
    display: "flex", gap: 10, overflowX: "auto",
    padding: "4px 20px 8px 22px",
    scrollSnapType: "x mandatory",
    scrollPaddingLeft: 22,
    scrollbarWidth: "none",
  };

  if (loading) return (
    <div style={{ marginTop: 4, marginBottom: 14 }}>
      {header}
      <div className="scores-row" style={rowStyle}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="widget-shimmer" style={{ flex: "0 0 220px", height: 110, borderRadius: 14, background: "rgba(12,26,53,0.06)", scrollSnapAlign: "start" }} />
        ))}
      </div>
    </div>
  );

  if (error || !data || allGames.length === 0) return (
    <div style={{ marginTop: 4, marginBottom: 14 }}>
      {header}
      <div style={{ padding: "0 22px", fontSize: 12, color: "rgba(12,26,53,0.45)" }}>
        {error || "No games scheduled right now"}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 4, marginBottom: 14 }}>
      {header}
      <div className="scores-row" style={rowStyle}>
        {allGames.map(g => (
          <div key={g.id} style={{ flex: "0 0 240px", scrollSnapAlign: "start" }}>
            <GameCard game={g} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ScoresSection;
