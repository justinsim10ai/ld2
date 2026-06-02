import type {
  PlayerContext,
  NflGame,
  Pick,
  PickFactor,
  DataQuality,
  Category,
  Position,
} from "./types";
import { FACTORS } from "./factors";
import { impliedTotals, isDomeGame } from "./sources/nflGames";

// Per-game weighted-z models, one per category. Each weight table sums to 1.0
// so the factorBuilder can renormalize when an input is missing.
const WEIGHTS = {
  pass_yds: { ownYds: 0.40, volume: 0.15, oppDef: 0.20, gameEnv: 0.15, airYds: 0.10 },
  pass_td:  { ownTd: 0.40, gameEnv: 0.25, oppDef: 0.20, ownYds: 0.15 },
  rush_yds: { ownYds: 0.40, volume: 0.20, oppDef: 0.20, gameScript: 0.12, gameEnv: 0.08 },
  rec_yds:  { ownYds: 0.32, targetShare: 0.20, airYardsShare: 0.10, oppDef: 0.18, wopr: 0.10, gameEnv: 0.10 },
  rec:      { ownRec: 0.35, targets: 0.25, targetShare: 0.20, oppDef: 0.10, wopr: 0.10 },
  atd:      { ownTd: 0.40, gameEnv: 0.25, oppDef: 0.15, volume: 0.12, involvement: 0.08 },
};

// League per-game baselines (means) + z divisors (spreads), tuned to typical
// starter-level NFL values so a roughly-average starter scores ~0.
const B = {
  passYds: 218, passYdsSd: 55,
  passTd: 1.3, passTdSd: 0.6,
  att: 33, attSd: 6,
  passAir: 235, passAirSd: 60,
  rushYds: 48, rushYdsSd: 28,
  carries: 12, carriesSd: 6,
  recYds: 42, recYdsSd: 26,
  rec: 3.4, recSd: 1.9,
  targets: 5.0, targetsSd: 2.6,
  targetShare: 0.17, targetShareSd: 0.07,
  airYardsShare: 0.20, airYardsShareSd: 0.10,
  wopr: 0.40, woprSd: 0.20,
  atd: 0.40, atdSd: 0.30,
  impliedTotal: 22.5, impliedTotalSd: 4.5,
  defPassYds: 218, defPassYdsSd: 32,
  defRushYds: 110, defRushYdsSd: 22,
  defRec: 22, defRecSd: 4,
  defPassTd: 1.45, defPassTdSd: 0.45,
  defTotalTd: 2.6, defTotalTdSd: 0.6,
  gameTotalLeague: 44.5,
};

const POSITIONS_FOR: Record<Exclude<Category, "game">, Position[]> = {
  pass_yds: ["QB"],
  pass_td: ["QB"],
  rush_yds: ["RB", "FB", "QB"],
  rec_yds: ["WR", "TE", "RB"],
  rec: ["WR", "TE", "RB"],
  atd: ["RB", "WR", "TE"],
};
const MIN_GAMES = 4;

interface Scored {
  ctx: PlayerContext;
  score: number;
  signals: string[];
  factors: PickFactor[];
  dataQuality: DataQuality;
}

// Accumulates weighted-z factor contributions; renormalizes over present
// factors when some are missing, preserving sum(contributions) === score.
function factorBuilder() {
  const factors: PickFactor[] = [];
  const neutralFactorIds: string[] = [];
  let rawScore = 0;
  let neutralWeight = 0;

  function add(id: string, raw: number, zv: number, weight: number, display: string, opts?: { neutral?: boolean }): void {
    const contribution = weight * zv;
    rawScore += contribution;
    const f: PickFactor = { id, value: raw, contribution, display };
    if (opts?.neutral) { f.neutral = true; neutralFactorIds.push(id); neutralWeight += weight; }
    factors.push(f);
  }
  function finalize(complete: boolean): { score: number; factors: PickFactor[]; dataQuality: DataQuality } {
    const denom = 1 - neutralWeight;
    const k = denom > 0.001 ? 1 / denom : 1;
    if (k !== 1) for (const f of factors) f.contribution *= k;
    return { score: rawScore * k, factors, dataQuality: { complete, neutralFactorIds } };
  }
  return { add, finalize };
}

const z = (v: number, mean: number, sd: number) => (v - mean) / sd;
const yds = (v: number) => `${Math.round(v)} yd`;
const one = (v: number) => v.toFixed(1);
const two = (v: number) => v.toFixed(2);

function impliedFor(ctx: PlayerContext): { value: number; neutral: boolean } {
  const t = ctx.impliedTeamTotal;
  return t != null ? { value: t, neutral: false } : { value: B.impliedTotal, neutral: true };
}

export function scorePassYds(ctx: PlayerContext): Scored {
  const w = WEIGHTS.pass_yds; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("passYds", p.passYdsPg, z(p.passYdsPg, B.passYds, B.passYdsSd), w.ownYds, yds(p.passYdsPg));
  fb.add("passAtt", p.attPg, z(p.attPg, B.att, B.attSd), w.volume, one(p.attPg));
  const def = d?.passYdsAllowedPg ?? B.defPassYds;
  fb.add("oppPassDef", def, z(def, B.defPassYds, B.defPassYdsSd), w.oppDef, yds(def), { neutral: !d });
  const it = impliedFor(ctx);
  fb.add("impliedTotal", it.value, z(it.value, B.impliedTotal, B.impliedTotalSd), w.gameEnv, one(it.value), { neutral: it.neutral });
  fb.add("passAirYds", p.passAirYdsPg, z(p.passAirYdsPg, B.passAir, B.passAirSd), w.airYds, yds(p.passAirYdsPg));
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.passYdsPg >= 270) signals.push(`${Math.round(p.passYdsPg)} pass yds/game`);
  if (d && def >= 250) signals.push(`${ctx.opponent} allows ${Math.round(def)} pass yds/game`);
  if (it.value >= 27) signals.push(`High team total (${one(it.value)})`);
  return { ctx, score, signals, factors, dataQuality };
}

export function scorePassTd(ctx: PlayerContext): Scored {
  const w = WEIGHTS.pass_td; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("passTd", p.passTdPg, z(p.passTdPg, B.passTd, B.passTdSd), w.ownTd, two(p.passTdPg));
  const it = impliedFor(ctx);
  fb.add("impliedTotal", it.value, z(it.value, B.impliedTotal, B.impliedTotalSd), w.gameEnv, one(it.value), { neutral: it.neutral });
  const def = d?.passTdAllowedPg ?? B.defPassTd;
  fb.add("oppPassTdDef", def, z(def, B.defPassTd, B.defPassTdSd), w.oppDef, two(def), { neutral: !d });
  fb.add("passYds", p.passYdsPg, z(p.passYdsPg, B.passYds, B.passYdsSd), w.ownYds, yds(p.passYdsPg));
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.passTdPg >= 1.8) signals.push(`${two(p.passTdPg)} pass TD/game`);
  if (it.value >= 27) signals.push(`High team total (${one(it.value)})`);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreRushYds(ctx: PlayerContext): Scored {
  const w = WEIGHTS.rush_yds; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("rushYds", p.rushYdsPg, z(p.rushYdsPg, B.rushYds, B.rushYdsSd), w.ownYds, yds(p.rushYdsPg));
  fb.add("carries", p.carriesPg, z(p.carriesPg, B.carries, B.carriesSd), w.volume, one(p.carriesPg));
  const def = d?.rushYdsAllowedPg ?? B.defRushYds;
  fb.add("oppRushDef", def, z(def, B.defRushYds, B.defRushYdsSd), w.oppDef, yds(def), { neutral: !d });
  // Game script: favored teams run more late. spread_line is home-favored, so
  // the player's team is favored by spread when home, by -spread when away.
  const spread = ctx.game.spreadLine ?? 0;
  const favoredBy = ctx.isHome ? spread : -spread;
  fb.add("gameScript", favoredBy, z(favoredBy, 0, 6), w.gameScript, favoredBy >= 0 ? `${favoredBy.toFixed(0)}-pt fav` : `${(-favoredBy).toFixed(0)}-pt dog`);
  const it = impliedFor(ctx);
  fb.add("impliedTotal", it.value, z(it.value, B.impliedTotal, B.impliedTotalSd), w.gameEnv, one(it.value), { neutral: it.neutral });
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.carriesPg >= 16) signals.push(`Workhorse: ${one(p.carriesPg)} carries/game`);
  if (d && def >= 130) signals.push(`${ctx.opponent} soft run D (${Math.round(def)}/game)`);
  if (favoredBy >= 4) signals.push(`Favored by ${favoredBy.toFixed(0)} (run script)`);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreRecYds(ctx: PlayerContext): Scored {
  const w = WEIGHTS.rec_yds; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("recYds", p.recYdsPg, z(p.recYdsPg, B.recYds, B.recYdsSd), w.ownYds, yds(p.recYdsPg));
  fb.add("targetShare", p.targetShare, z(p.targetShare, B.targetShare, B.targetShareSd), w.targetShare, `${(p.targetShare * 100).toFixed(0)}%`);
  fb.add("airYardsShare", p.airYardsShare, z(p.airYardsShare, B.airYardsShare, B.airYardsShareSd), w.airYardsShare, `${(p.airYardsShare * 100).toFixed(0)}%`);
  const def = d?.passYdsAllowedPg ?? B.defPassYds;
  fb.add("oppPassDef", def, z(def, B.defPassYds, B.defPassYdsSd), w.oppDef, yds(def), { neutral: !d });
  fb.add("wopr", p.wopr, z(p.wopr, B.wopr, B.woprSd), w.wopr, two(p.wopr));
  const it = impliedFor(ctx);
  fb.add("impliedTotal", it.value, z(it.value, B.impliedTotal, B.impliedTotalSd), w.gameEnv, one(it.value), { neutral: it.neutral });
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.targetShare >= 0.25) signals.push(`Target hog (${(p.targetShare * 100).toFixed(0)}% share)`);
  if (p.recYdsPg >= 75) signals.push(`${Math.round(p.recYdsPg)} rec yds/game`);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreReceptions(ctx: PlayerContext): Scored {
  const w = WEIGHTS.rec; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("receptions", p.recPg, z(p.recPg, B.rec, B.recSd), w.ownRec, one(p.recPg));
  fb.add("targets", p.targetsPg, z(p.targetsPg, B.targets, B.targetsSd), w.targets, one(p.targetsPg));
  fb.add("targetShare", p.targetShare, z(p.targetShare, B.targetShare, B.targetShareSd), w.targetShare, `${(p.targetShare * 100).toFixed(0)}%`);
  const def = d?.recAllowedPg ?? B.defRec;
  fb.add("oppRecDef", def, z(def, B.defRec, B.defRecSd), w.oppDef, one(def), { neutral: !d });
  fb.add("wopr", p.wopr, z(p.wopr, B.wopr, B.woprSd), w.wopr, two(p.wopr));
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.targetsPg >= 8) signals.push(`${one(p.targetsPg)} targets/game`);
  if (p.recPg >= 6) signals.push(`${one(p.recPg)} catches/game`);
  return { ctx, score, signals, factors, dataQuality };
}

export function scoreAnytimeTd(ctx: PlayerContext): Scored {
  const w = WEIGHTS.atd; const p = ctx.player; const d = ctx.opponentDefense; const fb = factorBuilder();
  fb.add("anytimeTd", p.anytimeTdPg, z(p.anytimeTdPg, B.atd, B.atdSd), w.ownTd, two(p.anytimeTdPg));
  const it = impliedFor(ctx);
  fb.add("impliedTotal", it.value, z(it.value, B.impliedTotal, B.impliedTotalSd), w.gameEnv, one(it.value), { neutral: it.neutral });
  const totalTd = d ? d.passTdAllowedPg + d.rushTdAllowedPg : B.defTotalTd;
  fb.add("oppTdDef", totalTd, z(totalTd, B.defTotalTd, B.defTotalTdSd), w.oppDef, two(totalTd), { neutral: !d });
  const vol = p.carriesPg + p.targetsPg;
  fb.add("volume", vol, z(vol, B.carries + B.targets, 5), w.volume, one(vol));
  const involve = p.rushYdsPg + p.recYdsPg;
  fb.add("involvement", involve, z(involve, B.rushYds + B.recYds, 35), w.involvement, yds(involve));
  const { score, factors, dataQuality } = fb.finalize(!!d);
  const signals: string[] = [];
  if (p.anytimeTdPg >= 0.7) signals.push(`${two(p.anytimeTdPg)} TD/game`);
  if (it.value >= 27) signals.push(`High team total (${one(it.value)})`);
  return { ctx, score, signals, factors, dataQuality };
}

// ---- Game total ----
export interface GameScored { game: NflGame; expectedPoints: number; signals: string[]; }

export function scoreGameTotal(game: NflGame): GameScored {
  const imp = impliedTotals(game);
  let total = game.totalLine ?? (imp ? imp.home + imp.away : B.gameTotalLeague);
  let weatherAdj = 0;
  if (!isDomeGame(game)) {
    if (game.windMph != null && game.windMph >= 15) weatherAdj -= 1.5;
    if (game.tempF != null && game.tempF <= 25) weatherAdj -= 0.8;
  }
  total += weatherAdj;
  const signals: string[] = [];
  if (game.totalLine != null) signals.push(`Market total ${game.totalLine}`);
  if (game.spreadLine != null) signals.push(`${game.home} ${game.spreadLine >= 0 ? "−" : "+"}${Math.abs(game.spreadLine)}`);
  if (isDomeGame(game)) signals.push("Dome");
  else if (weatherAdj < 0) signals.push(`Weather −${(-weatherAdj).toFixed(1)} pts`);
  return { game, expectedPoints: total, signals };
}

// ---- Ranking + Pick mapping ----
const SCORERS: Record<Exclude<Category, "game">, (c: PlayerContext) => Scored> = {
  pass_yds: scorePassYds, pass_td: scorePassTd, rush_yds: scoreRushYds,
  rec_yds: scoreRecYds, rec: scoreReceptions, atd: scoreAnytimeTd,
};

export function rankPlayers(contexts: PlayerContext[], category: Exclude<Category, "game">, limit: number): Pick[] {
  const positions = POSITIONS_FOR[category];
  const eligible = contexts.filter((c) => positions.includes(c.player.position) && c.player.games >= MIN_GAMES);
  return eligible
    .map((c) => SCORERS[category](c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, i) => playerToPick(s, i + 1));
}

export function rankGames(games: NflGame[], limit: number): Pick[] {
  return games
    .map(scoreGameTotal)
    .sort((a, b) => b.expectedPoints - a.expectedPoints)
    .slice(0, limit)
    .map((s, i) => gameToPick(s, i + 1));
}

function playerToPick(s: Scored, rank: number): Pick {
  const ctx = s.ctx;
  return {
    rank,
    playerId: hashId(ctx.player.playerId),
    playerName: ctx.player.name,
    team: ctx.player.team,
    matchup: ctx.isHome ? `vs ${ctx.opponent}` : `@ ${ctx.opponent}`,
    score: round2(s.score),
    scoreLabel: formatScore(s.score),
    signals: s.signals.slice(0, 4),
    factors: s.factors,
    dataQuality: s.dataQuality,
    marketPct: null, marketOddsAmerican: null, marketLine: null, marketOverLine: null,
    lineupProjected: ctx.scheduleProjected,
    weatherSummary: weatherSummary(ctx.game),
  };
}

function gameToPick(s: GameScored, rank: number): Pick {
  const g = s.game;
  return {
    rank,
    playerId: hashId(g.gameId),
    playerName: `${g.away} @ ${g.home}`,
    team: "",
    matchup: g.stadium || "",
    score: round1(s.expectedPoints),
    scoreLabel: `${s.expectedPoints.toFixed(1)} pts`,
    signals: s.signals.slice(0, 4),
    marketPct: null, marketOddsAmerican: null, marketLine: null, marketOverLine: null,
    lineupProjected: false,
    weatherSummary: weatherSummary(g),
  };
}

function weatherSummary(g: NflGame): string | null {
  if (isDomeGame(g)) return "Dome";
  const bits: string[] = [];
  if (g.tempF != null) bits.push(`${Math.round(g.tempF)}°F`);
  if (g.windMph != null) bits.push(`wind ${Math.round(g.windMph)} mph`);
  return bits.length ? bits.join(", ") : null;
}

// nflverse player ids are strings ("00-0033077"); Pick.playerId is numeric.
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round1(n: number): number { return Math.round(n * 10) / 10; }
function formatScore(s: number): string { return s >= 0 ? `+${s.toFixed(2)}` : s.toFixed(2); }

export const CATEGORY_TITLES: Record<Category, string> = {
  pass_yds: "Passing Yards",
  pass_td: "Passing TDs",
  rush_yds: "Rushing Yards",
  rec_yds: "Receiving Yards",
  rec: "Receptions",
  atd: "Anytime TD",
  game: "Game Total",
};
