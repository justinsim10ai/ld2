import type { Category, DailyPayload, Env, League } from "./types";
import { fetchGames, gamesForDate } from "./sources/nflGames";
import { writeArchiveAndMaybeAdvanceLatest } from "./pipeline";

const LEAGUE: League = "nfl";

export interface SettlementOutcome {
  date: string;
  picksUpdated: number;
  byCategory: Record<string, { settled: number; hit: number; miss: number; dnp: number }>;
  notes: string[];
}

function seasonForDate(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return m >= 3 ? y : y - 1;
}

// Phase 1 (NFL v1): grade the GAME-total picks from final scores in games.csv.
// Player props can't be graded until prop lines exist (no threshold), so they
// stay unsettled — the backtest naturally skips them until then.
export async function settlePayload(env: Env, dateIso: string): Promise<{ outcome: SettlementOutcome; payload: DailyPayload }> {
  const raw = await env.HAILMARY_KV.get(`r:${LEAGUE}:${dateIso}`);
  if (!raw) {
    return { outcome: { date: dateIso, picksUpdated: 0, byCategory: {}, notes: ["no payload"] }, payload: emptyish(dateIso) };
  }
  const payload = JSON.parse(raw) as DailyPayload;

  const games = gamesForDate(await fetchGames(seasonForDate(dateIso)), dateIso);
  const finalByMatchup = new Map<string, number | null>();
  for (const g of games) finalByMatchup.set(`${g.away} @ ${g.home}`, g.finalTotal);

  let updated = 0;
  const gameBlock = payload.categories.game;
  for (const p of gameBlock?.picks ?? []) {
    const total = finalByMatchup.get(p.playerName);
    if (total == null) continue;
    p.result = {
      hadGame: true,
      finalized: true,
      statValue: total,
      hit: false,            // no bet side yet — recorded for display only
      display: `${total} pts`,
      payoutDollars: null,
    };
    updated++;
  }

  const outcome: SettlementOutcome = {
    date: dateIso, picksUpdated: updated,
    byCategory: { game: { settled: updated, hit: 0, miss: 0, dnp: 0 } },
    notes: [`settled ${updated} game totals; player props await prop lines`],
  };
  await writeArchiveAndMaybeAdvanceLatest(env, payload);
  return { outcome, payload };
}

export async function renderAndPersistSettled(_env: Env, _payload: DailyPayload): Promise<{ rendered: number; notes: string[] }> {
  // Settled PNG rendering is Phase 5; persistence already happened in settlePayload.
  return { rendered: 0, notes: ["settled render is a Phase 5 stub"] };
}

export async function runSettlementPhase(env: Env, dateIso: string): Promise<{ outcome: SettlementOutcome; rendered: number }> {
  const { outcome } = await settlePayload(env, dateIso);
  return { outcome, rendered: 0 };
}

// $10 stake → profit dollars. Win at +260 → $26; win at -110 → $9.09; loss → -$10.
export function payoutDollars(americanOdds: number | null, won: boolean): number | null {
  if (americanOdds == null) return null;
  if (!won) return -10;
  const profit = americanOdds > 0 ? 10 * (americanOdds / 100) : 10 * (100 / Math.abs(americanOdds));
  return Math.round(profit * 100) / 100;
}

function emptyish(dateIso: string): DailyPayload {
  return {
    league: LEAGUE, date: dateIso, generatedAtIso: new Date().toISOString(),
    gameCount: 0, categories: {} as Record<Category, DailyPayload["categories"][Category]>, games: [], renderScope: "full", notes: [],
  };
}
