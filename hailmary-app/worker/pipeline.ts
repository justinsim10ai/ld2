import type {
  Category,
  CategoryBlock,
  DailyPayload,
  Env,
  League,
  Pick,
  PlayerContext,
} from "./types";
import { fetchGames, gamesForDate, impliedTotals } from "./sources/nflGames";
import { readPlayerStats } from "./sources/nflStats";
import { rankPlayers, rankGames, CATEGORY_TITLES } from "./scoring";
import { renderLeaderboards, renderHighlights } from "./render";

const LEAGUE: League = "nfl";

const ALL_CATEGORIES: Category[] = ["pass_yds", "pass_td", "rush_yds", "rec_yds", "rec", "atd", "game"];
const PLAYER_CATEGORIES = ["pass_yds", "pass_td", "rush_yds", "rec_yds", "rec", "atd"] as const;

const PICKS_PER_CATEGORY = 15;
const HIGHLIGHT_COUNT = 4;
const GAME_PICKS = 15;

export type RenderScope = "full" | "leaderboards-only";

// NFL season = the year the season started (a Jan/Feb game belongs to the prior year).
function seasonForDate(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return m >= 3 ? y : y - 1;
}

export async function runDailyPipeline(
  env: Env,
  isoDate?: string,
  renderScope: RenderScope = "full",
): Promise<DailyPayload> {
  const dateIso = isoDate ?? new Date(Date.now()).toISOString().slice(0, 10);
  const startedAt = Date.now();
  const season = seasonForDate(dateIso);

  const allGames = await fetchGames(season);
  const slate = gamesForDate(allGames, dateIso);
  console.log(`[pipeline] ${dateIso} (season ${season}): ${slate.length} games (scope=${renderScope})`);
  if (slate.length === 0) return emptyPayload(dateIso, "No games scheduled", renderScope);

  const { players, defense } = await readPlayerStats(env);
  const playerCount = Object.keys(players).length;

  // team abbrev → game environment for this slate
  const env4 = new Map<string, { game: typeof slate[number]; isHome: boolean; opponent: string; implied: number | null }>();
  for (const g of slate) {
    const imp = impliedTotals(g);
    env4.set(g.home, { game: g, isHome: true, opponent: g.away, implied: imp?.home ?? null });
    env4.set(g.away, { game: g, isHome: false, opponent: g.home, implied: imp?.away ?? null });
  }

  // Build a PlayerContext for every rostered player whose team is on the slate.
  const contexts: PlayerContext[] = [];
  for (const p of Object.values(players)) {
    const e = env4.get(p.team);
    if (!e) continue;
    contexts.push({
      player: p,
      game: e.game,
      isHome: e.isHome,
      opponent: e.opponent,
      opponentDefense: defense[e.opponent] ?? null,
      impliedTeamTotal: e.implied,
      scheduleProjected: e.game.awayScore == null, // upcoming → prior-season rates
    });
  }

  const picksByCategory: Record<Category, Pick[]> = {
    pass_yds: rankPlayers(contexts, "pass_yds", PICKS_PER_CATEGORY),
    pass_td: rankPlayers(contexts, "pass_td", PICKS_PER_CATEGORY),
    rush_yds: rankPlayers(contexts, "rush_yds", PICKS_PER_CATEGORY),
    rec_yds: rankPlayers(contexts, "rec_yds", PICKS_PER_CATEGORY),
    rec: rankPlayers(contexts, "rec", PICKS_PER_CATEGORY),
    atd: rankPlayers(contexts, "atd", PICKS_PER_CATEGORY),
    game: rankGames(slate, GAME_PICKS),
  };

  const { leaderboard, leaderboardAmerican } = await renderLeaderboards(env, dateIso, picksByCategory);

  const categories = {} as Record<Category, CategoryBlock>;
  for (const c of ALL_CATEGORIES) {
    categories[c] = buildBlock(c, picksByCategory[c], leaderboard[c], leaderboardAmerican[c], []);
  }

  const notes: string[] = [];
  if (playerCount === 0) notes.push("No player stats loaded — run the NFL stats upload");
  else if (contexts.length === 0) notes.push("No rostered players matched the slate");
  notes.push(`${slate.length} games, ${contexts.length} players in pool`);
  notes.push(`Generated in ${Math.round((Date.now() - startedAt) / 100) / 10}s`);

  const payload: DailyPayload = {
    league: LEAGUE,
    date: dateIso,
    generatedAtIso: new Date().toISOString(),
    gameCount: slate.length,
    categories,
    games: [],
    renderScope,
    notes,
  };

  await writeArchiveAndMaybeAdvanceLatest(env, payload);
  await appendIndex(env, LEAGUE, dateIso);
  return payload;
}

// Phase B: render highlight PNGs for an already-archived slate.
export async function runHighlightPhase(env: Env, dateIso: string): Promise<{ rendered: number; notes: string[] }> {
  const raw = await env.HAILMARY_KV.get(`r:${LEAGUE}:${dateIso}`);
  if (!raw) return { rendered: 0, notes: [`no payload found for ${dateIso}`] };
  const payload = JSON.parse(raw) as DailyPayload;

  const byCategory = {} as Record<Category, Pick[]>;
  for (const c of ALL_CATEGORIES) byCategory[c] = payload.categories[c].picks;

  const highlights = await renderHighlights(env, dateIso, byCategory);
  let rendered = 0;
  for (const c of ALL_CATEGORIES) {
    const list = highlights[c] ?? [];
    payload.categories[c].highlightImages = list;
    rendered += list.length;
  }
  await writeArchiveAndMaybeAdvanceLatest(env, payload);
  return { rendered, notes: [`rendered ${rendered} highlight PNGs`] };
}

const INDEX_KEY_PREFIX = "index:";
const INDEX_MAX_ENTRIES = 365;

async function appendIndex(env: Env, league: League, dateIso: string): Promise<void> {
  const key = `${INDEX_KEY_PREFIX}${league}`;
  const existing = await env.HAILMARY_KV.get(key);
  let dates: string[] = [];
  if (existing) { try { dates = JSON.parse(existing) as string[]; } catch { /* ignore */ } }
  if (!dates.includes(dateIso)) dates.push(dateIso);
  dates.sort((a, b) => b.localeCompare(a));
  if (dates.length > INDEX_MAX_ENTRIES) dates = dates.slice(0, INDEX_MAX_ENTRIES);
  await env.HAILMARY_KV.put(key, JSON.stringify(dates));
}

export async function readArchiveIndex(env: Env, league: League): Promise<string[]> {
  const raw = await env.HAILMARY_KV.get(`${INDEX_KEY_PREFIX}${league}`);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// Writes the per-date archive and advances the "latest" pointer forward only.
export async function writeArchiveAndMaybeAdvanceLatest(env: Env, payload: DailyPayload): Promise<void> {
  const dateIso = payload.date;
  const json = JSON.stringify(payload);
  const todayUtc = new Date(Date.now()).toISOString().slice(0, 10);
  const writes: Promise<void>[] = [
    env.HAILMARY_KV.put(`r:${LEAGUE}:${dateIso}`, json, { expirationTtl: 60 * 60 * 24 * 120 }),
  ];
  // For NFL, the "latest" slate is the nearest one; advance the pointer when
  // generating today or a future slate (not when backfilling/settling old ones).
  if (dateIso >= todayUtc) {
    let allow = true;
    try {
      const cur = await env.HAILMARY_KV.get(`latest:${LEAGUE}`);
      if (cur) { const c = JSON.parse(cur) as DailyPayload; if (c.date && c.date > dateIso) allow = false; }
    } catch { /* overwrite */ }
    if (allow) writes.push(env.HAILMARY_KV.put(`latest:${LEAGUE}`, json));
  }
  await Promise.all(writes);
}

function buildBlock(category: Category, picks: Pick[], leaderboard: string | undefined, leaderboardAmerican: string | undefined, highlights: string[] | undefined): CategoryBlock {
  return {
    category,
    title: CATEGORY_TITLES[category],
    picks,
    leaderboardImage: leaderboard ?? "",
    leaderboardImageAmerican: leaderboardAmerican || undefined,
    highlightImages: (highlights ?? []).slice(0, HIGHLIGHT_COUNT),
  };
}

function emptyPayload(dateIso: string, note: string, renderScope: RenderScope): DailyPayload {
  const cats = {} as Record<Category, CategoryBlock>;
  for (const c of ALL_CATEGORIES) {
    cats[c] = { category: c, title: CATEGORY_TITLES[c], picks: [], leaderboardImage: "", highlightImages: [] };
  }
  return {
    league: LEAGUE, date: dateIso, generatedAtIso: new Date().toISOString(),
    gameCount: 0, categories: cats, games: [], renderScope, notes: [note],
  };
}
