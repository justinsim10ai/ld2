import type {
  BatterContext,
  BatterStats,
  Category,
  Env,
  Handedness,
  League,
  ParkInfo,
  PitcherContext,
  PitcherStats,
  TeamRef,
  WeatherSnapshot,
} from "./types";
import { fetchHitterResults, fetchPitcherResults } from "./sources/mlbResult";

// Full-slate candidate pool capture.
//
// The daily pipeline builds a BatterContext/PitcherContext for *every* player in
// every game, ranks them, and keeps only the top-15 per category. That discards
// the slate a pick was chosen from, so we can never ask "would a different
// algorithm have surfaced better players?" — the other candidates are gone.
//
// This module snapshots the *entire* candidate pool (compact, ~a few hundred
// rows/day) under `pool:<league>:<date>`, and at settlement attaches each
// candidate's actual outcome. With that, worker/rerank.ts can re-run any scorer
// over real historical slates and measure hit-rate / ROI / rank-tiers — a true
// before/after for algorithm changes. Capture is point-in-time: stats are frozen
// as they were when the slate ran, which the live MLB API cannot reproduce after
// the fact, so this only accrues data going forward.

const POOL_KEY_PREFIX = "pool:";
const POOL_TTL_SECONDS = 60 * 60 * 24 * 120; // 120 days

const BATTER_MARKET_CATEGORIES = ["hr", "hit", "tb", "rbi"] as const;
const PITCHER_MARKET_CATEGORIES = ["k", "outs"] as const;

/** A single market quote captured for one candidate × category. */
export interface PoolMarket {
  pct: number | null;     // implied probability (0..1)
  odds: number | null;    // American odds for the Yes/Over side
  line: number | null;    // over/under threshold (null for binary HR/Hit)
}

/** Actual game outcome, filled in at settlement. */
export interface PoolBatterOutcome {
  hadGame: boolean;
  hr: number;
  h: number;
  tb: number;
  rbi: number;
}

export interface PoolPitcherOutcome {
  hadGame: boolean;
  so: number;
  outs: number;
}

/** Compact snapshot of one batter candidate (all scorer inputs + market). */
export interface PoolBatter {
  id: number;
  name: string;
  team: string;       // abbreviation
  teamId: number;
  gamePk: number;
  bats: Handedness;
  slot: number | null;
  projected: boolean;
  // batter inputs (mirror BatterStats)
  pa: number;
  ba30: number | null;
  hrLast30: number;
  iso: number | null;
  hrPerPa: number | null;
  xBa: number | null;
  xSlg: number | null;
  xwoba: number | null;
  barrel: number | null;
  hardHit: number | null;
  // opponent pitcher snapshot (null when SP unconfirmed)
  opp: {
    id: number;
    name: string;
    team: string;
    teamId: number;
    throws: Handedness;
    ipSeason: number;
    k9Season: number | null;
    k9Last30: number | null;
    hr9: number | null;
    xBaAg: number | null;
    xSlgAg: number | null;
    whiff: number | null;
    expectedIp: number;
  } | null;
  // park + weather
  parkHr: number;
  parkK: number;
  cfBearing: number;
  dome: boolean;
  wind: { mph: number; dir: number; temp: number } | null;
  // market per category
  mkt: Partial<Record<(typeof BATTER_MARKET_CATEGORIES)[number], PoolMarket>>;
  out?: PoolBatterOutcome;
}

/** Compact snapshot of one pitcher candidate. */
export interface PoolPitcher {
  id: number;
  name: string;
  team: string;
  teamId: number;
  gamePk: number;
  throws: Handedness;
  ipSeason: number;
  k9Season: number | null;
  k9Last30: number | null;
  hr9: number | null;
  xBaAg: number | null;
  xSlgAg: number | null;
  whiff: number | null;
  expectedIp: number;
  oppTeamId: number;
  oppKRel: number | null;
  parkHr: number;
  parkK: number;
  dome: boolean;
  wind: { mph: number; dir: number; temp: number } | null;
  mkt: Partial<Record<(typeof PITCHER_MARKET_CATEGORIES)[number], PoolMarket>>;
  out?: PoolPitcherOutcome;
}

export interface CandidatePool {
  league: League;
  date: string;
  generatedAtIso: string;
  settledAtIso?: string;
  batters: PoolBatter[];
  pitchers: PoolPitcher[];
}

/** Structural type for the market lookup built in the pipeline. */
interface MarketLookupLike {
  getLine(
    playerId: number,
    category: Category,
  ): { impliedPct: number; americanOdds: number; line: number | null } | null;
}

function marketFor(
  market: MarketLookupLike,
  playerId: number,
  category: Category,
): PoolMarket | undefined {
  let line: ReturnType<MarketLookupLike["getLine"]> = null;
  try {
    line = market.getLine(playerId, category);
  } catch {
    line = null;
  }
  if (!line) return undefined;
  return { pct: line.impliedPct, odds: line.americanOdds, line: line.line };
}

export function serializePool(
  league: League,
  date: string,
  batterContexts: BatterContext[],
  pitcherContexts: PitcherContext[],
  market: MarketLookupLike,
): CandidatePool {
  const batters: PoolBatter[] = batterContexts.map((c) => {
    const b = c.batter;
    const p = c.opponentPitcher;
    const mkt: PoolBatter["mkt"] = {};
    for (const cat of BATTER_MARKET_CATEGORIES) {
      const m = marketFor(market, b.playerId, cat);
      if (m) mkt[cat] = m;
    }
    return {
      id: b.playerId,
      name: b.fullName,
      team: b.team.abbreviation,
      teamId: b.team.id,
      gamePk: gamePkOf(c),
      bats: b.bats,
      slot: c.lineupSlot,
      projected: c.lineupProjected,
      pa: b.paSeason,
      ba30: b.ba30d,
      hrLast30: b.hrLast30,
      iso: b.isoSeason,
      hrPerPa: b.hrPerPaSeason,
      xBa: b.xBaSeason,
      xSlg: b.xSlgSeason,
      xwoba: b.xwObaSeason,
      barrel: b.barrelRate,
      hardHit: b.hardHitPct,
      opp: p
        ? {
            id: p.playerId,
            name: p.fullName,
            team: p.team.abbreviation,
            teamId: p.team.id,
            throws: p.throws,
            ipSeason: p.ipSeason,
            k9Season: p.k9Season,
            k9Last30: p.k9Last30,
            hr9: p.hr9Season,
            xBaAg: p.xBaAgainstSeason,
            xSlgAg: p.xSlgAgainstSeason,
            whiff: p.whiffPct,
            expectedIp: p.expectedIp,
          }
        : null,
      parkHr: c.park.hrFactor,
      parkK: c.park.kFactor,
      cfBearing: c.park.cfBearingDegrees,
      dome: c.park.isDome,
      wind: c.weather
        ? { mph: c.weather.windSpeedMph, dir: c.weather.windDirectionDegrees, temp: c.weather.temperatureF }
        : null,
      mkt,
    };
  });

  const pitchers: PoolPitcher[] = pitcherContexts.map((c) => {
    const p = c.pitcher;
    const mkt: PoolPitcher["mkt"] = {};
    for (const cat of PITCHER_MARKET_CATEGORIES) {
      const m = marketFor(market, p.playerId, cat);
      if (m) mkt[cat] = m;
    }
    return {
      id: p.playerId,
      name: p.fullName,
      team: p.team.abbreviation,
      teamId: p.team.id,
      gamePk: pitcherGamePk(c),
      throws: p.throws,
      ipSeason: p.ipSeason,
      k9Season: p.k9Season,
      k9Last30: p.k9Last30,
      hr9: p.hr9Season,
      xBaAg: p.xBaAgainstSeason,
      xSlgAg: p.xSlgAgainstSeason,
      whiff: p.whiffPct,
      expectedIp: p.expectedIp,
      oppTeamId: c.opponentTeamId,
      oppKRel: c.opponentTeamKPctRelLeague,
      parkHr: c.park.hrFactor,
      parkK: c.park.kFactor,
      dome: c.park.isDome,
      wind: c.weather
        ? { mph: c.weather.windSpeedMph, dir: c.weather.windDirectionDegrees, temp: c.weather.temperatureF }
        : null,
      mkt,
    };
  });

  return {
    league,
    date,
    generatedAtIso: new Date().toISOString(),
    batters,
    pitchers,
  };
}

// BatterContext/PitcherContext don't carry gamePk, but the pipeline maps each
// player → gamePk separately. We accept a 0 fallback here and let the pipeline
// stamp real gamePks via stampGamePks() so settlement can fetch the right box.
function gamePkOf(_c: BatterContext): number {
  return 0;
}
function pitcherGamePk(_c: PitcherContext): number {
  return 0;
}

/**
 * The contexts don't hold gamePk, so the pipeline passes its player→gamePk map
 * to fill them in after serialization. (Outcome fetching is by player+date, so
 * gamePk is informational, but we keep it for debugging / future per-game joins.)
 */
export function stampGamePks(pool: CandidatePool, playerToGamePk: Map<number, number>): void {
  for (const b of pool.batters) b.gamePk = playerToGamePk.get(b.id) ?? 0;
  for (const p of pool.pitchers) p.gamePk = playerToGamePk.get(p.id) ?? 0;
}

export async function writePool(env: Env, pool: CandidatePool): Promise<void> {
  const key = `${POOL_KEY_PREFIX}${pool.league}:${pool.date}`;
  await env.LINEDRIVE_KV.put(key, JSON.stringify(pool), { expirationTtl: POOL_TTL_SECONDS });
}

export async function readPool(env: Env, league: League, date: string): Promise<CandidatePool | null> {
  const raw = await env.LINEDRIVE_KV.get(`${POOL_KEY_PREFIX}${league}:${date}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CandidatePool;
  } catch {
    return null;
  }
}

/**
 * Fetch every pool candidate's actual game outcome and write it back. Mirrors
 * settlement.ts but for the full slate, not just the top-15 picks. Idempotent.
 */
export async function settlePool(
  env: Env,
  league: League,
  date: string,
): Promise<{ batters: number; pitchers: number; settled: boolean }> {
  const pool = await readPool(env, league, date);
  if (!pool) return { batters: 0, pitchers: 0, settled: false };

  const hitterIds = pool.batters.map((b) => b.id);
  const pitcherIds = pool.pitchers.map((p) => p.id);
  const [hitters, pitchers] = await Promise.all([
    fetchHitterResults(hitterIds, date),
    fetchPitcherResults(pitcherIds, date),
  ]);

  let bCount = 0;
  for (const b of pool.batters) {
    const r = hitters.get(b.id);
    if (r && r.hadGame) {
      b.out = { hadGame: true, hr: r.hr, h: r.h, tb: r.tb, rbi: r.rbi };
      bCount++;
    } else {
      b.out = { hadGame: false, hr: 0, h: 0, tb: 0, rbi: 0 };
    }
  }
  let pCount = 0;
  for (const p of pool.pitchers) {
    const r = pitchers.get(p.id);
    if (r && r.hadGame) {
      p.out = { hadGame: true, so: r.so, outs: r.outs };
      pCount++;
    } else {
      p.out = { hadGame: false, so: 0, outs: 0 };
    }
  }

  pool.settledAtIso = new Date().toISOString();
  await writePool(env, pool);
  return { batters: bCount, pitchers: pCount, settled: true };
}

// ── Reconstruction: pool row → scorer-ready context ─────────────────────────
// Rebuilds the exact context shape the scorers consume. Fields the scorers never
// read (venue id/name/lat/lon, forecast text) are filled with harmless dummies.

function teamRef(abbr: string, id: number): TeamRef {
  return { id, name: abbr, abbreviation: abbr };
}

function park(b: { parkHr: number; parkK: number; cfBearing?: number; dome: boolean }): ParkInfo {
  return {
    venueId: 0,
    name: "",
    city: "",
    lat: 0,
    lon: 0,
    hrFactor: b.parkHr,
    kFactor: b.parkK,
    cfBearingDegrees: b.cfBearing ?? 0,
    isDome: b.dome,
  };
}

function weather(w: { mph: number; dir: number; temp: number } | null): WeatherSnapshot | null {
  if (!w) return null;
  return {
    windSpeedMph: w.mph,
    windDirectionDegrees: w.dir,
    temperatureF: w.temp,
    shortForecast: "",
    startTimeIso: "",
  };
}

export function reconstructBatterContext(b: PoolBatter): BatterContext {
  const batter: BatterStats = {
    playerId: b.id,
    fullName: b.name,
    team: teamRef(b.team, b.teamId),
    bats: b.bats,
    paSeason: b.pa,
    ba30d: b.ba30,
    hrLast30: b.hrLast30,
    isoSeason: b.iso,
    hrPerPaSeason: b.hrPerPa,
    xBaSeason: b.xBa,
    xSlgSeason: b.xSlg,
    xwObaSeason: b.xwoba,
    barrelRate: b.barrel,
    hardHitPct: b.hardHit,
  };
  const opponentPitcher: PitcherStats | null = b.opp
    ? {
        playerId: b.opp.id,
        fullName: b.opp.name,
        team: teamRef(b.opp.team, b.opp.teamId),
        throws: b.opp.throws,
        ipSeason: b.opp.ipSeason,
        k9Season: b.opp.k9Season,
        k9Last30: b.opp.k9Last30,
        hr9Season: b.opp.hr9,
        xBaAgainstSeason: b.opp.xBaAg,
        xSlgAgainstSeason: b.opp.xSlgAg,
        whiffPct: b.opp.whiff,
        expectedIp: b.opp.expectedIp,
      }
    : null;
  return {
    batter,
    opponentPitcher,
    park: park(b),
    weather: weather(b.wind),
    lineupSlot: b.slot,
    lineupProjected: b.projected,
    vsPitcher: null,
  };
}

export function reconstructPitcherContext(p: PoolPitcher): PitcherContext {
  const pitcher: PitcherStats = {
    playerId: p.id,
    fullName: p.name,
    team: teamRef(p.team, p.teamId),
    throws: p.throws,
    ipSeason: p.ipSeason,
    k9Season: p.k9Season,
    k9Last30: p.k9Last30,
    hr9Season: p.hr9,
    xBaAgainstSeason: p.xBaAg,
    xSlgAgainstSeason: p.xSlgAg,
    whiffPct: p.whiff,
    expectedIp: p.expectedIp,
  };
  return {
    pitcher,
    opponentTeamId: p.oppTeamId,
    opponentTeamKPctRelLeague: p.oppKRel,
    park: park(p),
    weather: weather(p.wind),
  };
}
