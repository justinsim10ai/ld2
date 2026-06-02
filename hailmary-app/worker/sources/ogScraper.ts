import type { Env } from "../types";
import { fetchText, pLimit } from "./http";
import { ogSlugForTeam } from "./ogTeams";

const SITEMAP_URL = "https://og.com/sitemap.xml";
const SITEMAP_CACHE_TTL_S = 60 * 60;        // 1 hour
const GAME_CACHE_TTL_S = 60 * 30;            // 30 minutes
const SITEMAP_KV_KEY = "og:sitemap:cache";
const GAME_KV_PREFIX = "og:game:";

export interface AmericanOdds { yesOdds: number; noOdds: number; }
export interface OverUnderOdds extends AmericanOdds { line: number; }

export interface PlayerMarkets {
  hr?: AmericanOdds;
  hit?: AmericanOdds;
  tb?: OverUnderOdds;
  rbi?: OverUnderOdds;
  outs?: OverUnderOdds;
  k?: OverUnderOdds;
}

export interface GameTotalMarket {
  line: number;
  overOdds: number;
  underOdds: number;
  impliedOverPct: number;
  impliedUnderPct: number;
}

export interface MoneylineMarket {
  awayOdds: number;
  homeOdds: number;
  impliedAwayPct: number;
  impliedHomePct: number;
}

export interface FirstInningMarket {
  yesOdds: number;
  noOdds: number;
  impliedYesPct: number;
}

export interface ScrapedGameMarkets {
  gamePk: number;
  ogUrl: string;
  gameTotal: GameTotalMarket | null;
  moneyline: MoneylineMarket | null;
  firstInning: FirstInningMarket | null;
  players: Map<string, PlayerMarkets>;  // normalized full name → markets
}

export interface GameHint {
  gamePk: number;
  awayTeamId: number;
  homeTeamId: number;
  awayTeamAbbrev?: string;
  homeTeamAbbrev?: string;
}

export function americanToImplied(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Sitemap discovery ----

interface SitemapCache { fetchedAt: number; urls: string[]; }

async function getSitemapUrls(env: Env): Promise<string[]> {
  try {
    const cached = await env.HAILMARY_KV.get<SitemapCache>(SITEMAP_KV_KEY, "json");
    if (cached && Date.now() - cached.fetchedAt < SITEMAP_CACHE_TTL_S * 1000) {
      return cached.urls;
    }
  } catch { /* cache miss */ }

  try {
    const xml = await fetchText(SITEMAP_URL, { timeoutMs: 8000, retries: 1 });
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    const filtered = urls.filter((u) => /\/markets\/.*-\d{4}-\d{2}-\d{2}-[a-z0-9]{6}$/.test(u));
    await env.HAILMARY_KV.put(
      SITEMAP_KV_KEY,
      JSON.stringify({ fetchedAt: Date.now(), urls: filtered }),
      { expirationTtl: SITEMAP_CACHE_TTL_S * 2 },
    );
    console.log(`[og:scrape] sitemap ${filtered.length} market urls`);
    return filtered;
  } catch (err) {
    console.error("[og:scrape] sitemap fetch failed", String(err));
    return [];
  }
}

function findGameUrl(urls: string[], dateIso: string, awayTeamId: number, homeTeamId: number): string | null {
  const away = ogSlugForTeam(awayTeamId);
  const home = ogSlugForTeam(homeTeamId);
  if (!away || !home) return null;
  const prefix = `https://og.com/markets/${away}-at-${home}-${dateIso}-`;
  return urls.find((u) => u.startsWith(prefix)) ?? null;
}

// ---- Per-game scrape ----

interface GameCache { fetchedAt: number; markets: SerializableGameMarkets; }
interface SerializableGameMarkets {
  gamePk: number;
  ogUrl: string;
  gameTotal: GameTotalMarket | null;
  moneyline: MoneylineMarket | null;
  firstInning: FirstInningMarket | null;
  players: Record<string, PlayerMarkets>;
}

async function scrapeGame(env: Env, url: string, gamePk: number): Promise<ScrapedGameMarkets | null> {
  const cacheKey = `${GAME_KV_PREFIX}${gamePk}`;
  try {
    const cached = await env.HAILMARY_KV.get<GameCache>(cacheKey, "json");
    if (cached && Date.now() - cached.fetchedAt < GAME_CACHE_TTL_S * 1000) {
      return rehydrate(cached.markets);
    }
  } catch { /* miss */ }

  try {
    const html = await fetchText(url, { timeoutMs: 12000, retries: 1 });
    const parsed = parseGameHtml(html, gamePk, url);
    const cache: GameCache = {
      fetchedAt: Date.now(),
      markets: {
        gamePk: parsed.gamePk,
        ogUrl: parsed.ogUrl,
        gameTotal: parsed.gameTotal,
        moneyline: parsed.moneyline,
        firstInning: parsed.firstInning,
        players: Object.fromEntries(parsed.players),
      },
    };
    await env.HAILMARY_KV.put(cacheKey, JSON.stringify(cache), {
      expirationTtl: GAME_CACHE_TTL_S * 2,
    });
    console.log(`[og:scrape] ${gamePk} markets — ${parsed.players.size} players, gameTotal=${parsed.gameTotal?.line ?? "?"}`);
    return parsed;
  } catch (err) {
    console.error(`[og:scrape] ${gamePk} failed`, String(err));
    return null;
  }
}

function rehydrate(s: SerializableGameMarkets): ScrapedGameMarkets {
  return {
    gamePk: s.gamePk,
    ogUrl: s.ogUrl,
    gameTotal: s.gameTotal,
    moneyline: s.moneyline,
    firstInning: s.firstInning,
    players: new Map(Object.entries(s.players)),
  };
}

export function parseGameHtml(html: string, gamePk: number, url: string): ScrapedGameMarkets {
  // Strip tags, collapse separators. Result is a pipe-delimited text stream.
  const text = html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/\s+/g, " ");

  const result: ScrapedGameMarkets = {
    gamePk,
    ogUrl: url,
    gameTotal: parseGameTotal(text),
    moneyline: parseMoneyline(text),
    firstInning: parseFirstInning(text),
    players: new Map(),
  };

  // Player no-line markets
  for (const [pname, odds] of parseYesNoSection(text, "To Hit A Home Run")) {
    getOrInit(result.players, pname).hr = odds;
  }
  for (const [pname, odds] of parseYesNoSection(text, "To Get A Hit")) {
    getOrInit(result.players, pname).hit = odds;
  }

  // Player over/under markets
  for (const [pname, ou] of parseOverUnderSection(text, "Total Bases")) {
    getOrInit(result.players, pname).tb = ou;
  }
  for (const [pname, ou] of parseOverUnderSection(text, "Total RBIs")) {
    getOrInit(result.players, pname).rbi = ou;
  }
  for (const [pname, ou] of parseOverUnderSection(text, "Total Outs")) {
    getOrInit(result.players, pname).outs = ou;
  }
  for (const [pname, ou] of parseOverUnderSection(text, "Strikeouts")) {
    getOrInit(result.players, pname).k = ou;
  }

  return result;
}

function getOrInit(map: Map<string, PlayerMarkets>, name: string): PlayerMarkets {
  const key = normalizeName(name);
  let v = map.get(key);
  if (!v) { v = {}; map.set(key, v); }
  return v;
}

// Section bounds: from first occurrence of `header|` to next likely section header
function sliceSection(text: string, header: string): string {
  const re = new RegExp(`${escape(header)}\\|`);
  const m = text.match(re);
  if (!m) return "";
  const start = (m.index ?? 0) + m[0].length;
  // Cut at the next known market header or a long stretch of non-pipe content
  const tail = text.slice(start);
  const stopMatch = tail.match(/\|(?:Total Bases|Total RBIs|Total Outs|Strikeouts|To Hit A Home Run|To Get A Hit|Moneyline|Run Line|Total Runs|Alternate|1st Inning|Injury report|Probable Pitchers)\|/);
  return stopMatch ? tail.slice(0, stopMatch.index) : tail.slice(0, 5000);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseYesNoSection(text: string, header: string): Array<[string, AmericanOdds]> {
  const section = sliceSection(text, header);
  if (!section) return [];
  // Pattern: "Player Name| |Yes +X|No ±Y"
  const out: Array<[string, AmericanOdds]> = [];
  const re = /([A-Z][A-Za-z'.\-]*(?:\s+[A-Z][A-Za-z'.\-]*){1,3})\|\s*\|Yes ([+-]\d+)\|No ([+-]\d+)/g;
  for (const m of section.matchAll(re)) {
    out.push([m[1].trim(), { yesOdds: parseInt(m[2], 10), noOdds: parseInt(m[3], 10) }]);
  }
  return out;
}

function parseOverUnderSection(text: string, header: string): Array<[string, OverUnderOdds]> {
  const section = sliceSection(text, header);
  if (!section) return [];
  // Pattern: "Player Name| | over X.Y|Yes +A|No ±B"
  const out: Array<[string, OverUnderOdds]> = [];
  const re = /([A-Z][A-Za-z'.\-]*(?:\s+[A-Z][A-Za-z'.\-]*){1,3})\|\s*\|\s*over (\d+(?:\.\d+)?)\|Yes ([+-]\d+)\|No ([+-]\d+)/g;
  for (const m of section.matchAll(re)) {
    out.push([
      m[1].trim(),
      {
        line: parseFloat(m[2]),
        yesOdds: parseInt(m[3], 10),
        noOdds: parseInt(m[4], 10),
      },
    ]);
  }
  return out;
}

function parseGameTotal(text: string): GameTotalMarket | null {
  // Pattern: "Total Runs|Over|10.5|+138|Under|10.5|-144"
  const m = text.match(/Total Runs\|Over\|(\d+(?:\.\d+)?)\|([+-]\d+)\|Under\|\d+(?:\.\d+)?\|([+-]\d+)/);
  if (!m) return null;
  const line = parseFloat(m[1]);
  const overOdds = parseInt(m[2], 10);
  const underOdds = parseInt(m[3], 10);
  return {
    line,
    overOdds,
    underOdds,
    impliedOverPct: americanToImplied(overOdds),
    impliedUnderPct: americanToImplied(underOdds),
  };
}

function parseMoneyline(text: string): MoneylineMarket | null {
  // Pattern: "Moneyline|<away abbrev or name>|<american>|<home>|<american>"
  // Be loose — Mantine wraps each item; here we just grab the two odds after "Moneyline|"
  const idx = text.indexOf("Moneyline|");
  if (idx < 0) return null;
  const slice = text.slice(idx + "Moneyline|".length, idx + 600);
  const odds = Array.from(slice.matchAll(/([+-]\d{2,4})\b/g)).slice(0, 2).map((m) => parseInt(m[1], 10));
  if (odds.length < 2) return null;
  const [awayOdds, homeOdds] = odds;
  return {
    awayOdds,
    homeOdds,
    impliedAwayPct: americanToImplied(awayOdds),
    impliedHomePct: americanToImplied(homeOdds),
  };
}

function parseFirstInning(text: string): FirstInningMarket | null {
  // Pattern: "1st Inning To Score A Run Yes|Yes -128|No +117"
  const m = text.match(/1st Inning[^|]*\|Yes ([+-]\d+)\|No ([+-]\d+)/);
  if (!m) return null;
  const yesOdds = parseInt(m[1], 10);
  const noOdds = parseInt(m[2], 10);
  return {
    yesOdds,
    noOdds,
    impliedYesPct: americanToImplied(yesOdds),
  };
}

// ---- Public entry: load all markets for a date ----

export async function loadDateMarkets(
  env: Env,
  dateIso: string,
  games: GameHint[],
): Promise<Map<number, ScrapedGameMarkets>> {
  const out = new Map<number, ScrapedGameMarkets>();
  if (games.length === 0) return out;

  const sitemapUrls = await getSitemapUrls(env);
  if (sitemapUrls.length === 0) return out;

  const lookups: Array<{ gamePk: number; url: string }> = [];
  for (const g of games) {
    const url = findGameUrl(sitemapUrls, dateIso, g.awayTeamId, g.homeTeamId);
    if (url) lookups.push({ gamePk: g.gamePk, url });
  }
  console.log(`[og:scrape] ${dateIso}: matched ${lookups.length}/${games.length} games to OG urls`);

  await pLimit(lookups, 5, async ({ gamePk, url }) => {
    const m = await scrapeGame(env, url, gamePk);
    if (m) out.set(gamePk, m);
  });

  return out;
}

// ---- Lookup wrapper compatible with the existing MarketLookup interface ----

import type { Category } from "../types";

export interface MarketLine {
  impliedPct: number;
  americanOdds: number;
  line: number | null;   // over/under threshold (1.5 TB, 5.5 K); null for binary markets (HR/Hit)
}

export class PreloadedMarketLookup {
  constructor(
    private byGamePk: Map<number, ScrapedGameMarkets>,
    private playerToGamePk: Map<number, number>,
    private playerNameById: Map<number, string>,
  ) {}

  get(playerId: number, category: Category): number | null {
    return this.getLine(playerId, category)?.impliedPct ?? null;
  }

  getLine(playerId: number, category: Category): MarketLine | null {
    try {
      const gamePk = this.playerToGamePk.get(playerId);
      if (!gamePk) return null;
      const game = this.byGamePk.get(gamePk);
      if (!game) return null;
      const name = this.playerNameById.get(playerId);
      if (!name) return null;
      const player = game.players.get(normalizeName(name));
      if (!player) return null;
      return marketYesLine(player, category);
    } catch (err) {
      console.error("[og:scrape] lookup err", String(err));
      return null;
    }
  }

  getGameTotal(gamePk: number): GameTotalMarket | null {
    return this.byGamePk.get(gamePk)?.gameTotal ?? null;
  }

  getGameMarkets(gamePk: number): ScrapedGameMarkets | null {
    return this.byGamePk.get(gamePk) ?? null;
  }
}

function marketYesLine(p: PlayerMarkets, category: Category): MarketLine | null {
  const odds =
    category === "hr"   ? p.hr?.yesOdds :
    category === "hit"  ? p.hit?.yesOdds :
    category === "tb"   ? p.tb?.yesOdds :
    category === "rbi"  ? p.rbi?.yesOdds :
    category === "outs" ? p.outs?.yesOdds :
    category === "k"    ? p.k?.yesOdds :
    null;
  if (odds === undefined || odds === null) return null;
  const line =
    category === "tb"   ? p.tb?.line ?? null :
    category === "rbi"  ? p.rbi?.line ?? null :
    category === "outs" ? p.outs?.line ?? null :
    category === "k"    ? p.k?.line ?? null :
    null;
  return { impliedPct: americanToImplied(odds), americanOdds: odds, line };
}
