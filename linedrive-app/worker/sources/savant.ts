import { fetchText, parseCsv } from "./http";

// Baseball Savant (Statcast) bulk leaderboards. Each fetch is a single CSV
// covering all players above a low batted-ball/BF threshold (min=10 → ~450-500
// players), joined to our roster by MLB player_id. One request per leaderboard,
// best-effort: a failure leaves the map empty and scorers fall back to neutral.

const SEASON_YEAR = new Date().getUTCFullYear();
const BASE = "https://baseballsavant.mlb.com/leaderboard/custom";
const TIMEOUT_MS = 15000;
const SAVANT_HEADERS = {
  Accept: "text/csv,text/plain,*/*",
  Referer: "https://baseballsavant.mlb.com/",
};

export interface SavantBatter {
  barrelRate: number | null; // barrel_batted_rate, % of batted balls barreled
  hardHitPct: number | null; // hard_hit_percent, % of BBE with EV >= 95 mph
  bestSpeed: number | null;  // avg_best_speed, avg EV of hardest ~50% of BBE (mph)
}

export interface SavantPitcher {
  whiffPct: number | null;   // whiff_percent, whiffs per swing
  kPct: number | null;       // k_percent
}

function n(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}

export async function fetchSavantBatters(year: number = SEASON_YEAR): Promise<Map<number, SavantBatter>> {
  const out = new Map<number, SavantBatter>();
  const url =
    `${BASE}?year=${year}&type=batter&min=10` +
    `&selections=barrel_batted_rate,hard_hit_percent,avg_best_speed&csv=true`;
  try {
    const rows = parseCsv(await fetchText(url, { timeoutMs: TIMEOUT_MS, retries: 1, headers: SAVANT_HEADERS }));
    for (const r of rows) {
      const id = parseInt(r["player_id"], 10);
      if (!Number.isFinite(id)) continue;
      out.set(id, {
        barrelRate: n(r["barrel_batted_rate"]),
        hardHitPct: n(r["hard_hit_percent"]),
        bestSpeed: n(r["avg_best_speed"]),
      });
    }
    console.log(`[savant:batters] kept ${out.size} rows`);
  } catch (err) {
    console.error("[savant:batters] FAILED:", String(err));
  }
  return out;
}

export async function fetchSavantPitchers(year: number = SEASON_YEAR): Promise<Map<number, SavantPitcher>> {
  const out = new Map<number, SavantPitcher>();
  const url =
    `${BASE}?year=${year}&type=pitcher&min=10` +
    `&selections=whiff_percent,k_percent&csv=true`;
  try {
    const rows = parseCsv(await fetchText(url, { timeoutMs: TIMEOUT_MS, retries: 1, headers: SAVANT_HEADERS }));
    for (const r of rows) {
      const id = parseInt(r["player_id"], 10);
      if (!Number.isFinite(id)) continue;
      out.set(id, {
        whiffPct: n(r["whiff_percent"]),
        kPct: n(r["k_percent"]),
      });
    }
    console.log(`[savant:pitchers] kept ${out.size} rows`);
  } catch (err) {
    console.error("[savant:pitchers] FAILED:", String(err));
  }
  return out;
}
