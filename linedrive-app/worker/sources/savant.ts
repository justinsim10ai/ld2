import { fetchText, parseCsv } from "./http";

const SEASON_YEAR = new Date().getUTCFullYear();
const SAVANT_TIMEOUT_MS = 25000;

export interface SavantBatterRow {
  playerId: number;
  fullName: string;
  pa: number;
  xBa: number | null;
  xSlg: number | null;
  xwOba: number | null;
}

export interface SavantPitcherRow {
  playerId: number;
  fullName: string;
  pa: number;
  xBaAgainst: number | null;
  xSlgAgainst: number | null;
  xwObaAgainst: number | null;
}

export interface SavantBattedBallRow {
  playerId: number;
  fullName: string;
  avgEv: number | null;
  maxEv: number | null;
  barrels: number | null;
  brlPercent: number | null;
  ev95Percent: number | null;
}

export async function fetchSavantBatterExpected(): Promise<Map<number, SavantBatterRow>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${SEASON_YEAR}&season_type=R&csv=true`;
  return loadExpected(url, "batter-expected");
}

export async function fetchSavantPitcherExpected(): Promise<Map<number, SavantPitcherRow>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${SEASON_YEAR}&season_type=R&csv=true`;
  return loadExpected(url, "pitcher-expected") as Promise<Map<number, SavantPitcherRow>>;
}

async function loadExpected(url: string, label: string) {
  const out = new Map<number, SavantBatterRow & SavantPitcherRow>();
  try {
    const t0 = Date.now();
    const bustUrl = url + `&_=${Date.now()}`;
    const text = await fetchText(bustUrl, {
      timeoutMs: SAVANT_TIMEOUT_MS,
      retries: 1,
      headers: { Accept: "text/csv,text/plain,*/*", Referer: "https://baseballsavant.mlb.com/" },
    });
    const t1 = Date.now();
    const rows = parseCsv(text);
    const t2 = Date.now();
    let kept = 0;
    for (const r of rows) {
      const id = parseInt(r["player_id"], 10);
      if (!Number.isFinite(id)) continue;
      out.set(id, {
        playerId: id,
        fullName: r["last_name, first_name"] ?? r["last_name first_name"] ?? "",
        pa: parseInt(r["pa"] ?? "0", 10) || 0,
        xBa: numOrNull(r["est_ba"]),
        xSlg: numOrNull(r["est_slg"]),
        xwOba: numOrNull(r["est_woba"]),
        xBaAgainst: numOrNull(r["est_ba"]),
        xSlgAgainst: numOrNull(r["est_slg"]),
        xwObaAgainst: numOrNull(r["est_woba"]),
      });
      kept++;
    }
    console.log(`[savant:${label}] ${text.length}B fetched in ${t1 - t0}ms, parsed ${rows.length} rows in ${t2 - t1}ms, kept ${kept}`);
    if (text.length < 1000) console.log(`[savant:${label}] BODY: ${text.slice(0, 800).replace(/\s+/g, " ")}`);
  } catch (err) {
    console.error(`[savant:${label}] FAILED:`, String(err));
  }
  return out;
}

export async function fetchSavantBattedBall(): Promise<Map<number, SavantBattedBallRow>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${SEASON_YEAR}&season_type=R&csv=true&min_pa=q`;
  const out = new Map<number, SavantBattedBallRow>();
  try {
    const t0 = Date.now();
    const bustUrl = url + `&_=${Date.now()}`;
    const text = await fetchText(bustUrl, {
      timeoutMs: SAVANT_TIMEOUT_MS,
      retries: 1,
      headers: { Accept: "text/csv,text/plain,*/*", Referer: "https://baseballsavant.mlb.com/" },
    });
    const t1 = Date.now();
    const rows = parseCsv(text);
    const t2 = Date.now();
    let kept = 0;
    for (const r of rows) {
      const id = parseInt(r["player_id"], 10);
      if (!Number.isFinite(id)) continue;
      out.set(id, {
        playerId: id,
        fullName: r["last_name, first_name"] ?? "",
        avgEv: numOrNull(r["avg_hit_speed"]),
        maxEv: numOrNull(r["max_hit_speed"]),
        barrels: numOrNull(r["barrels"]),
        brlPercent: numOrNull(r["brl_percent"]),
        ev95Percent: numOrNull(r["ev95percent"]),
      });
      kept++;
    }
    console.log(`[savant:batted-ball] ${text.length}B fetched in ${t1 - t0}ms, parsed ${rows.length} rows in ${t2 - t1}ms, kept ${kept}`);
  } catch (err) {
    console.error(`[savant:batted-ball] FAILED:`, String(err));
  }
  return out;
}

function numOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
