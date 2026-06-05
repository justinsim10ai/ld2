import type { Category, DailyPayload, Env, League, Pick, PickResult } from "./types";
import { fetchHitterResults, fetchPitcherResults } from "./sources/mlbResult";
import type { HitterGameResult, PitcherGameResult } from "./sources/mlbResult";
import { renderSettledHighlights, renderSettledLeaderboards } from "./render";
import { writeArchiveAndMaybeAdvanceLatest } from "./pipeline";
import { settlePool } from "./pool";

const LEAGUE: League = "mlb";

const HITTER_CATEGORIES: Category[] = ["hr", "hit", "tb", "rbi"];
const PITCHER_CATEGORIES: Category[] = ["k", "outs"];
const ALL_SETTLE_CATEGORIES: Category[] = [...HITTER_CATEGORIES, ...PITCHER_CATEGORIES];

export interface SettlementOutcome {
  date: string;
  picksUpdated: number;
  byCategory: Record<Category, { settled: number; hit: number; miss: number; dnp: number }>;
  notes: string[];
}

/**
 * Phase 1: fetch game-log results for every player pick in the payload at
 * KV key r:mlb:{dateIso}, decorate each pick with .result, persist back to KV.
 * Returns the in-memory payload so callers can re-render without re-reading.
 */
export async function settlePayload(env: Env, dateIso: string): Promise<{ outcome: SettlementOutcome; payload: DailyPayload }> {
  const archiveKey = `r:${LEAGUE}:${dateIso}`;
  const raw = await env.LINEDRIVE_KV.get(archiveKey);
  if (!raw) {
    throw new Error(`no payload found for ${dateIso}`);
  }
  const payload = JSON.parse(raw) as DailyPayload;

  // Collect player IDs split by side
  const hitterIds = new Set<number>();
  const pitcherIds = new Set<number>();
  for (const cat of HITTER_CATEGORIES) {
    for (const p of payload.categories[cat]?.picks ?? []) hitterIds.add(p.playerId);
  }
  for (const cat of PITCHER_CATEGORIES) {
    for (const p of payload.categories[cat]?.picks ?? []) pitcherIds.add(p.playerId);
  }

  const [hitters, pitchers] = await Promise.all([
    fetchHitterResults([...hitterIds], dateIso),
    fetchPitcherResults([...pitcherIds], dateIso),
  ]);

  const counts: SettlementOutcome["byCategory"] = emptyCounts();
  let total = 0;

  for (const cat of ALL_SETTLE_CATEGORIES) {
    const picks = payload.categories[cat]?.picks ?? [];
    for (const p of picks) {
      const result = isHitterCategory(cat)
        ? resultForHitter(cat, p, hitters.get(p.playerId))
        : resultForPitcher(cat, p, pitchers.get(p.playerId));
      p.result = result;
      total++;
      const bucket = counts[cat];
      if (!result.hadGame) bucket.dnp++;
      else if (result.hit) bucket.hit++;
      else bucket.miss++;
      bucket.settled++;
    }
  }

  await writeArchiveAndMaybeAdvanceLatest(env, payload);

  const outcome: SettlementOutcome = {
    date: dateIso,
    picksUpdated: total,
    byCategory: counts,
    notes: [`settled ${total} picks across ${ALL_SETTLE_CATEGORIES.length} categories`],
  };
  return { outcome, payload };
}

/**
 * Phase 2: render result-stamped highlight PNGs from a (presumably already
 * settled) payload, and persist the highlightSettledImages references back to
 * KV. Idempotent: re-running overwrites the same R2 keys.
 */
export async function renderAndPersistSettled(env: Env, payload: DailyPayload): Promise<{ rendered: number; notes: string[] }> {
  const byCategory: Record<Category, Pick[]> = {
    hr: payload.categories.hr?.picks ?? [],
    hit: payload.categories.hit?.picks ?? [],
    k: payload.categories.k?.picks ?? [],
    tb: payload.categories.tb?.picks ?? [],
    rbi: payload.categories.rbi?.picks ?? [],
    outs: payload.categories.outs?.picks ?? [],
    game: payload.categories.game?.picks ?? [],
  };
  // Sequential, not Promise.all: both call getRenderer() which initializes the
  // resvg wasm module exactly once. Concurrent calls race on init and throw
  // "Already initialized" on whichever loses.
  const settledHighlights = await renderSettledHighlights(env, payload.date, byCategory);
  const settledLeaderboards = await renderSettledLeaderboards(env, payload.date, byCategory);

  let rendered = 0;
  for (const cat of ALL_SETTLE_CATEGORIES) {
    const block = payload.categories[cat];
    if (!block) continue;
    const list = settledHighlights[cat] ?? [];
    block.highlightSettledImages = list;
    const lbFilename = settledLeaderboards[cat] ?? "";
    if (lbFilename) {
      block.leaderboardSettledImage = lbFilename;
      rendered++;
    }
    rendered += list.length;
  }

  await writeArchiveAndMaybeAdvanceLatest(env, payload);

  return { rendered, notes: [`rendered ${rendered} settled PNGs`] };
}

/**
 * Convenience: settle data + render PNGs in a single invocation. Used by the
 * admin endpoint and the manual backfill path; the daily cron splits this
 * across two firings to keep CPU budgets generous.
 */
export async function runSettlementPhase(env: Env, dateIso: string): Promise<{ outcome: SettlementOutcome; rendered: number }> {
  const { outcome, payload } = await settlePayload(env, dateIso);
  // Settle the full candidate pool too (every player, not just the top-15) so
  // the re-rank harness has real outcomes. Best-effort — never block rendering.
  try {
    const ps = await settlePool(env, LEAGUE, dateIso);
    outcome.notes.push(`pool settled: ${ps.batters} batters, ${ps.pitchers} pitchers`);
  } catch (err) {
    console.error(`[settlement] pool settle failed for ${dateIso}`, err);
  }
  const renderResult = await renderAndPersistSettled(env, payload);
  return { outcome, rendered: renderResult.rendered };
}

function isHitterCategory(cat: Category): boolean {
  return cat === "hr" || cat === "hit" || cat === "tb" || cat === "rbi";
}

function resultForHitter(cat: Category, p: Pick, r: HitterGameResult | undefined): PickResult {
  if (!r || !r.hadGame) return dnpResult();
  const statValue = pickStatFromHitter(cat, r);
  const threshold = thresholdFor(cat, p.marketOverLine);
  const hit = statValue > threshold;
  return {
    hadGame: true,
    finalized: true,
    statValue,
    hit,
    display: displayFor(cat, statValue),
    payoutDollars: payoutDollars(p.marketOddsAmerican, hit),
  };
}

function resultForPitcher(cat: Category, p: Pick, r: PitcherGameResult | undefined): PickResult {
  if (!r || !r.hadGame) return dnpResult();
  const statValue = pickStatFromPitcher(cat, r);
  const threshold = thresholdFor(cat, p.marketOverLine);
  const hit = statValue > threshold;
  return {
    hadGame: true,
    finalized: true,
    statValue,
    hit,
    display: displayFor(cat, statValue),
    payoutDollars: payoutDollars(p.marketOddsAmerican, hit),
  };
}

function dnpResult(): PickResult {
  return {
    hadGame: false,
    finalized: false,
    statValue: 0,
    hit: false,
    display: "DNP",
    payoutDollars: null,
  };
}

function pickStatFromHitter(cat: Category, r: HitterGameResult): number {
  switch (cat) {
    case "hr":  return r.hr;
    case "hit": return r.h;
    case "tb":  return r.tb;
    case "rbi": return r.rbi;
    default:    return 0;
  }
}

function pickStatFromPitcher(cat: Category, r: PitcherGameResult): number {
  switch (cat) {
    case "k":    return r.so;
    case "outs": return r.outs;
    default:     return 0;
  }
}

// What value must `stat` strictly exceed for the pick to win?
// HR/Hit are binary YES markets — effectively over 0.5 (any ≥1 wins).
// TB/RBI/K/outs use the captured OG line, falling back to common defaults
// when OG didn't price it.
export function thresholdFor(cat: Category, marketOverLine: number | null): number {
  if (marketOverLine !== null && marketOverLine !== undefined) return marketOverLine;
  switch (cat) {
    case "hr":   return 0.5;
    case "hit":  return 0.5;
    case "tb":   return 1.5;
    case "rbi":  return 0.5;
    case "k":    return 5.5;
    case "outs": return 17.5; // ~6 innings
    default:     return 0.5;
  }
}

function displayFor(cat: Category, v: number): string {
  switch (cat) {
    case "hr":   return `${v} HR`;
    case "hit":  return v === 1 ? "1 hit" : `${v} hits`;
    case "tb":   return `${v} TB`;
    case "rbi":  return v === 1 ? "1 RBI" : `${v} RBI`;
    case "k":    return `${v} K`;
    case "outs": return `${v} outs`;
    default:     return String(v);
  }
}

// $10 stake → profit dollars. Win at +260 → $26 profit. Win at -110 → $9.09.
// Loss → -$10. null odds → null.
export function payoutDollars(americanOdds: number | null, won: boolean): number | null {
  if (americanOdds === null || americanOdds === undefined) return null;
  if (!won) return -10;
  const stake = 10;
  const profit = americanOdds > 0
    ? stake * (americanOdds / 100)
    : stake * (100 / Math.abs(americanOdds));
  return Math.round(profit * 100) / 100;
}

function emptyCounts(): SettlementOutcome["byCategory"] {
  const make = () => ({ settled: 0, hit: 0, miss: 0, dnp: 0 });
  return {
    hr: make(), hit: make(), k: make(), tb: make(), rbi: make(), outs: make(), game: make(),
  };
}
