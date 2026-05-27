import type {
  BatterContext,
  PitcherContext,
  Pick,
  Category,
} from "./types";

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
    xBa: 0.30,
    ba30d: 0.20,
    pitcherXBaAgainst: 0.20,
    lineupSlot: 0.12,
    handedness: 0.10,
    park: 0.08,
  },
  tb: {
    xSlg: 0.30,
    iso: 0.20,
    pitcherXSlgAgainst: 0.20,
    lineupSlot: 0.10,
    park: 0.10,
    handedness: 0.10,
  },
  rbi: {
    xSlg: 0.30,
    iso: 0.20,
    lineupRbiBonus: 0.20,
    pitcherXBaAgainst: 0.15,
    park: 0.08,
    handedness: 0.07,
  },
};

const LEAGUE_BASELINES = {
  iso: 0.155,
  hrPerPa: 0.030,
  xSlg: 0.395,
  xBa: 0.245,
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
}

export function scoreHomeRun(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.hr;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;

  const pitcherHr9 = p?.hr9Season ?? LEAGUE_BASELINES.pitcherHr9;
  const pitcherHr9Z = (pitcherHr9 - LEAGUE_BASELINES.pitcherHr9) / 0.5;

  const parkZ = (park.hrFactor - 100) / 10;
  const wind = windCarry(ctx);
  const recentZ = Math.min(b.hrLast30, 12) / 4 - 0.5;
  const handBonus = handednessBonus(b.bats, p?.throws);

  const score =
    w.isoOrHrPerPa * isoZ +
    w.xSlg * xSlgZ +
    w.pitcherHr9 * pitcherHr9Z +
    w.parkFactor * parkZ +
    w.windCarry * wind.value +
    w.recent * recentZ +
    w.handedness * handBonus;

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
  return { ctx, score, signals };
}

function vsPitcherSignal(ctx: BatterContext): string | null {
  const v = ctx.vsPitcher;
  if (!v || v.ab < 3) return null;  // skip tiny samples
  const parts: string[] = [`${v.h}-for-${v.ab}`];
  if (v.hr > 0) parts.push(`${v.hr} HR`);
  if (v.k > 0) parts.push(`${v.k} K`);
  return `${parts.join(", ")} vs SP (career)`;
}

export function scoreHit(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.hit;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const xBa = b.xBaSeason ?? LEAGUE_BASELINES.xBa;
  const xBaZ = (xBa - LEAGUE_BASELINES.xBa) / 0.03;

  const ba30 = b.ba30d ?? LEAGUE_BASELINES.ba;
  const ba30Z = (ba30 - LEAGUE_BASELINES.ba) / 0.04;

  const pitcherXBa = p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst;
  const pitcherXBaZ = (pitcherXBa - LEAGUE_BASELINES.pitcherXBaAgainst) / 0.03;

  const slot = ctx.lineupSlot ?? 9;
  const slotBonus = slot <= 3 ? 1 : slot <= 6 ? 0.3 : -0.5;

  const handBonus = handednessBonus(b.bats, p?.throws);
  const parkZ = (park.hrFactor - 100) / 30;

  const score =
    w.xBa * xBaZ +
    w.ba30d * ba30Z +
    w.pitcherXBaAgainst * pitcherXBaZ +
    w.lineupSlot * slotBonus +
    w.handedness * handBonus +
    w.park * parkZ;

  const signals: string[] = [];
  if (xBa >= LEAGUE_BASELINES.xBa + 0.025) signals.push(`xBA ${pad3(xBa)} (top-tier contact)`);
  if (ba30 >= 0.300) signals.push(`Hitting ${pad3(ba30)} over last 30`);
  if (pitcherXBa >= 0.275) signals.push(`Pitcher xBA-against ${pad3(pitcherXBa)} (gives up hits)`);
  if (slot && slot <= 3) signals.push(`Top-3 lineup slot`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly ballpark`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals };
}

export function scoreStrikeouts(ctx: PitcherContext): Scored<PitcherContext> {
  const p = ctx.pitcher;
  const park = ctx.park;
  const k9 = p.k9Last30 ?? p.k9Season ?? LEAGUE_BASELINES.pitcherK9;
  const ip = p.expectedIp || 5.5;
  const oppRel = ctx.opponentTeamKPctRelLeague ?? 1.0;
  const parkMul = park.kFactor / 100;

  const expectedK = (k9 / 9) * ip * oppRel * parkMul;

  const signals: string[] = [];
  signals.push(`Expected IP: ${ip.toFixed(1)}`);
  signals.push(`K/9 (last 30): ${k9.toFixed(1)}`);
  if (oppRel > 1.05) signals.push(`Opponent K-prone (${((oppRel - 1) * 100).toFixed(0)}% above league)`);
  else if (oppRel < 0.95) signals.push(`Opponent contact-heavy lineup`);
  if (parkMul > 1.005) signals.push(`Slight K-friendly park`);
  if (parkMul < 0.995) signals.push(`Slight K-suppressing park`);

  return { ctx, score: expectedK, signals };
}

export function scoreTotalBases(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.tb;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;

  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;

  // We don't fetch pitcher xSLG-against; fall back to xBA-against as a proxy
  const pitcherSlgAgainst = (p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst) + 0.15;
  const pitcherSlgZ = (pitcherSlgAgainst - LEAGUE_BASELINES.pitcherXSlgAgainst) / 0.08;

  const slot = ctx.lineupSlot ?? 9;
  const slotBonus = slot <= 5 ? 1 : slot <= 7 ? 0.2 : -0.5;

  const parkZ = (park.hrFactor - 100) / 12;
  const handBonus = handednessBonus(b.bats, p?.throws);

  const score =
    w.xSlg * xSlgZ +
    w.iso * isoZ +
    w.pitcherXSlgAgainst * pitcherSlgZ +
    w.lineupSlot * slotBonus +
    w.park * parkZ +
    w.handedness * handBonus;

  const signals: string[] = [];
  if (xSlg >= 0.500) signals.push(`xSLG ${pad3(xSlg)} (elite slug)`);
  if (iso >= 0.220) signals.push(`Elite ISO ${pad3(iso)}`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly park`);
  if (slot && slot <= 3) signals.push(`Top-3 lineup slot`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals };
}

export function scoreTotalRbis(ctx: BatterContext): Scored<BatterContext> {
  const w = WEIGHTS.rbi;
  const b = ctx.batter;
  const p = ctx.opponentPitcher;
  const park = ctx.park;

  const xSlg = b.xSlgSeason ?? LEAGUE_BASELINES.xSlg;
  const xSlgZ = (xSlg - LEAGUE_BASELINES.xSlg) / 0.08;
  const iso = b.isoSeason ?? LEAGUE_BASELINES.iso;
  const isoZ = (iso - LEAGUE_BASELINES.iso) / 0.06;

  // Lineup-slot RBI multiplier (cleanup spots get more chances)
  const slot = ctx.lineupSlot ?? 9;
  const slotRbi = slot === 3 ? 1.4 : slot === 4 ? 1.5 : slot === 5 ? 1.2 : slot === 2 ? 0.5 : slot === 6 ? 0.6 : slot === 1 ? 0.2 : -0.3;

  const pitcherXBa = p?.xBaAgainstSeason ?? LEAGUE_BASELINES.pitcherXBaAgainst;
  const pitcherXBaZ = (pitcherXBa - LEAGUE_BASELINES.pitcherXBaAgainst) / 0.03;

  const parkZ = (park.hrFactor - 100) / 14;
  const handBonus = handednessBonus(b.bats, p?.throws);

  const score =
    w.xSlg * xSlgZ +
    w.iso * isoZ +
    w.lineupRbiBonus * slotRbi +
    w.pitcherXBaAgainst * pitcherXBaZ +
    w.park * parkZ +
    w.handedness * handBonus;

  const signals: string[] = [];
  if (slot >= 3 && slot <= 5) signals.push(`Cleanup-zone slot (#${slot})`);
  if (xSlg >= 0.480) signals.push(`xSLG ${pad3(xSlg)} (extra-base threat)`);
  if (iso >= 0.200) signals.push(`Above-avg power (ISO ${pad3(iso)})`);
  if (park.hrFactor >= 105) signals.push(`Hitter-friendly park`);
  if (handBonus > 0) signals.push(`Favorable platoon split`);
  const vs = vsPitcherSignal(ctx);
  if (vs) signals.push(vs);
  return { ctx, score, signals };
}

export function scoreTotalOuts(ctx: PitcherContext): Scored<PitcherContext> {
  const p = ctx.pitcher;
  const ip = p.expectedIp || 5.5;
  const expectedOuts = ip * 3;
  const signals: string[] = [];
  signals.push(`Expected IP: ${ip.toFixed(1)}`);
  signals.push(`Expected outs: ${expectedOuts.toFixed(1)}`);
  if (p.k9Last30 && p.k9Last30 >= 10) signals.push(`Power arm (K/9 ${p.k9Last30.toFixed(1)})`);
  if (p.ipSeason && p.ipSeason >= 80) signals.push(`Durable workload (${p.ipSeason} IP this season)`);
  return { ctx, score: expectedOuts, signals };
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
    marketPct: null,
    marketOddsAmerican: null,
    marketLine: null,
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
    marketPct: null,
    marketOddsAmerican: null,
    marketLine: null,
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
