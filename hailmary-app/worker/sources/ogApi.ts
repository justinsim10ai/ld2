import type { Env } from "../types";
import { fetchJson, pLimit } from "./http";
import {
  americanToImplied,
  normalizeName,
  type ScrapedGameMarkets,
  type GameHint,
  type PlayerMarkets,
  type GameTotalMarket,
  type MoneylineMarket,
  type FirstInningMarket,
  type AmericanOdds,
  type OverUnderOdds,
} from "./ogScraper";

/**
 * Crypto.com Predictions API source for OG markets. Replaces the HTML-scraper
 * data path while producing the same ScrapedGameMarkets shape so callers don't
 * change.
 *
 * Endpoint: GET /api/v1/predictions/events?kind=MLB&type=match&status=active
 *   Returns one event per game with all 100+ contracts inline. We filter to
 *   today's date, match events to gamePks by team abbreviation, then translate
 *   contracts into the same PlayerMarkets / GameTotalMarket shape.
 */

const API_BASE = "https://data-api.crypto.com/api/v1";
const PAGE_SIZE = 50;
const FETCH_TIMEOUT_MS = 9000;

// MLB abbrev → OG API abbrev aliases. We try the MLB spelling first, then any
// listed aliases. Reactively populated as mismatches surface.
const ABBREV_ALIAS: Record<string, string[]> = {
  AZ: ["ARI"],     // Arizona Diamondbacks
  CWS: ["CHW"],    // Chicago White Sox
};

interface ApiTeam {
  id: string;
  name: string | null;
  abbrev: string | null;
  city: string | null;
}

interface ApiIndividual {
  id: string;
  name: string | null;
  playing_position: string | null;
}

interface ApiMarketType {
  name: string | null;    // "moneyline" | "player" | "total" | "spread" | "game"
  title: string | null;   // "To Hit A Home Run" | "Total Bases" | "Pitcher Strikeouts" | etc.
  period?: string | null;
}

interface ApiContract {
  id: string;
  symbol: string;
  title: string;
  status: string;
  yes: string;          // decimal probability "0.47" or "" if unpriced
  no: string;
  chance?: string;
  payout_per_100?: string | null;
  team?: ApiTeam | null;
  individual_profile?: ApiIndividual | null;
  market_type: ApiMarketType;
}

interface ApiEvent {
  id: string;
  title: string;
  kind: string;
  type: string;
  event_date: string;
  status: string;
  contracts_count: number;
  contracts: ApiContract[];
  metadata?: { venue?: string | null };
}

interface ListEventsResponse {
  data: ApiEvent[];
  pagination?: { limit?: number; next_cursor?: string | null; has_more?: boolean };
}

/**
 * Fetches all active MLB match events overlapping the date. Pages until done.
 */
async function fetchAllMlbEvents(env: Env, dateIso: string): Promise<ApiEvent[]> {
  const apiKey = env.OG_API_KEY;
  if (!apiKey) return [];
  const events: ApiEvent[] = [];
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const url = `${API_BASE}/predictions/events?kind=MLB&type=match&status=active&limit=${PAGE_SIZE}&offset=${offset}`;
    let resp: ListEventsResponse;
    try {
      resp = await fetchJson<ListEventsResponse>(url, {
        timeoutMs: FETCH_TIMEOUT_MS,
        retries: 1,
        headers: { "x-api-key": apiKey },
      });
    } catch (err) {
      console.error(`[og:api] list events page ${page} failed`, String(err));
      break;
    }
    const batch = resp.data ?? [];
    events.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  // Filter to the requested MLB game date OR the next UTC day (West-Coast
  // first pitches after midnight UTC show up under tomorrow's UTC date even
  // though MLB still treats them as "today").
  const next = nextDay(dateIso);
  return events.filter((e) => {
    const ed = (e.event_date ?? "").slice(0, 10);
    return ed === dateIso || ed === next;
  });
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Public entry: builds the same Map<gamePk, ScrapedGameMarkets> the scraper
 * produces, but sourced from the API. Games we can't match are simply absent
 * from the returned map (caller can fall back to the scraper for those).
 */
export async function loadDateMarketsViaApi(
  env: Env,
  dateIso: string,
  games: GameHint[],
): Promise<Map<number, ScrapedGameMarkets>> {
  const out = new Map<number, ScrapedGameMarkets>();
  if (!env.OG_API_KEY) return out;

  const events = await fetchAllMlbEvents(env, dateIso);
  console.log(`[og:api] ${dateIso}: ${events.length} events`);
  if (events.length === 0) return out;

  // Index events by unordered team-pair (so home/away order doesn't matter).
  const eventByPair = new Map<string, ApiEvent>();
  for (const e of events) {
    const teams = collectEventTeamAbbrevs(e);
    if (teams.length < 2) continue;
    const key = pairKey(teams[0], teams[1]);
    eventByPair.set(key, e);
  }

  for (const g of games) {
    const matched = findEventForGame(g, eventByPair);
    if (!matched) continue;
    out.set(g.gamePk, parseEventToMarkets(matched, g));
  }
  console.log(`[og:api] ${dateIso}: matched ${out.size}/${games.length} games`);
  return out;
}

// ---- Event → ScrapedGameMarkets translation ----

function parseEventToMarkets(event: ApiEvent, hint: GameHint): ScrapedGameMarkets {
  const players = new Map<string, PlayerMarkets>();
  const totalLines: Array<{ line: number; over?: ApiContract; under?: ApiContract }> = [];
  const moneyline: { away?: ApiContract; home?: ApiContract } = {};
  let firstInning: AmericanOdds | null = null;

  for (const c of event.contracts ?? []) {
    const mtTitle = c.market_type?.title ?? "";
    const mtName = c.market_type?.name ?? "";

    // Player props
    if (mtName === "player") {
      const ip = c.individual_profile;
      if (!ip?.name) continue;
      const key = normalizeName(ip.name);
      let pm = players.get(key);
      if (!pm) { pm = {}; players.set(key, pm); }

      const yesOdds = decimalProbToAmerican(parseDec(c.yes));
      const noOdds = decimalProbToAmerican(parseDec(c.no));
      if (yesOdds === null) continue;

      const line = parseLineFromTitle(c.title);

      switch (mtTitle) {
        case "To Hit A Home Run":
          pm.hr = { yesOdds, noOdds: noOdds ?? 0 };
          break;
        case "To Get A Hit":
          pm.hit = { yesOdds, noOdds: noOdds ?? 0 };
          break;
        case "Total Bases":
          if (line !== null) pm.tb = { yesOdds, noOdds: noOdds ?? 0, line };
          break;
        case "Total RBIs":
          if (line !== null) pm.rbi = { yesOdds, noOdds: noOdds ?? 0, line };
          break;
        case "Pitcher Strikeouts":
          if (line !== null) pm.k = { yesOdds, noOdds: noOdds ?? 0, line };
          break;
        case "Pitcher Total Outs":
          if (line !== null) pm.outs = { yesOdds, noOdds: noOdds ?? 0, line };
          break;
        default:
          // Unknown player market — ignore.
          break;
      }
      continue;
    }

    // Game total runs (over/under ladder)
    if (mtName === "total" && mtTitle === "Total Runs") {
      const m = c.title.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)/i);
      if (!m) continue;
      const line = parseFloat(m[2]);
      const slot = totalLines.find((t) => t.line === line) ?? (totalLines.push({ line }), totalLines[totalLines.length - 1]);
      if (m[1].toLowerCase() === "over") slot.over = c;
      else slot.under = c;
      continue;
    }

    // Moneyline (one contract per team)
    if (mtName === "moneyline" && mtTitle === "Winner") {
      const abbrev = c.team?.abbrev?.toUpperCase();
      if (!abbrev) continue;
      const homeAbbrev = hint.homeTeamAbbrev?.toUpperCase();
      const awayAbbrev = hint.awayTeamAbbrev?.toUpperCase();
      if (homeAbbrev && abbrev === homeAbbrev) {
        moneyline.home = c;
      } else if (awayAbbrev && abbrev === awayAbbrev) {
        moneyline.away = c;
      }
      continue;
    }

    // First-inning binary
    if (mtTitle === "To Score A Run in the 1st Inning") {
      const yes = decimalProbToAmerican(parseDec(c.yes));
      const no = decimalProbToAmerican(parseDec(c.no));
      if (yes !== null) firstInning = { yesOdds: yes, noOdds: no ?? 0 };
      continue;
    }
  }

  return {
    gamePk: hint.gamePk,
    ogUrl: `https://data-api.crypto.com/api/v1/predictions/events/${event.id}`,
    gameTotal: pickHeadlineTotal(totalLines),
    moneyline: buildMoneyline(moneyline),
    firstInning: firstInning && firstInning.yesOdds !== 0
      ? {
          yesOdds: firstInning.yesOdds,
          noOdds: firstInning.noOdds,
          impliedYesPct: americanToImplied(firstInning.yesOdds),
        }
      : null,
    players,
  };
}

// Headline total = the line where Over's yes is closest to 0.5 (most balanced).
function pickHeadlineTotal(lines: Array<{ line: number; over?: ApiContract; under?: ApiContract }>): GameTotalMarket | null {
  const priced = lines.filter((l) => l.over && parseDec(l.over.yes) > 0 && l.under && parseDec(l.under.yes) > 0);
  if (priced.length === 0) return null;
  priced.sort((a, b) => Math.abs(parseDec(a.over!.yes) - 0.5) - Math.abs(parseDec(b.over!.yes) - 0.5));
  const chosen = priced[0];
  const overOdds = decimalProbToAmerican(parseDec(chosen.over!.yes));
  const underOdds = decimalProbToAmerican(parseDec(chosen.under!.yes));
  if (overOdds === null || underOdds === null) return null;
  return {
    line: chosen.line,
    overOdds,
    underOdds,
    impliedOverPct: americanToImplied(overOdds),
    impliedUnderPct: americanToImplied(underOdds),
  };
}

function buildMoneyline(ml: { away?: ApiContract; home?: ApiContract }): MoneylineMarket | null {
  if (!ml.away || !ml.home) return null;
  const awayOdds = decimalProbToAmerican(parseDec(ml.away.yes));
  const homeOdds = decimalProbToAmerican(parseDec(ml.home.yes));
  if (awayOdds === null || homeOdds === null) return null;
  return {
    awayOdds,
    homeOdds,
    impliedAwayPct: americanToImplied(awayOdds),
    impliedHomePct: americanToImplied(homeOdds),
  };
}

// ---- Helpers ----

function parseDec(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseLineFromTitle(title: string): number | null {
  // e.g. "Owen Caissie over 0.5", "Kevin Gausman over 5.5"
  const m = title.match(/over\s+(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

// Convert OG's decimal "yes" probability into American odds.
//   p = 0.47 → +113 (underdog)
//   p = 0.65 → -186 (favorite)
export function decimalProbToAmerican(p: number): number | null {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  if (p >= 0.5) return Math.round(-100 * p / (1 - p));
  return Math.round(100 * (1 - p) / p);
}

function collectEventTeamAbbrevs(e: ApiEvent): string[] {
  const seen = new Set<string>();
  for (const c of e.contracts ?? []) {
    const abbrev = c.team?.abbrev?.toUpperCase();
    if (abbrev) seen.add(abbrev);
  }
  return [...seen];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

// Match an MLB Stats game to an API event by unordered team-abbrev pair.
function findEventForGame(g: GameHint, byPair: Map<string, ApiEvent>): ApiEvent | null {
  const away = g.awayTeamAbbrev?.toUpperCase();
  const home = g.homeTeamAbbrev?.toUpperCase();
  if (!away || !home) return null;
  const direct = byPair.get(pairKey(away, home));
  if (direct) return direct;
  // Try alias variants
  const awayAliases = [away, ...(ABBREV_ALIAS[away] ?? [])];
  const homeAliases = [home, ...(ABBREV_ALIAS[home] ?? [])];
  for (const a of awayAliases) {
    for (const h of homeAliases) {
      const hit = byPair.get(pairKey(a, h));
      if (hit) return hit;
    }
  }
  return null;
}

void pLimit; // pLimit available if we ever shard event lookups; unused for now.
