import { fetchJson } from "./http";
import type { Handedness } from "../types";

interface PeopleResponse {
  people: Array<{
    id: number;
    fullName: string;
    batSide?: { code: string };
    pitchHand?: { code: string };
    stats?: PeopleStatsBlock[];
  }>;
}

interface PeopleStatsBlock {
  type?: { displayName?: string };
  group?: { displayName?: string };
  splits: Array<{
    season?: string;
    stat: Record<string, string | number | undefined>;
  }>;
}

export interface PlayerProfile {
  playerId: number;
  fullName: string;
  bats: Handedness;
  throws: Handedness;

  // Hitting
  paSeason: number;
  hrSeason: number;
  baSeason: number | null;
  baLast30: number | null;
  hrLast30: number;
  // From seasonAdvanced
  iso: number | null;
  hrPerPa: number | null;
  kPerPa: number | null;
  bbPerPa: number | null;
  // From expectedStatistics
  xBa: number | null;
  xSlg: number | null;
  xwOba: number | null;

  // Pitching
  ipSeason: number;
  k9Season: number | null;
  hr9Season: number | null;
  k9Last30: number | null;
  // Pitcher expected stats against
  xBaAgainst: number | null;
  xSlgAgainst: number | null;

  // Statcast (Baseball Savant), merged in after the profile fetch
  barrelRate?: number | null;  // batter barrel_batted_rate
  hardHitPct?: number | null;  // batter hard_hit_percent
  bestSpeed?: number | null;   // batter avg_best_speed
  whiffPct?: number | null;    // pitcher whiff_percent
  kPctSavant?: number | null;  // pitcher k_percent
}

const SEASON_YEAR = new Date().getUTCFullYear();

export async function fetchPlayerProfiles(playerIds: number[]): Promise<Map<number, PlayerProfile>> {
  const out = new Map<number, PlayerProfile>();
  if (playerIds.length === 0) return out;
  const idsParam = playerIds.join(",");
  const url =
    `https://statsapi.mlb.com/api/v1/people?personIds=${idsParam}` +
    `&hydrate=stats(group=[hitting,pitching],type=[season,seasonAdvanced,expectedStatistics,lastXGames],gameType=R,sportId=1,limit=30)`;
  const data = await fetchJson<PeopleResponse>(url, { timeoutMs: 12000 });
  for (const p of data.people ?? []) {
    out.set(p.id, profileFrom(p));
  }
  return out;
}

function profileFrom(p: PeopleResponse["people"][number]): PlayerProfile {
  const profile: PlayerProfile = {
    playerId: p.id,
    fullName: p.fullName,
    bats: handFrom(p.batSide?.code),
    throws: handFrom(p.pitchHand?.code),
    paSeason: 0,
    hrSeason: 0,
    baSeason: null,
    baLast30: null,
    hrLast30: 0,
    iso: null,
    hrPerPa: null,
    kPerPa: null,
    bbPerPa: null,
    xBa: null,
    xSlg: null,
    xwOba: null,
    ipSeason: 0,
    k9Season: null,
    hr9Season: null,
    k9Last30: null,
    xBaAgainst: null,
    xSlgAgainst: null,
  };
  for (const block of p.stats ?? []) {
    const typeName = block.type?.displayName ?? "";
    const groupName = block.group?.displayName ?? "";
    for (const split of block.splits ?? []) {
      const s = split.stat;
      if (groupName === "hitting") {
        if (typeName === "season") {
          profile.paSeason = num(s.plateAppearances) ?? 0;
          profile.hrSeason = num(s.homeRuns) ?? 0;
          profile.baSeason = num(s.avg);
        } else if (typeName === "lastXGames") {
          profile.baLast30 = num(s.avg);
          profile.hrLast30 = num(s.homeRuns) ?? 0;
        } else if (typeName === "seasonAdvanced") {
          profile.iso = num(s.iso);
          profile.hrPerPa = num(s.homeRunsPerPlateAppearance);
          profile.kPerPa = num(s.strikeoutsPerPlateAppearance);
          profile.bbPerPa = num(s.walksPerPlateAppearance);
        } else if (typeName === "expectedStatistics") {
          profile.xBa = num(s.avg);
          profile.xSlg = num(s.slg);
          profile.xwOba = num(s.woba);
        }
      } else if (groupName === "pitching") {
        if (typeName === "season") {
          profile.ipSeason = num(s.inningsPitched) ?? 0;
          profile.k9Season = num(s.strikeoutsPer9Inn);
          profile.hr9Season = num(s.homeRunsPer9);
        } else if (typeName === "lastXGames") {
          profile.k9Last30 = num(s.strikeoutsPer9Inn);
        } else if (typeName === "expectedStatistics") {
          profile.xBaAgainst = num(s.avg);
          profile.xSlgAgainst = num(s.slg);
        }
      }
    }
  }
  return profile;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "" || v === ".---") return null;
  let str = typeof v === "string" ? v : String(v);
  // MLB API returns ratios like ".286" without leading zero
  if (str.startsWith(".") || str.startsWith("-.")) {
    str = str.replace(/^(-?)\./, "$10.");
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function handFrom(code: string | undefined): Handedness {
  if (code === "L") return "L";
  if (code === "S") return "S";
  return "R";
}

export interface TeamSeasonHitting {
  teamId: number;
  kPctSeason: number | null;
  paSeason: number;
}

interface TeamHittingResponse {
  stats: Array<{
    splits: Array<{
      team: { id: number };
      stat: Record<string, string | number | undefined>;
    }>;
  }>;
}

export async function fetchAllTeamHittingKRates(): Promise<Map<number, TeamSeasonHitting>> {
  const url =
    `https://statsapi.mlb.com/api/v1/teams/stats?group=hitting&season=${SEASON_YEAR}` +
    `&sportIds=1&stats=season`;
  const out = new Map<number, TeamSeasonHitting>();
  try {
    const data = await fetchJson<TeamHittingResponse>(url, { timeoutMs: 8000 });
    for (const block of data.stats ?? []) {
      for (const split of block.splits ?? []) {
        const pa = num(split.stat.plateAppearances) ?? 0;
        const k = num(split.stat.strikeOuts);
        out.set(split.team.id, {
          teamId: split.team.id,
          kPctSeason: pa > 0 && k !== null ? k / pa : null,
          paSeason: pa,
        });
      }
    }
  } catch {
    // best effort
  }
  return out;
}

export { SEASON_YEAR };

// Team bullpen (reliever-split) run rate per 9 innings — used to replace the
// flat league-average bullpen run rate in the game-total model. Returns R/9
// (falls back to ERA) keyed by teamId. Best-effort.
export async function fetchAllTeamBullpenRates(): Promise<Map<number, number>> {
  const url =
    `https://statsapi.mlb.com/api/v1/teams/stats?group=pitching&season=${SEASON_YEAR}` +
    `&sportIds=1&stats=statSplits&sitCodes=rp`;
  const out = new Map<number, number>();
  try {
    const data = await fetchJson<TeamHittingResponse>(url, { timeoutMs: 8000 });
    for (const block of data.stats ?? []) {
      for (const split of block.splits ?? []) {
        const r9 = num(split.stat.runsScoredPer9) ?? num(split.stat.era);
        if (r9 !== null) out.set(split.team.id, r9);
      }
    }
  } catch {
    // best effort
  }
  return out;
}

export interface VsPitcherLine {
  ab: number;
  h: number;
  hr: number;
  k: number;
  bb: number;
}

interface VsResponse {
  people: Array<{
    id: number;
    stats?: Array<{
      splits: Array<{ stat: Record<string, string | number | undefined> }>;
    }>;
  }>;
}

/**
 * Fetch all-time vs-pitcher stats for many batters facing a single pitcher.
 * Uses MLB Stats API's vsPlayerTotal stat group. One subrequest per pitcher.
 * Returns a map: batterId → VsPitcherLine (only when career PA > 0).
 */
export async function fetchVsPitcher(
  batterIds: number[],
  pitcherId: number,
): Promise<Map<number, VsPitcherLine>> {
  const out = new Map<number, VsPitcherLine>();
  if (batterIds.length === 0) return out;
  const ids = batterIds.join(",");
  const url =
    `https://statsapi.mlb.com/api/v1/people?personIds=${ids}` +
    `&hydrate=stats(group=hitting,type=vsPlayerTotal,opposingPlayerId=${pitcherId})`;
  try {
    const data = await fetchJson<VsResponse>(url, { timeoutMs: 10000, retries: 1 });
    for (const p of data.people ?? []) {
      const splits = p.stats?.[0]?.splits ?? [];
      const s = splits[0]?.stat;
      if (!s) continue;
      const ab = num(s.atBats) ?? 0;
      if (ab === 0) continue;
      out.set(p.id, {
        ab,
        h: num(s.hits) ?? 0,
        hr: num(s.homeRuns) ?? 0,
        k: num(s.strikeOuts) ?? 0,
        bb: num(s.baseOnBalls) ?? 0,
      });
    }
  } catch (err) {
    console.warn(`[vsPitcher ${pitcherId}] failed:`, String(err));
  }
  return out;
}
