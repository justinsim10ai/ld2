import { fetchJson, pLimit } from "./http";

export interface HitterGameResult {
  hadGame: boolean;
  finalized: boolean;  // game date row present in gameLog (implies Final)
  ab: number;
  h: number;
  hr: number;
  doubles: number;
  triples: number;
  tb: number;
  rbi: number;
}

export interface PitcherGameResult {
  hadGame: boolean;
  finalized: boolean;
  ipString: string;   // raw "5.2" form (5 IP + 2 outs)
  outs: number;       // 5.2 IP → 17 outs
  so: number;
  earnedRuns: number;
}

interface GameLogResponse {
  stats?: Array<{
    group?: { displayName?: string };
    splits?: Array<{
      date?: string;
      game?: { gamePk?: number; gameType?: string };
      stat?: Record<string, unknown>;
    }>;
  }>;
}

const STATS_BASE = "https://statsapi.mlb.com/api/v1";
const FETCH_CONCURRENCY = 6;

export async function fetchHitterResults(
  playerIds: number[],
  dateIso: string,
): Promise<Map<number, HitterGameResult>> {
  const out = new Map<number, HitterGameResult>();
  const unique = Array.from(new Set(playerIds));
  await pLimit(unique, FETCH_CONCURRENCY, async (pid) => {
    const stat = await fetchGameLogStat(pid, "hitting", dateIso);
    out.set(pid, stat ? hitterFromStat(stat) : emptyHitter());
  });
  return out;
}

export async function fetchPitcherResults(
  playerIds: number[],
  dateIso: string,
): Promise<Map<number, PitcherGameResult>> {
  const out = new Map<number, PitcherGameResult>();
  const unique = Array.from(new Set(playerIds));
  await pLimit(unique, FETCH_CONCURRENCY, async (pid) => {
    const stat = await fetchGameLogStat(pid, "pitching", dateIso);
    out.set(pid, stat ? pitcherFromStat(stat) : emptyPitcher());
  });
  return out;
}

async function fetchGameLogStat(
  playerId: number,
  group: "hitting" | "pitching",
  dateIso: string,
): Promise<Record<string, unknown> | null> {
  const season = dateIso.slice(0, 4);
  try {
    const url = `${STATS_BASE}/people/${playerId}/stats?stats=gameLog&group=${group}&season=${season}`;
    const data = await fetchJson<GameLogResponse>(url, { retries: 1, timeoutMs: 8000 });
    const splits = data.stats?.[0]?.splits ?? [];
    const row = splits.find((s) => s.date === dateIso);
    return row?.stat ?? null;
  } catch (err) {
    console.warn(`[mlbResult] ${group} ${playerId} ${dateIso} failed:`, String(err));
    return null;
  }
}

function hitterFromStat(stat: Record<string, unknown>): HitterGameResult {
  const n = (k: string) => parseIntSafe(stat[k]);
  return {
    hadGame: true,
    finalized: true,
    ab: n("atBats"),
    h: n("hits"),
    hr: n("homeRuns"),
    doubles: n("doubles"),
    triples: n("triples"),
    tb: n("totalBases"),
    rbi: n("rbi"),
  };
}

function pitcherFromStat(stat: Record<string, unknown>): PitcherGameResult {
  const n = (k: string) => parseIntSafe(stat[k]);
  const ipString = String(stat["inningsPitched"] ?? "0.0");
  return {
    hadGame: true,
    finalized: true,
    ipString,
    outs: ipToOuts(ipString),
    so: n("strikeOuts"),
    earnedRuns: n("earnedRuns"),
  };
}

function emptyHitter(): HitterGameResult {
  return { hadGame: false, finalized: false, ab: 0, h: 0, hr: 0, doubles: 0, triples: 0, tb: 0, rbi: 0 };
}
function emptyPitcher(): PitcherGameResult {
  return { hadGame: false, finalized: false, ipString: "0.0", outs: 0, so: 0, earnedRuns: 0 };
}

function parseIntSafe(v: unknown): number {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// MLB's inningsPitched format: "5.2" = 5 innings + 2 outs = 17 outs (NOT 5.667).
export function ipToOuts(ip: string): number {
  const m = ip.match(/^(\d+)(?:\.(\d))?$/);
  if (!m) return 0;
  const whole = parseInt(m[1], 10);
  const frac = m[2] ? parseInt(m[2], 10) : 0;
  return whole * 3 + (frac >= 0 && frac <= 2 ? frac : 0);
}
