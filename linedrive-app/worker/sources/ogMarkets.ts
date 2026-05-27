import type { Env } from "../types";
import { loadDateMarkets, PreloadedMarketLookup, type GameHint } from "./ogScraper";
import type { ScrapedGameMarkets } from "./ogScraper";

// Build a MarketLookup pre-populated from a single sitemap+per-game scrape pass.
// Errors are caught and degrade to an empty lookup — the pipeline always continues.
export async function buildMarketLookup(
  env: Env,
  dateIso: string,
  games: GameHint[],
  playerNameById: Map<number, string>,
  playerToGamePk: Map<number, number>,
): Promise<PreloadedMarketLookup & { markets: Map<number, ScrapedGameMarkets> }> {
  let markets: Map<number, ScrapedGameMarkets>;
  try {
    markets = await loadDateMarkets(env, dateIso, games);
  } catch (err) {
    console.error("[ogMarkets] loadDateMarkets threw", String(err));
    markets = new Map();
  }
  const lookup = new PreloadedMarketLookup(markets, playerToGamePk, playerNameById) as PreloadedMarketLookup & { markets: Map<number, ScrapedGameMarkets> };
  lookup.markets = markets;
  return lookup;
}
