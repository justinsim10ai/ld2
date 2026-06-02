import type { Env } from "../types";
import { loadDateMarkets, PreloadedMarketLookup, type GameHint } from "./ogScraper";
import type { ScrapedGameMarkets, PlayerMarkets } from "./ogScraper";
import { loadDateMarketsViaApi } from "./ogApi";

/**
 * Builds a MarketLookup populated from BOTH the Crypto.com Predictions API
 * (authoritative — wins per-pick when present) and the HTML scraper (broader
 * player coverage — fills any gaps the API doesn't price). Both sources run
 * concurrently for every game; results are merged per-player so we keep
 * scraper coverage on players the API doesn't expose markets for.
 *
 * All errors degrade to an empty side — the pipeline always continues.
 */
export async function buildMarketLookup(
  env: Env,
  dateIso: string,
  games: GameHint[],
  playerNameById: Map<number, string>,
  playerToGamePk: Map<number, number>,
): Promise<PreloadedMarketLookup & { markets: Map<number, ScrapedGameMarkets> }> {
  const [apiMarkets, scraperMarkets] = await Promise.all([
    env.OG_API_KEY
      ? loadDateMarketsViaApi(env, dateIso, games).catch((err) => {
          console.error("[ogMarkets] api source threw", String(err));
          return new Map<number, ScrapedGameMarkets>();
        })
      : Promise.resolve(new Map<number, ScrapedGameMarkets>()),
    loadDateMarkets(env, dateIso, games).catch((err) => {
      console.error("[ogMarkets] scraper threw", String(err));
      return new Map<number, ScrapedGameMarkets>();
    }),
  ]);

  const merged = mergeMarkets(apiMarkets, scraperMarkets);
  console.log(`[ogMarkets] api=${apiMarkets.size} scraper=${scraperMarkets.size} merged=${merged.size}`);
  const lookup = new PreloadedMarketLookup(merged, playerToGamePk, playerNameById) as PreloadedMarketLookup & { markets: Map<number, ScrapedGameMarkets> };
  lookup.markets = merged;
  return lookup;
}

// API wins per field; scraper fills any field/player the API didn't price.
function mergeMarkets(
  api: Map<number, ScrapedGameMarkets>,
  scraper: Map<number, ScrapedGameMarkets>,
): Map<number, ScrapedGameMarkets> {
  const out = new Map<number, ScrapedGameMarkets>();
  const allGamePks = new Set<number>([...api.keys(), ...scraper.keys()]);
  for (const gamePk of allGamePks) {
    const a = api.get(gamePk);
    const s = scraper.get(gamePk);
    if (a && !s) { out.set(gamePk, a); continue; }
    if (s && !a) { out.set(gamePk, s); continue; }
    if (!a || !s) continue;
    out.set(gamePk, {
      gamePk,
      ogUrl: a.ogUrl || s.ogUrl,
      gameTotal: a.gameTotal ?? s.gameTotal,
      moneyline: a.moneyline ?? s.moneyline,
      firstInning: a.firstInning ?? s.firstInning,
      players: mergePlayerMaps(a.players, s.players),
    });
  }
  return out;
}

function mergePlayerMaps(
  api: Map<string, PlayerMarkets>,
  scraper: Map<string, PlayerMarkets>,
): Map<string, PlayerMarkets> {
  const out = new Map<string, PlayerMarkets>(scraper);
  for (const [name, apm] of api) {
    const spm = out.get(name);
    if (!spm) { out.set(name, apm); continue; }
    out.set(name, {
      hr: apm.hr ?? spm.hr,
      hit: apm.hit ?? spm.hit,
      tb: apm.tb ?? spm.tb,
      rbi: apm.rbi ?? spm.rbi,
      outs: apm.outs ?? spm.outs,
      k: apm.k ?? spm.k,
    });
  }
  return out;
}
