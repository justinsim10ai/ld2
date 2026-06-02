import type {
  BatterContext,
  PitcherContext,
  Pick,
  PickFactor,
  DataQuality,
  Category,
} from "./types";
import { FACTORS } from "./factors";

const WEIGHTS = {
  hr: {
    isoOrHrPerPa: 0.30,
    xSlg: 0.15,
    pitcherHr9: 0.20,
    parkFactor: 0.18,
    windCarry: 0.08,
    recent: 0.05,
    handedness: 0.04,
  },
  hit: {
    xBa: 0.24,
    xwoba: 0.12,
    ba30d: 0.18,
    pitcherXBaAgainst: 0.18,
    lineupSlot: 0.12,
    handedness: 0.08,
    park: 0.08,
  },
  tb: {
    xSlg: 0.26,
    xwoba: 0.10,
    iso: 0.18,
    pitcherXSlgAgainst: 0.18,
    lineupSlot: 0.10,
    park: 0.10,
    handedness: 0.08,
  },
  rbi: {
    xSlg: 0.25,
    xwoba: 0.10,
    iso: 0.18,
    lineupRbiBonus: 0.20,
    pitcherXBaAgainst: 0.12,
    park: 0.08,
    handedness: 0.07,
  },
};

const LEAGUE_BASELINES = {
  iso: 0.155,
  hrPerPa: 0.030,
  xSlg: 0.395,
  xBa: 0.245,
  xwoba: 0.315,
  ba: 0.245,
  pitcherHr9: 1.2,
  pitcherK9: 8.7,
  pitcherXBaAgainst: 0.245,
  pitcherXSlgAgainst: 0.395,
  parkRunFactor: 100,
  gameTotalLeague: 8.6,
};

interface Scored<TCtx> {
  ctx: TCtx;
  score: number;
  signals: string[];
  factors: PickFactor[];
  dataQuality: DataQuality;
}

// Accumulates the per-factor contributions of a weighted-z scorer so they can
// be surfaced on each Pick. The batter weight tables all sum to 1.0, so when a
// factor's value is missing (e.g. opponent pitcher unknown → its z is 0), we
// drop it from the weighted average and renormalize the remaining weights.
// This keeps the score on the same scale instead of silently depressing picks
// that lack data, and preserves the invariant: sum(contributions) === score.
function factorBuilder() {
  const factors: PickFactor[] = [];
  const neutralFactorIds: string[] = [];
  let rawScore = 0;
  let neutralWeight = 0;

  function add(
    id: string,
    raw: number,
    z: number,
    weight: number,
    display: string,
    opts?: { neutral?: boolean; proxy?: boolean },
  ): void {
    const contribution = weight * z;
    rawScore += contribution;
    const f: PickFactor = { id, value: raw, contribution, display };
    if (opts?.neutral) {
      f.neutral = true;
      neutralFactorIds.push(id);
      neutralWeight += weight;
    }
    if (opts?.proxy) f.proxy = true;
    factors.push(f);
  }

  function finalize(pitcherConfirmed: boolean): {
    score: number;
    factors: PickFactor[];
    dataQuality: DataQuality;
  } {
    const denom = 1 - neutralWeight;
    const k = denom > 0.001 ? 1 / denom : 1;
    if (k !== 1) for (const f of factors) f.contribution *= k;
    return {
      score: rawScore * k,
      factors,
      dataQuality: { pitcherConfirmed, neutralFactorIds },
    };
  }

  return { add, finalize };
}

export function scoreHomeRun(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.hr;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;
  const fb = factorBuilder();
  const pitcherConfirmed = !!p;

  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;
  fb.add("iso", iso, isoZ, w.isoOrHrPerPa, FACTORS.iso.format(iso), { neutral: b.isoSeason == null });

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;
  fb.add("xSlg", xSlg, xSlgZ, w.xSlg, FACTORS.xSlg.format(xSlg), { neutral: b.xSlgSeason == null });

  const pitcherHr9 = p?.hr9Season ?? LEAGUE_BASELINES.pitcherHr9;
  const pitcherHr9Z = (pitcherHr9 - LEAGUE_BASELINES.pitcherHr9) / 0.5;
  fb.add("pitcherHr9", pitcherHr9, pitcherHr9Z, w.pitcherHr9, FACTORS.pitcherHr9.format(pitcherHr9), { neutral: !pitcherConfirmed });

  const parkZ = (park.hrFactor - 100) / 10;
  fb.add("parkHr", park.hrFactor, parkZ, w.parkFactor, FACTORS.parkHr.format(park.hrFactor));

  const wind = windCarry(ctx);
  fb.add("windCarry", wind.value, wind.value, w.windCarry, FACTORS.windCarry.format(wind.value));

  const recentZ = Math.min(b.hrLast30, 12) / 4 - 0.5;
  fb.add("recentHr", b.hrLast30, recentZ, w.recent, FACTORS.recentHr.format(b.hrLast30));

  const handBonus = handednessBonus(b.bats, p?.throws);
  fb.add("handedness", handBonus, handBonus, w.handedness, FACTORS.handedness.format(handBonus));

  const { score, factors, dataQuality } = fb.finalize(pitcherConfirmed);

  const signals: string[] = [];
  if (iso >= 0.220) signals.push(`Elite power (ISO ${pad3(iso)})`);
  else if (iso >= 0.180) signals.push(`Above-avg power (ISO ${pad3(iso)})`);
  if (xSlg >= 0.500) signals.push(`xSLG ${pad3(xSlg)} (top-tier)`);
  if (pitcherHr9 >= 1.5) signals.push(`Pitcher ${pitcherHr9.toFixed(2)} HR/9 (vulnerable)`);
  if (park.hrFactor >= 105) signals.push(`${park.name} HR factor ${park.hrFactor}`);
  if (park.hrFactor <= 94) signals.push(`Tough HR park (factor ${park.hrFactor})`);
  if (wind.label) signals.push(wind.label);
  if (b.hrLast30 >= 5) signals.push(`${b.hrLast30} HR in last 30 days`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals, factors, dataQuality };
}

function vsPitcherSignal(ctx: BatterContext): string | null {
  const v = ctx.vsPitcher;
  if (!v || v.ab < 6) return null;  // skip tiny samples — noisy below ~6 AB
  const parts: string[] = [`${v.h}-for-${v.ab}`];
  if (v.hr > 0) parts.push(`${v.hr} HR`);
  if (v.k > 0) parts.push(`${v.k} K`);
  return `${parts.join(", ")} vs SP (career, small sample)`;
}

export function scoreHit(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.hit;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const fb = factorBuilder();
  const pitcherConfirmed = !!p;

  const xBa = b.xBaSeason ?? LEAGUE_BASELINES.xBa;
  const xBaZ = (xBa - LEAGUE_BASELINES.xBa) / 0.03;
  fb.add("xBa", xBa, xBaZ, w.xBa, FACTORS.xBa.format(xBa), { neutral: b.xBaSeason == null });

  const xwoba = b.xwObaSeason ?? LEAGUE_BASELINES.xwoba;
  const xwobaZ = (xwoba - LEAGUE_BASELINES.xwoba) / 0.03;
  fb.add("xwoba", xwoba, xwobaZ, w.xwoba, FACTORS.xwoba.format(xwoba), { neutral: b.xwObaSeason == null });

  const ba30 = b.ba30d ?? LEAGUE_BASELINES.ba;
  const ba30Z = (ba30 - LEAGUE_BASELINES.ba) / 0.04;
  fb.add("ba30d", ba30, ba30Z, w.ba30d, FACTORS.ba30d.format(ba30), { neutral: b.ba30d == null });

  const pitcherXBa = p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst;
  const pitcherXBaZ = (pitcherXBa - LEAGUE_BASELINES.pitcherXBaAgainst) / 0.03;
  fb.add("pitcherXBaAgainst", pitcherXBa, pitcherXBaZ, w.pitcherXBaAgainst, FACTORS.pitcherXBaAgainst.format(pitcherXBa), { neutral: !pitcherConfirmed });

  const slot = ctx.lineupSlot ?? 9;
  const slotBonus = slot <= 3 ? 1 : slot <= 6 ? 0.3 : -0.5;
  fb.add("lineupSlot", slot, slotBonus, w.lineupSlot, FACTORS.lineupSlot.format(slot));

  const handBonus = handednessBonus(b.bats, p?.throws);
  fb.add("handedness", handBonus, handBonus, w.handedness, FACTORS.handedness.format(handBonus));

  const parkZ = (park.hrFactor - 100) / 30;
  fb.add("parkHr", park.hrFactor, parkZ, w.park, FACTORS.parkHr.format(park.hrFactor));

  const { score, factors, dataQuality } = fb.finalize(pitcherConfirmed);

  const signals: string[] = [];
  if (xBa >= LEAGUE_BASELINES.xBa + 0.025) signals.push(`xBA ${pad3(xBa)} (top-tier contact)`);
  if (ba30 >= 0.300) signals.push(`Hitting ${pad3(ba30)} over last 30`);
  if (pitcherXBa >= 0.275) signals.push(`Pitcher xBA-against ${pad3(pitcherXBa)} (gives up hits)`);
  if (slot && slot <= 3) signals.push(`Top-3 lineup slot`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly ballpark`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreStrikeouts(ctx: PitcherContext): Scored<PitcherContext> {
  const p = ctx.pitcher;
  const park = ctx.park;
  const k9 = p.k9Last30 ?? p.k9Season ?? LEAGUE_BASELINES.pitcherK9;
  const ip = p.expectedIp || 5.5;
  const oppRel = ctx.opponentTeamKPctRelLeague ?? 1.0;
  const parkMul = park.kFactor / 100;

  const expectedK = (k9 / 9) * ip * oppRel * parkMul;

  // Expected strikeouts is a product, not a weighted z-sum, so factors are
  // display-only (contribution 0) — they explain the inputs, not an additive split.
  const factors: PickFactor[] = [
    { id: "kRate", value: k9, contribution: 0, display: FACTORS.kRate.format(k9), neutral: p.k9Last30 == null && p.k9Season == null },
    { id: "expectedIp", value: ip, contribution: 0, display: FACTORS.expectedIp.format(ip) },
    { id: "oppKRate", value: oppRel, contribution: 0, display: FACTORS.oppKRate.format(oppRel), neutral: ctx.opponentTeamKPctRelLeague == null },
    { id: "parkK", value: park.kFactor, contribution: 0, display: FACTORS.parkK.format(park.kFactor) },
  ];
  const dataQuality: DataQuality = { pitcherConfirmed: true, neutralFactorIds: factors.filter((f) => f.neutral).map((f) => f.id) };

  const signals: string[] = [];
  signals.push(`Expected IP: ${ip.toFixed(1)}`);
  signals.push(`K/9 (last 30): ${k9.toFixed(1)}`);
  if (oppRel > 1.05) signals.push(`Opponent K-prone (${((oppRel - 1) * 100).toFixed(0)}% above league)`);
  else if (oppRel < 0.95) signals.push(`Opponent contact-heavy lineup`);
  if (parkMul > 1.005) signals.push(`Slight K-friendly park`);
  if (parkMul < 0.995) signals.push(`Slight K-suppressing park`);

  return { ctx, score: expectedK, signals, factors, dataQuality };
}

export function scoreTotalBases(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.tb;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const fb = factorBuilder();
  const pitcherConfirmed = !!p;

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;
  fb.add("xSlg", xSlg, xSlgZ, w.xSlg, FACTORS.xSlg.format(xSlg), { neutral: b.xSlgSeason == null });

  const xwoba = b.xwObaSeason ?? LEAGUE_BASELINES.xwoba;
  const xwobaZ = (xwoba - LEAGUE_BASELINES.xwoba) / 0.03;
  fb.add("xwoba", xwoba, xwobaZ, w.xwoba, FACTORS.xwoba.format(xwoba), { neutral: b.xwObaSeason == null });

  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;
  fb.add("iso", iso, isoZ, w.iso, FACTORS.iso.format(iso), { neutral: b.isoSeason == null });

  // Real pitcher xSLG-against from MLB expectedStatistics. Fall back to an
  // xBA-against-derived proxy only when the real value is missing.
  const realSlgAgainst = p?.xSlgAgainstSeason ?? null;
  const isProxy = realSlgAgainst == null;
  const pitcherSlgAgainst = realSlgAgainst
    ?? (p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst) + 0.15;
  const pitcherSlgZ = (pitcherSlgAgainst - LEAGUE_BASELINES.pitcherXSlgAgainst) / 0.08;
  fb.add("pitcherXSlgAgainst", pitcherSlgAgainst, pitcherSlgZ, w.pitcherXSlgAgainst, FACTORS.pitcherXSlgAgainst.format(pitcherSlgAgainst), { neutral: !pitcherConfirmed, proxy: isProxy });

  const slot = ctx.lineupSlot ?? 9;
  const slotBonus = slot <= 5 ? 1 : slot <= 7 ? 0.2 : -0.5;
  fb.add("lineupSlot", slot, slotBonus, w.lineupSlot, FACTORS.lineupSlot.format(slot));

  const parkZ = (park.hrFactor - 100) / 12;
  fb.add("parkHr", park.hrFactor, parkZ, w.park, FACTORS.parkHr.format(park.hrFactor));

  const handBonus = handednessBonus(b.bats, p?.throws);
  fb.add("handedness", handBonus, handBonus, w.handedness, FACTORS.handedness.format(handBonus));

  const { score, factors, dataQuality } = fb.finalize(pitcherConfirmed);

  const signals: string[] = [];
  if (xSlg >= 0.500) signals.push(`xSLG ${pad3(xSlg)} (elite slug)`);
  if (iso >= 0.220) signals.push(`Elite ISO ${pad3(iso)}`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly park`);
  if (slot && slot <= 3) signals.push(`Top-3 lineup slot`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreTotalRbis(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.rbi;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const fb = factorBuilder();
  const pitcherConfirmed = !!p;

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;
  fb.add("xSlg", xSlg, xSlgZ, w.xSlg, FACTORS.xSlg.format(xSlg), { neutral: b.xSlgSeason == null });

  const xwoba = b.xwObaSeason ?? LEAGUE_BASELINES.xwoba;
  const xwobaZ = (xwoba - LEAGUE_BASELINES.xwoba) / 0.03;
  fb.add("xwoba", xwoba, xwobaZ, w.xwoba, FACTORS.xwoba.format(xwoba), { neutral: b.xwObaSeason == null });

  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;
  fb.add("iso", iso, isoZ, w.iso, FACTORS.iso.format(iso), { neutral: b.isoSeason == null });

  // Lineup-slot RBI multiplier (cleanup spots get more chances)
  const slot = ctx.lineupSlot ?? 9;
  const slotRbi = slot === 3 ? 1.4 : slot === 4 ? 1.5 : slot === 5 ? 1.2 : slot === 2 ? 0.5 : slot === 6 ? 0.6 : slot === 1 ? 0.2 : -0.3;
  fb.add("lineupRbi", slot, slotRbi, w.lineupRbiBonus, FACTORS.lineupRbi.format(slot));

  const pitcherXBa = p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst;
  const pitcherXBaZ = (pitcherXBa - LEAGUE_BASELINES.pitcherXBaAgainst) / 0.03;
  fb.add("pitcherXBaAgainst", pitcherXBa, pitcherXBaZ, w.pitcherXBaAgainst, FACTORS.pitcherXBaAgainst.format(pitcherXBa), { neutral: !pitcherConfirmed });

  const parkZ = (park.hrFactor - 100) / 14;
  fb.add("parkHr", park.hrFactor, parkZ, w.park, FACTORS.parkHr.format(park.hrFactor));

  const handBonus = handednessBonus(b.bats, p?.throws);
  fb.add("handedness", handBonus, handBonus, w.handedness, FACTORS.handedness.format(handBonus));

  const { score, factors, dataQuality } = fb.finalize(pitcherConfirmed);

  const signals: string[] = [];
  if (slot >= 3 && slot <= 5) signals.push(`Cleanup-zone slot (#${slot})`);
  if (xSlg >= 0.480) signals.push(`xSLG ${pad3(xSlg)} (extra-base threat)`);
  if (iso >= 0.200) signals.push(`Above-avg power (ISO ${pad3(iso)})`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly park`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreTotalOuts(ctx: PitcherContext): Scored<PitcherContext> {
  const p = ctx.pitcher;
  const ip = p.expectedIp || 5.5;
  const expectedOuts = ip * 3;
  const factors: PickFactor[] = [
    { id: "expectedIp", value: ip, contribution: 0, display: FACTORS.expectedIp.format(ip) },
  ];
  const dataQuality: DataQuality = { pitcherConfirmed: true, neutralFactorIds: [] };
  const signals: string[] = [];
  signals.push(`Expected IP: ${ip.toFixed(1)}`);
  signals.push(`Expected outs: ${expectedOuts.toFixed(1)}`);
  if (p.k9Last30 && p.k9Last30 >= 10) signals.push(`Power arm (K/9 ${p.k9Last30.toFixed(1)})`);
  if (p.ipSeason && p.ipSeason >= 80) signals.push(`Durable workload (${p.ipSeason} IP this season)`);
  return { ctx, score: expectedOuts, signals, factors, dataQuality };
}

export interface GameScoringContext {
  gamePk: number;
  awayAbbrev: string;
  homeAbbrev: string;
  awayName: string;
  homeName: string;
  venueName: string;
  gameDateIso: string;
  parkHrFactor: number;
  parkRunFactor: number;          // approximation = hrFactor (we don't have runs factor separately)
  isDome: boolean;
  awayPitcher: PitcherContext["pitcher"] | null;
  homePitcher: PitcherContext["pitcher"] | null;
  awayLineupKPct: number | null;
  homeLineupKPct: number | null;
  weather: PitcherContext["weather"];
}

export interface GameScored {
  ctx: GameScoringContext;
  expectedRuns: number;
  signals: string[];
}

export function scoreGameTotal(ctx: GameScoringContext): GameScored {
  // Both starting pitchers' K/9 vs league as a (rough) ERA proxy
  function pitcherRunRate(p: typeof ctx.awayPitcher): number {
    if (!p) return 4.5; // league avg expected runs against
    const hr9 = p.hr9Season ?? LEAGUE_BASELINES.pitcherHr9;
    const k9 = p.k9Last30 ?? p.k9Season ?? LEAGUE_BASELINES.pitcherK9;
    // Higher HR/9 → more runs; higher K/9 → fewer runs allowed; tuned to ~4.5 league avg
    const base = 4.5;
    const hrEffect = (hr9 - LEAGUE_BASELINES.pitcherHr9) * 0.7;
    const kEffect = (LEAGUE_BASELINES.pitcherK9 - k9) * 0.18;
    const ip = p.expectedIp || 5.5;
    // Scale to expected-IP relative to a 9-inning team game
    const starterShare = ip / 9;
    const bullpenShare = 1 - starterShare;
    return (base + hrEffect + kEffect) * starterShare + 4.5 * bullpenShare;
  }

  const awayRunsAgainst = pitcherRunRate(ctx.homePitcher); // away offense scored against home pitcher
  const homeRunsAgainst = pitcherRunRate(ctx.awayPitcher);
  let total = awayRunsAgainst + homeRunsAgainst;

  // Park adjustment
  total *= ctx.parkRunFactor / 100;

  // Weather: warm temps + outward wind add ~0.3 runs
  let weatherAdj = 0;
  if (!ctx.isDome && ctx.weather) {
    if (ctx.weather.temperatureF >= 80) weatherAdj += 0.3;
    else if (ctx.weather.temperatureF <= 55) weatherAdj -= 0.3;
    if (ctx.weather.windSpeedMph >= 12) weatherAdj += 0.2;
  }
  total += weatherAdj;

  const signals: string[] = [];
  if (ctx.homePitcher) signals.push(`${ctx.homePitcher.fullName}: ${(ctx.homePitcher.hr9Season ?? 0).toFixed(2)} HR/9, ${(ctx.homePitcher.k9Last30 ?? ctx.homePitcher.k9Season ?? 0).toFixed(1)} K/9`);
  if (ctx.awayPitcher) signals.push(`${ctx.awayPitcher.fullName}: ${(ctx.awayPitcher.hr9Season ?? 0).toFixed(2)} HR/9, ${(ctx.awayPitcher.k9Last30 ?? ctx.awayPitcher.k9Season ?? 0).toFixed(1)} K/9`);
  if (ctx.parkRunFactor >= 110) signals.push(`Run-friendly park (${ctx.parkRunFactor})`);
  if (ctx.parkRunFactor <= 92) signals.push(`Pitcher's park (${ctx.parkRunFactor})`);
  if (weatherAdj > 0.2) signals.push(`Hot/windy — runs +${weatherAdj.toFixed(1)}`);
  if (weatherAdj < -0.2) signals.push(`Cool — runs ${weatherAdj.toFixed(1)}`);

  return { ctx, expectedRuns: total, signals };
}

export function rankGames(
  contexts: GameScoringContext[],
  limit: number,
): Pick[] {
  return contexts
    .map(scoreGameTotal)
    .sort((a, b) => b.expectedRuns - a.expectedRuns)
    .slice(0, limit)
    .map((s, idx) => gameScoreToPick(s, idx + 1));
}

function gameScoreToPick(s: GameScored, rank: number): Pick {
  const ctx = s.ctx;
  return {
    rank,
    playerId: ctx.gamePk,
    // Abbreviations only — "ATH vs SEA" not "Athletics @ Seattle Mariners"
    playerName: `${ctx.awayAbbrev} vs ${ctx.homeAbbrev}`,
    team: "",
    matchup: ctx.venueName,
    score: round2(s.expectedRuns),
    scoreLabel: `${s.expectedRuns.toFixed(1)} R`,
    signals: s.signals.slice(0, 4),
    marketPct: null,
    marketOddsAmerican: null,
    marketLine: null,
    marketOverLine: null,
    lineupProjected: false,
    weatherSummary: ctx.weather
      ? `${ctx.weather.temperatureF}°F · wind ${ctx.weather.windSpeedMph} mph`
      : ctx.isDome ? "Dome" : null,
  };
}

export function rankBatters(
  contexts: BatterContext[],
  scorer: (c: BatterContext) => Scored<BatterContext>,
  limit: number,
): Pick[] {
  return contexts
    .map(scorer)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, idx) => batterToPick(s, idx + 1));
}

export function rankPitchers(
  contexts: PitcherContext[],
  scorer: (c: PitcherContext) => Scored<PitcherContext>,
  limit: number,
  unitSuffix: string = "K",
): Pick[] {
  return contexts
    .map(scorer)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, idx) => pitcherToPick(s, idx + 1, unitSuffix));
}

function batterToPick(s: Scored<BatterContext>, rank: number): Pick {
  const ctx = s.ctx;
  const opp = ctx.opponentPitcher;
  const matchup = opp
    ? `vs. ${opp.fullName} (${opp.team.abbreviation})`
    : `@ ${ctx.park.name}`;
  return {
    rank,
    playerId: ctx.batter.playerId,
    playerName: ctx.batter.fullName,
    team: ctx.batter.team.abbreviation,
    matchup,
    score: round2(s.score),
    scoreLabel: formatScoreLabel(s.score),
    signals: s.signals.slice(0, 4),
    factors: s.factors,
    dataQuality: s.dataQuality,
    marketPct: null,
    marketOddsAmerican: null,
    marketLine: null,
    marketOverLine: null,
    lineupProjected: ctx.lineupProjected,
    weatherSummary: weatherSummary(ctx),
  };
}

function pitcherToPick(s: Scored<PitcherContext>, rank: number, unit: string): Pick {
  const ctx = s.ctx;
  return {
    rank,
    playerId: ctx.pitcher.playerId,
    playerName: ctx.pitcher.fullName,
    team: ctx.pitcher.team.abbreviation,
    matchup: `at ${ctx.park.name}`,
    score: round1(s.score),
    scoreLabel: `${s.score.toFixed(1)} ${unit}`,
    signals: s.signals.slice(0, 4),
    factors: s.factors,
    dataQuality: s.dataQuality,
    marketPct: null,
    marketOddsAmerican: null,
    marketLine: null,
    marketOverLine: null,
    lineupProjected: false,
    weatherSummary: ctx.weather
      ? `${ctx.weather.temperatureF}°F, ${ctx.weather.shortForecast}`
      : null,
  };
}

function windCarry(ctx: BatterContext): { value: number; label: string | null } {
  if (ctx.park.isDome || !ctx.weather) return { value: 0, label: null };
  const w = ctx.weather;
  if (w.windSpeedMph < 4) return { value: 0, label: null };
  const downwind = (w.windDirectionDegrees + 180) % 360;
  const offset = Math.abs(((downwind - ctx.park.cfBearingDegrees) + 540) % 360 - 180);
  const carry = Math.cos((offset * Math.PI) / 180) * (w.windSpeedMph / 8);
  let label: string | null = null;
  if (carry > 0.8) label = `Wind ${w.windSpeedMph} mph blowing out to CF`;
  else if (carry < -0.8) label = `Wind ${w.windSpeedMph} mph blowing in`;
  else if (Math.abs(carry) > 0.3) label = `Crosswind ${w.windSpeedMph} mph`;
  return { value: carry, label };
}

function weatherSummary(ctx: BatterContext): string | null {
  const w = ctx.weather;
  if (!w) return null;
  if (ctx.park.isDome) return "Dome";
  return `${w.temperatureF}°F, wind ${w.windSpeedMph} mph`;
}

function handednessBonus(bats: string, throws: string | undefined): number {
  if (!throws || bats === "S") return 0;
  if (bats !== throws) return 0.5;
  return -0.3;
}

function formatScoreLabel(s: number): string {
  if (s >= 0) return `+${s.toFixed(2)}`;
  return s.toFixed(2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function pad3(n: number): string {
  return n.toFixed(3).replace(/^0/, "");
}

export const CATEGORY_TITLES: Record<Category, string> = {
  hr: "Home Run",
  hit: "Hits",
  k: "Strikeouts",
  tb: "Total Bases",
  rbi: "Total RBIs",
  outs: "Total Outs",
  game: "Game Total",
};
