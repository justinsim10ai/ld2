import type { BatterContext, Env, League, PitcherContext } from "./types";
import type { CategoryStats } from "./backtest";
import { readArchiveIndex } from "./pipeline";
import { readPool, reconstructBatterContext, reconstructPitcherContext } from "./pool";
import type { CandidatePool, PoolBatter, PoolPitcher, PoolMarket } from "./pool";
import { payoutDollars, thresholdFor } from "./settlement";
import {
  scoreHomeRun,
  scoreHit,
  scoreTotalBases,
  scoreTotalRbis,
  scoreStrikeouts,
  scoreTotalOuts,
} from "./scoring";
import { pLimit } from "./sources/http";

// Re-rank harness: replay any scoring algorithm over the *settled* candidate
// pools (worker/pool.ts) and measure how it would have done — hit rate, ROI vs
// the OG market, and rank-tier lift (do the top-5 beat ranks 11-15?). This is
// the before/after that the live backtest can't give us, because the pool
// preserves the full slate each algorithm chose from, not just the old top-15.
//
// Algorithms are named so we can A/B: `current` is the live baseline; new
// approaches (e.g. a Log5 rewrite) register alongside and run over the identical
// frozen slates. Numbers accrue going forward as pools settle each night.

const BATTER_CATEGORIES = ["hr", "hit", "tb", "rbi"] as const;
const PITCHER_CATEGORIES = ["k", "outs"] as const;
type BatterCat = (typeof BATTER_CATEGORIES)[number];
type PitcherCat = (typeof PITCHER_CATEGORIES)[number];

export interface RerankAlgorithm {
  name: string;
  description: string;
  batter: Record<BatterCat, (c: BatterContext) => number>;
  pitcher: Record<PitcherCat, (c: PitcherContext) => number>;
}

/** The live algorithm, as a re-rankable wrapper around the existing scorers. */
const CURRENT: RerankAlgorithm = {
  name: "current",
  description: "Live weighted-z scorers (baseline)",
  batter: {
    hr: (c) => scoreHomeRun(c).score,
    hit: (c) => scoreHit(c).score,
    tb: (c) => scoreTotalBases(c).score,
    rbi: (c) => scoreTotalRbis(c).score,
  },
  pitcher: {
    k: (c) => scoreStrikeouts(c).score,
    outs: (c) => scoreTotalOuts(c).score,
  },
};

export const RERANK_ALGORITHMS: Record<string, RerankAlgorithm> = {
  current: CURRENT,
};

export interface RerankReport {
  algorithm: string;
  description: string;
  league: League;
  generatedAtIso: string;
  topN: number;
  dateCount: number;
  dateRange: { start: string; end: string } | null;
  overall: CategoryStats;
  byCategory: Record<string, CategoryStats>;
  notes: string[];
}

interface Acc {
  picks: number; wins: number; pricedPicks: number; staked: number; profit: number; mktSum: number;
  tiers: [number, number][];
}
const emptyAcc = (): Acc => ({ picks: 0, wins: 0, pricedPicks: 0, staked: 0, profit: 0, mktSum: 0, tiers: [[0, 0], [0, 0], [0, 0]] });
const tierIndex = (rank: number): number => (rank <= 5 ? 0 : rank <= 10 ? 1 : 2);

function finalize(a: Acc): CategoryStats {
  const hitRate = a.picks ? a.wins / a.picks : null;
  const mkt = a.pricedPicks ? a.mktSum / a.pricedPicks : null;
  return {
    picks: a.picks,
    wins: a.wins,
    hitRate,
    pricedPicks: a.pricedPicks,
    staked: a.staked,
    profit: Math.round(a.profit * 100) / 100,
    roi: a.staked ? a.profit / a.staked : null,
    marketImpliedHitRate: mkt,
    edge: hitRate != null && mkt != null ? hitRate - mkt : null,
    rankTiers: a.tiers.map(([p, w]) => (p ? w / p : null)),
  };
}

function batterStat(cat: BatterCat, out: NonNullable<PoolBatter["out"]>): number {
  switch (cat) {
    case "hr":  return out.hr;
    case "hit": return out.h;
    case "tb":  return out.tb;
    case "rbi": return out.rbi;
  }
}
function pitcherStat(cat: PitcherCat, out: NonNullable<PoolPitcher["out"]>): number {
  return cat === "k" ? out.so : out.outs;
}

// Accumulate one ranked, settled candidate into a category accumulator.
function record(acc: Acc, overall: Acc, rank: number, stat: number, line: number | null, cat: BatterCat | PitcherCat, mkt: PoolMarket | undefined): void {
  const hit = stat > thresholdFor(cat, line);
  acc.picks++; overall.picks++;
  if (hit) { acc.wins++; overall.wins++; }
  const ti = tierIndex(rank);
  acc.tiers[ti][0]++; overall.tiers[ti][0]++;
  if (hit) { acc.tiers[ti][1]++; overall.tiers[ti][1]++; }
  if (mkt && mkt.odds != null) {
    const payout = payoutDollars(mkt.odds, hit);
    if (payout != null) {
      acc.pricedPicks++; overall.pricedPicks++;
      acc.staked += 10; overall.staked += 10;
      acc.profit += payout; overall.profit += payout;
      if (mkt.pct != null) { acc.mktSum += mkt.pct; overall.mktSum += mkt.pct; }
    }
  }
}

function poolIsSettled(pool: CandidatePool): boolean {
  if (pool.settledAtIso) return true;
  // Tolerate older pools written before settledAtIso existed.
  return pool.batters.some((b) => b.out) || pool.pitchers.some((p) => p.out);
}

export async function computeRerank(
  env: Env,
  league: League,
  algorithmName: string,
  opts: { from?: string; to?: string; topN?: number } = {},
): Promise<RerankReport> {
  const algo = RERANK_ALGORITHMS[algorithmName];
  if (!algo) throw new Error(`unknown algorithm: ${algorithmName}`);
  const topN = opts.topN ?? 15;

  let dates = await readArchiveIndex(env, league);
  if (opts.from) dates = dates.filter((d) => d >= opts.from!);
  if (opts.to) dates = dates.filter((d) => d <= opts.to!);
  dates.sort();

  const pools = await pLimit(dates, 10, async (date) => readPool(env, league, date));

  const byCat: Record<string, Acc> = {};
  for (const c of [...BATTER_CATEGORIES, ...PITCHER_CATEGORIES]) byCat[c] = emptyAcc();
  const overall = emptyAcc();
  const contributing: string[] = [];
  let poolsFound = 0, poolsSettled = 0;

  for (const pool of pools) {
    if (!pool) continue;
    poolsFound++;
    if (!poolIsSettled(pool)) continue;
    poolsSettled++;
    let contributed = false;

    // Batters: reconstruct each candidate once, score all four categories.
    const batterRows = pool.batters.filter((b) => b.out && b.out.hadGame);
    const batterCtx = batterRows.map((b) => ({ row: b, ctx: reconstructBatterContext(b) }));
    for (const cat of BATTER_CATEGORIES) {
      const ranked = batterCtx
        .map(({ row, ctx }) => ({ row, score: algo.batter[cat](ctx) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
      ranked.forEach(({ row }, idx) => {
        contributed = true;
        record(byCat[cat], overall, idx + 1, batterStat(cat, row.out!), row.mkt[cat]?.line ?? null, cat, row.mkt[cat]);
      });
    }

    // Pitchers: same shape for k / outs.
    const pitcherRows = pool.pitchers.filter((p) => p.out && p.out.hadGame);
    const pitcherCtx = pitcherRows.map((p) => ({ row: p, ctx: reconstructPitcherContext(p) }));
    for (const cat of PITCHER_CATEGORIES) {
      const ranked = pitcherCtx
        .map(({ row, ctx }) => ({ row, score: algo.pitcher[cat](ctx) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
      ranked.forEach(({ row }, idx) => {
        contributed = true;
        record(byCat[cat], overall, idx + 1, pitcherStat(cat, row.out!), row.mkt[cat]?.line ?? null, cat, row.mkt[cat]);
      });
    }

    if (contributed) contributing.push(pool.date);
  }

  contributing.sort();
  const byCategory: Record<string, CategoryStats> = {};
  for (const c of [...BATTER_CATEGORIES, ...PITCHER_CATEGORIES]) byCategory[c] = finalize(byCat[c]);

  const notes: string[] = [];
  notes.push(`${poolsFound} pools found, ${poolsSettled} settled across ${dates.length} archived dates`);
  if (poolsSettled === 0) {
    notes.push("No settled pools yet — capture began with this deploy; numbers accrue as nightly settlement runs.");
  }

  return {
    algorithm: algo.name,
    description: algo.description,
    league,
    generatedAtIso: new Date().toISOString(),
    topN,
    dateCount: contributing.length,
    dateRange: contributing.length ? { start: contributing[0], end: contributing[contributing.length - 1] } : null,
    overall: finalize(overall),
    byCategory,
    notes,
  };
}
