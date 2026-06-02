import type { Env, League, DailyPayload, PlayerCategory } from "./types";
import { readArchiveIndex } from "./pipeline";
import { pLimit } from "./sources/http";

// Backtest: aggregate settled results across the archive into per-category hit
// rate and flat-$10-stake ROI vs the OG market. Reads every archived payload
// (settlement writes pick.result back to r:<league>:<date>), counting only
// finalized picks where the player actually had a game.

const PLAYER_CATEGORIES: PlayerCategory[] = ["pass_yds", "pass_td", "rush_yds", "rec_yds", "rec", "atd"];

export interface CategoryStats {
  picks: number;                       // finalized picks with a game
  wins: number;
  hitRate: number | null;              // wins / picks
  pricedPicks: number;                 // subset that had OG odds (ROI basis)
  staked: number;                      // pricedPicks * $10
  profit: number;                      // net $ on flat $10 stakes
  roi: number | null;                  // profit / staked
  marketImpliedHitRate: number | null; // avg OG implied prob over priced picks
}

export interface BacktestReport {
  league: League;
  generatedAtIso: string;
  dateCount: number;
  dateRange: { start: string; end: string } | null;
  overall: CategoryStats;
  byCategory: Record<string, CategoryStats>;
}

interface Acc { picks: number; wins: number; pricedPicks: number; staked: number; profit: number; mktSum: number; }
const emptyAcc = (): Acc => ({ picks: 0, wins: 0, pricedPicks: 0, staked: 0, profit: 0, mktSum: 0 });

function finalize(a: Acc): CategoryStats {
  return {
    picks: a.picks,
    wins: a.wins,
    hitRate: a.picks ? a.wins / a.picks : null,
    pricedPicks: a.pricedPicks,
    staked: a.staked,
    profit: Math.round(a.profit * 100) / 100,
    roi: a.staked ? a.profit / a.staked : null,
    marketImpliedHitRate: a.pricedPicks ? a.mktSum / a.pricedPicks : null,
  };
}

export async function computeBacktest(env: Env, league: League): Promise<BacktestReport> {
  const dates = await readArchiveIndex(env, league);

  const byCat: Record<string, Acc> = {};
  for (const c of PLAYER_CATEGORIES) byCat[c] = emptyAcc();
  const overall = emptyAcc();
  const contributing: string[] = [];

  const entries = await pLimit(dates, 10, async (date) => {
    const raw = await env.HAILMARY_KV.get(`r:${league}:${date}`);
    return raw ? { date, payload: JSON.parse(raw) as DailyPayload } : null;
  });

  for (const entry of entries) {
    if (!entry) continue;
    let contributed = false;
    for (const cat of PLAYER_CATEGORIES) {
      const block = entry.payload.categories?.[cat];
      if (!block) continue;
      for (const p of block.picks) {
        const r = p.result;
        if (!r || !r.finalized || !r.hadGame) continue;
        contributed = true;
        const acc = byCat[cat];
        acc.picks++; overall.picks++;
        if (r.hit) { acc.wins++; overall.wins++; }
        if (r.payoutDollars !== null && r.payoutDollars !== undefined) {
          acc.pricedPicks++; overall.pricedPicks++;
          acc.staked += 10; overall.staked += 10;
          acc.profit += r.payoutDollars; overall.profit += r.payoutDollars;
          if (p.marketPct !== null && p.marketPct !== undefined) {
            acc.mktSum += p.marketPct; overall.mktSum += p.marketPct;
          }
        }
      }
    }
    if (contributed) contributing.push(entry.date);
  }

  contributing.sort();
  const byCategory: Record<string, CategoryStats> = {};
  for (const c of PLAYER_CATEGORIES) byCategory[c] = finalize(byCat[c]);

  return {
    league,
    generatedAtIso: new Date().toISOString(),
    dateCount: contributing.length,
    dateRange: contributing.length
      ? { start: contributing[0], end: contributing[contributing.length - 1] }
      : null,
    overall: finalize(overall),
    byCategory,
  };
}
