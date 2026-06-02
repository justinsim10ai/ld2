import type {
  BatterContext,
  BatterStats,
  Category,
  CategoryBlock,
  DailyPayload,
  Env,
  GameSummary,
  League,
  Pick,
  PitcherContext,
  PitcherStats,
  TeamRef,
} from "./types";

const LEAGUE: League = "mlb";

import { lookupPark } from "./parks";
import { fetchTodaysGames, fetchLineupForGame, fetchTeamActiveRoster } from "./sources/mlbSchedule";
import { fetchPlayerProfiles, fetchAllTeamHittingKRates, fetchVsPitcher } from "./sources/mlbPlayer";
import { readSavant } from "./sources/savant";
import type { PlayerProfile, TeamSeasonHitting, VsPitcherLine } from "./sources/mlbPlayer";
import { fetchParkWeatherAt } from "./sources/weather";
import { buildMarketLookup } from "./sources/ogMarkets";
import type { ScrapedGameMarkets } from "./sources/ogScraper";
import { americanToImplied } from "./sources/ogScraper";
import {
  scoreHomeRun,
  scoreHit,
  scoreStrikeouts,
  scoreTotalBases,
  scoreTotalRbis,
  scoreTotalOuts,
  rankBatters,
  rankPitchers,
  rankGames,
  CATEGORY_TITLES,
} from "./scoring";
import type { GameScoringContext } from "./scoring";
import { pLimit } from "./sources/http";
import { renderLeaderboards, renderHighlights } from "./render";

const PICKS_PER_CATEGORY = 15;
const HIGHLIGHT_COUNT = 4;
const GAME_PICKS = 15;

export type RenderScope = "full" | "leaderboards-only";

export async function runDailyPipeline(
  env: Env,
  isoDate?: string,
  renderScope: RenderScope = "full",
): Promise<DailyPayload> {
  const dateIso = isoDate ?? new Date(Date.now()).toISOString().slice(0, 10);
  const startedAt = Date.now();

  const games = await fetchTodaysGames(dateIso);
  console.log(`[pipeline] ${dateIso}: ${games.length} games (scope=${renderScope})`);
  if (games.length === 0) {
    return emptyPayload(dateIso, "No games scheduled", renderScope);
  }

  // Pull lineups in parallel
  const lineupsByGame = new Map<number, { home: number[]; away: number[]; homeProj: boolean; awayProj: boolean }>();
  await pLimit(games, 6, async (g) => {
    const lu = await fetchLineupForGame(g.gamePk);
    lineupsByGame.set(g.gamePk, {
      home: lu.homeBatters,
      away: lu.awayBatters,
      homeProj: lu.homeProjected,
      awayProj: lu.awayProjected,
    });
  });

  // For teams without a confirmed lineup, fall back to the active roster
  const rosterByTeam = new Map<number, number[]>();
  const teamsNeedingRoster = new Set<number>();
  for (const g of games) {
    const lu = lineupsByGame.get(g.gamePk)!;
    if (lu.homeProj || lu.home.length === 0) teamsNeedingRoster.add(g.homeTeam.id);
    if (lu.awayProj || lu.away.length === 0) teamsNeedingRoster.add(g.awayTeam.id);
  }
  await pLimit([...teamsNeedingRoster], 6, async (teamId) => {
    const roster = await fetchTeamActiveRoster(teamId);
    const batterIds = roster
      .filter((r) => r.position !== "P" && r.position !== "TWP")
      .map((r) => r.playerId);
    rosterByTeam.set(teamId, batterIds);
  });

  // Collect all player IDs we need profiles for
  const allPlayerIds = new Set<number>();
  for (const g of games) {
    if (g.homeProbablePitcher) allPlayerIds.add(g.homeProbablePitcher.id);
    if (g.awayProbablePitcher) allPlayerIds.add(g.awayProbablePitcher.id);
    const lu = lineupsByGame.get(g.gamePk)!;
    const homeIds = (lu.home.length > 0 ? lu.home : rosterByTeam.get(g.homeTeam.id) ?? []).slice(0, 9);
    const awayIds = (lu.away.length > 0 ? lu.away : rosterByTeam.get(g.awayTeam.id) ?? []).slice(0, 9);
    homeIds.forEach((id) => allPlayerIds.add(id));
    awayIds.forEach((id) => allPlayerIds.add(id));
  }

  // Fetch profiles in chunks of 25
  const idsList = [...allPlayerIds];
  const chunks: number[][] = [];
  for (let i = 0; i < idsList.length; i += 25) chunks.push(idsList.slice(i, i + 25));
  const profiles = new Map<number, PlayerProfile>();
  await pLimit(chunks, 4, async (chunk) => {
    const got = await fetchPlayerProfiles(chunk);
    for (const [k, v] of got) profiles.set(k, v);
  });

  const teamK = await fetchAllTeamHittingKRates();

  // Statcast (Baseball Savant) — read from KV, populated off-worker by the
  // savant uploader (savant blocks Worker egress). Merge onto profiles by id;
  // empty/missing → fields stay null and scorers fall back to neutral.
  const savant = await readSavant(env);
  for (const [id, prof] of profiles) {
    const sb = savant.batters.get(id);
    if (sb) { prof.barrelRate = sb.barrelRate; prof.hardHitPct = sb.hardHitPct; prof.bestSpeed = sb.bestSpeed; }
    const sp = savant.pitchers.get(id);
    if (sp) { prof.whiffPct = sp.whiffPct; prof.kPctSavant = sp.kPct; }
  }

  // Park weather per unique venue (gametime)
  const venueFirstPitch = new Map<number, string>();
  for (const g of games) {
    if (!venueFirstPitch.has(g.venueId)) venueFirstPitch.set(g.venueId, g.gameDateIso);
  }
  const weatherByVenue = new Map<number, Awaited<ReturnType<typeof fetchParkWeatherAt>>>();
  await pLimit([...venueFirstPitch.entries()], 6, async ([venueId, gameDateIso]) => {
    const park = lookupPark(venueId);
    if (park.isDome) { weatherByVenue.set(venueId, null); return; }
    const w = await fetchParkWeatherAt(park.lat, park.lon, gameDateIso);
    weatherByVenue.set(venueId, w);
  });

  // Build contexts + per-player→game lookup
  const batterContexts: BatterContext[] = [];
  const pitcherContexts: PitcherContext[] = [];
  const gameContexts: GameScoringContext[] = [];
  const playerToGamePk = new Map<number, number>();
  const playerNameById = new Map<number, string>();
  let projectedCount = 0;

  for (const g of games) {
    const park = lookupPark(g.venueId, g.venueName);
    const weather = weatherByVenue.get(g.venueId) ?? null;
    const lu = lineupsByGame.get(g.gamePk)!;

    const homeBatterIds = (lu.home.length > 0 ? lu.home : rosterByTeam.get(g.homeTeam.id) ?? []).slice(0, 9);
    const awayBatterIds = (lu.away.length > 0 ? lu.away : rosterByTeam.get(g.awayTeam.id) ?? []).slice(0, 9);
    const homeProjected = lu.homeProj || lu.home.length === 0;
    const awayProjected = lu.awayProj || lu.away.length === 0;
    if (homeProjected) projectedCount++;
    if (awayProjected) projectedCount++;

    const homePitcherStats = g.homeProbablePitcher
      ? buildPitcherStats(g.homeProbablePitcher.id, g.homeTeam, profiles)
      : null;
    const awayPitcherStats = g.awayProbablePitcher
      ? buildPitcherStats(g.awayProbablePitcher.id, g.awayTeam, profiles)
      : null;

    if (homePitcherStats) {
      playerToGamePk.set(homePitcherStats.playerId, g.gamePk);
      playerNameById.set(homePitcherStats.playerId, homePitcherStats.fullName);
    }
    if (awayPitcherStats) {
      playerToGamePk.set(awayPitcherStats.playerId, g.gamePk);
      playerNameById.set(awayPitcherStats.playerId, awayPitcherStats.fullName);
    }

    addBatters(homeBatterIds, g.homeTeam, awayPitcherStats, park, weather, homeProjected, profiles, batterContexts, g.gamePk, playerToGamePk, playerNameById);
    addBatters(awayBatterIds, g.awayTeam, homePitcherStats, park, weather, awayProjected, profiles, batterContexts, g.gamePk, playerToGamePk, playerNameById);

    if (homePitcherStats) {
      pitcherContexts.push({
        pitcher: homePitcherStats,
        opponentTeamId: g.awayTeam.id,
        opponentTeamKPctRelLeague: relLeagueKPct(teamK, g.awayTeam.id),
        park, weather,
      });
    }
    if (awayPitcherStats) {
      pitcherContexts.push({
        pitcher: awayPitcherStats,
        opponentTeamId: g.homeTeam.id,
        opponentTeamKPctRelLeague: relLeagueKPct(teamK, g.homeTeam.id),
        park, weather,
      });
    }

    gameContexts.push({
      gamePk: g.gamePk,
      awayAbbrev: g.awayTeam.abbreviation,
      homeAbbrev: g.homeTeam.abbreviation,
      awayName: g.awayTeam.name,
      homeName: g.homeTeam.name,
      venueName: g.venueName,
      gameDateIso: g.gameDateIso,
      parkHrFactor: park.hrFactor,
      parkRunFactor: park.hrFactor, // proxy for run factor
      isDome: park.isDome,
      awayPitcher: awayPitcherStats,
      homePitcher: homePitcherStats,
      awayLineupKPct: null,
      homeLineupKPct: null,
      weather,
    });
  }

  // Hydrate batter-vs-pitcher career splits for confirmed matchups.
  // One subrequest per probable pitcher (parallel, capped). Best-effort: any
  // failure leaves vsPitcher = null on the batter context.
  if (renderScope === "full") {
    const batterIdsByPitcher = new Map<number, number[]>();
    for (const bc of batterContexts) {
      const pid = bc.opponentPitcher?.playerId;
      if (!pid) continue;
      let arr = batterIdsByPitcher.get(pid);
      if (!arr) { arr = []; batterIdsByPitcher.set(pid, arr); }
      arr.push(bc.batter.playerId);
    }
    const vsLines = new Map<number, VsPitcherLine>();
    await pLimit([...batterIdsByPitcher.entries()], 8, async ([pid, batterIds]) => {
      const lines = await fetchVsPitcher(batterIds, pid);
      for (const [bid, line] of lines) vsLines.set(bid, line);
    });
    for (const bc of batterContexts) {
      const line = vsLines.get(bc.batter.playerId);
      if (line) bc.vsPitcher = line;
    }
    console.log(`[pipeline] vs-pitcher lines hydrated: ${vsLines.size}`);
  }

  // Run the OG scraper for all dates so leaderboards can show market values for
  // tomorrow + day+2 too. Markets that aren't yet priced just return null and
  // the cards render "—" for that row.
  const market = await buildMarketLookup(
    env,
    dateIso,
    games.map((g) => ({
      gamePk: g.gamePk,
      awayTeamId: g.awayTeam.id,
      homeTeamId: g.homeTeam.id,
      awayTeamAbbrev: g.awayTeam.abbreviation,
      homeTeamAbbrev: g.homeTeam.abbreviation,
    })),
    playerNameById,
    playerToGamePk,
  );

  // Rank
  const hrPicks   = rankBatters(batterContexts, scoreHomeRun, PICKS_PER_CATEGORY);
  const hitPicks  = rankBatters(batterContexts, scoreHit, PICKS_PER_CATEGORY);
  const tbPicks   = rankBatters(batterContexts, scoreTotalBases, PICKS_PER_CATEGORY);
  const rbiPicks  = rankBatters(batterContexts, scoreTotalRbis, PICKS_PER_CATEGORY);
  const kPicks    = rankPitchers(pitcherContexts, scoreStrikeouts, PICKS_PER_CATEGORY, "K");
  const outsPicks = rankPitchers(pitcherContexts, scoreTotalOuts, PICKS_PER_CATEGORY, "outs");
  const gamePicks = rankGames(gameContexts, GAME_PICKS);

  // Annotate market % synchronously from the preloaded lookup
  annotateMarket(hrPicks,   "hr", market);
  annotateMarket(hitPicks,  "hit", market);
  annotateMarket(tbPicks,   "tb", market);
  annotateMarket(rbiPicks,  "rbi", market);
  annotateMarket(kPicks,    "k", market);
  annotateMarket(outsPicks, "outs", market);
  // Game total picks: marketPct from game total over implied %
  for (const p of gamePicks) {
    const m = market.getGameTotal(p.playerId);  // playerId == gamePk for game picks
    if (m) {
      p.marketPct = m.impliedOverPct;
      p.marketLine = `O/U ${m.line}`;
      p.marketOverLine = m.line;
      p.marketOddsAmerican = m.overOdds ?? null;
    }
  }

  // Phase A: render the 7 leaderboard PNGs (one per category). Highlights are
  // deferred to a separate Worker invocation triggered by /admin/render-highlights
  // (or runHighlightPhase() below) so each phase gets its own 30s CPU budget.
  const allPicksByCategory: Record<Category, Pick[]> = {
    hr: hrPicks, hit: hitPicks, k: kPicks,
    tb: tbPicks, rbi: rbiPicks, outs: outsPicks,
    game: gamePicks,
  };
  const { leaderboard, leaderboardAmerican } = await renderLeaderboards(env, dateIso, allPicksByCategory);

  const categories: Record<Category, CategoryBlock> = {
    hr:   buildBlock("hr",   hrPicks,   leaderboard.hr,   leaderboardAmerican.hr,   []),
    hit:  buildBlock("hit",  hitPicks,  leaderboard.hit,  leaderboardAmerican.hit,  []),
    k:    buildBlock("k",    kPicks,    leaderboard.k,    leaderboardAmerican.k,    []),
    tb:   buildBlock("tb",   tbPicks,   leaderboard.tb,   leaderboardAmerican.tb,   []),
    rbi:  buildBlock("rbi",  rbiPicks,  leaderboard.rbi,  leaderboardAmerican.rbi,  []),
    outs: buildBlock("outs", outsPicks, leaderboard.outs, leaderboardAmerican.outs, []),
    game: buildBlock("game", gamePicks, leaderboard.game, "",                       []),
  };

  const gameSummaries: GameSummary[] = games.map((g) => {
    const scraped: ScrapedGameMarkets | null = market.getGameMarkets(g.gamePk);
    const matchScored = gamePicks.find((p) => p.playerId === g.gamePk);
    return {
      gamePk: g.gamePk,
      awayAbbrev: g.awayTeam.abbreviation,
      homeAbbrev: g.homeTeam.abbreviation,
      awayName: g.awayTeam.name,
      homeName: g.homeTeam.name,
      gameDateIso: g.gameDateIso,
      venueName: g.venueName,
      ogUrl: scraped?.ogUrl ?? null,
      modelTotalRuns: matchScored?.score ?? 0,
      marketLine: scraped?.gameTotal?.line ?? null,
      marketOverOdds: scraped?.gameTotal?.overOdds ?? null,
      marketUnderOdds: scraped?.gameTotal?.underOdds ?? null,
      cardImage: "",
    };
  });

  const notes: string[] = [];
  if (projectedCount > 0) {
    notes.push(`${projectedCount} team lineup${projectedCount === 1 ? "" : "s"} projected`);
  }
  const marketHits = countMarketHits(categories);
  if (marketHits.total > 0) {
    notes.push(`OG markets: ${marketHits.with}/${marketHits.total} picks priced`);
  }
  notes.push(`Generated in ${Math.round((Date.now() - startedAt) / 100) / 10}s`);

  const payload: DailyPayload = {
    league: LEAGUE,
    date: dateIso,
    generatedAtIso: new Date().toISOString(),
    gameCount: games.length,
    categories,
    games: gameSummaries,
    renderScope,
    notes,
  };

  await writeArchiveAndMaybeAdvanceLatest(env, payload);
  await appendIndex(env, LEAGUE, dateIso);

  return payload;
}

/**
 * Phase B: read the payload written by Phase A, render highlight PNGs, and
 * update the payload's highlight references. Runs as a separate Worker
 * invocation to get its own CPU + memory budget — invoked via /admin/render-highlights.
 */
export async function runHighlightPhase(env: Env, dateIso: string): Promise<{ rendered: number; notes: string[] }> {
  const archiveKey = `r:${LEAGUE}:${dateIso}`;
  const raw = await env.LINEDRIVE_KV.get(archiveKey);
  if (!raw) return { rendered: 0, notes: [`no payload found for ${dateIso}`] };
  const payload = JSON.parse(raw) as DailyPayload;

  const byCategory: Record<Category, Pick[]> = {
    hr: payload.categories.hr.picks,
    hit: payload.categories.hit.picks,
    k: payload.categories.k.picks,
    tb: payload.categories.tb.picks,
    rbi: payload.categories.rbi.picks,
    outs: payload.categories.outs.picks,
    game: payload.categories.game.picks,
  };

  const highlights = await renderHighlights(env, dateIso, byCategory);

  // Mutate payload's highlight references in place
  let rendered = 0;
  for (const cat of ["hr","hit","k","tb","rbi","outs","game"] as Category[]) {
    const list = highlights[cat] ?? [];
    payload.categories[cat].highlightImages = list;
    rendered += list.length;
  }

  await writeArchiveAndMaybeAdvanceLatest(env, payload);

  console.log(`[highlights] ${dateIso}: rendered ${rendered}`);
  return { rendered, notes: [`rendered ${rendered} highlight PNGs`] };
}

function countMarketHits(cats: Record<Category, CategoryBlock>): { with: number; total: number } {
  let w = 0, t = 0;
  for (const c of Object.values(cats)) {
    for (const p of c.picks) {
      t++;
      if (p.marketPct !== null && p.marketPct !== undefined) w++;
    }
  }
  return { with: w, total: t };
}

const INDEX_KEY_PREFIX = "index:";
const INDEX_MAX_ENTRIES = 365;

async function appendIndex(env: Env, league: League, dateIso: string): Promise<void> {
  const key = `${INDEX_KEY_PREFIX}${league}`;
  const existing = await env.LINEDRIVE_KV.get(key);
  let dates: string[] = [];
  if (existing) {
    try { dates = JSON.parse(existing) as string[]; } catch { /* ignore */ }
  }
  if (!dates.includes(dateIso)) dates.push(dateIso);
  dates.sort((a, b) => b.localeCompare(a));
  if (dates.length > INDEX_MAX_ENTRIES) dates = dates.slice(0, INDEX_MAX_ENTRIES);
  await env.LINEDRIVE_KV.put(key, JSON.stringify(dates));
}

export async function readArchiveIndex(env: Env, league: League): Promise<string[]> {
  const raw = await env.LINEDRIVE_KV.get(`${INDEX_KEY_PREFIX}${league}`);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

/**
 * Writes the per-date archive and, when applicable, advances the "latest"
 * pointer. Latest is only moved FORWARD in time — if the existing latest's
 * date is newer than the payload's date, the pointer is not touched. Prevents
 * a settlement run for yesterday from clobbering today's pointer.
 */
export async function writeArchiveAndMaybeAdvanceLatest(env: Env, payload: DailyPayload): Promise<void> {
  const dateIso = payload.date;
  const archiveKey = `r:${LEAGUE}:${dateIso}`;
  const json = JSON.stringify(payload);
  const todayUtc = new Date(Date.now()).toISOString().slice(0, 10);
  const yesterdayUtc = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const writes: Promise<void>[] = [
    env.LINEDRIVE_KV.put(archiveKey, json, { expirationTtl: 60 * 60 * 24 * 90 }),
  ];
  if (dateIso === todayUtc || dateIso === yesterdayUtc) {
    let allowLatestWrite = true;
    try {
      const existing = await env.LINEDRIVE_KV.get(`latest:${LEAGUE}`);
      if (existing) {
        const cur = JSON.parse(existing) as DailyPayload;
        if (cur.date && cur.date > dateIso) allowLatestWrite = false;
      }
    } catch { /* malformed — fall through and overwrite */ }
    if (allowLatestWrite) {
      writes.push(env.LINEDRIVE_KV.put(`latest:${LEAGUE}`, json));
      writes.push(env.LINEDRIVE_KV.put("linedrive:today", json));
    }
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
  const empty: CategoryBlock = { category: "hr", title: "", picks: [], leaderboardImage: "", highlightImages: [] };
  const cats = {} as Record<Category, CategoryBlock>;
  for (const c of ["hr","hit","k","tb","rbi","outs","game"] as Category[]) {
    cats[c] = { ...empty, category: c, title: CATEGORY_TITLES[c] };
  }
  return {
    league: LEAGUE,
    date: dateIso,
    generatedAtIso: new Date().toISOString(),
    gameCount: 0,
    categories: cats,
    games: [],
    renderScope,
    notes: [note],
  };
}

function addBatters(
  ids: number[],
  team: TeamRef,
  opponentPitcher: PitcherStats | null,
  park: ReturnType<typeof lookupPark>,
  weather: Awaited<ReturnType<typeof fetchParkWeatherAt>>,
  projected: boolean,
  profiles: Map<number, PlayerProfile>,
  out: BatterContext[],
  gamePk: number,
  playerToGamePk: Map<number, number>,
  playerNameById: Map<number, string>,
) {
  ids.forEach((id, slot) => {
    const profile = profiles.get(id);
    if (!profile) return;
    if (profile.paSeason < 20) return;
    playerToGamePk.set(id, gamePk);
    playerNameById.set(id, profile.fullName);
    out.push({
      batter: buildBatterStats(id, team, profile),
      opponentPitcher,
      park,
      weather: weather ?? null,
      lineupSlot: projected ? null : slot + 1,
      lineupProjected: projected,
    });
  });
}

function buildBatterStats(id: number, team: TeamRef, profile: PlayerProfile): BatterStats {
  return {
    playerId: id,
    fullName: profile.fullName,
    team,
    bats: profile.bats,
    paSeason: profile.paSeason,
    ba30d: profile.baLast30,
    hrLast30: profile.hrLast30,
    isoSeason: profile.iso,
    hrPerPaSeason: profile.hrPerPa,
    xBaSeason: profile.xBa,
    xSlgSeason: profile.xSlg,
    xwObaSeason: profile.xwOba,
    barrelRate: profile.barrelRate ?? null,
    hardHitPct: profile.hardHitPct ?? null,
  };
}

function buildPitcherStats(id: number, team: TeamRef, profiles: Map<number, PlayerProfile>): PitcherStats | null {
  const profile = profiles.get(id);
  if (!profile) return null;
  const expectedIp = profile.ipSeason > 0
    ? Math.min(6.5, Math.max(4.0, profile.ipSeason / Math.max(1, Math.floor(profile.ipSeason / 5))))
    : 5.5;
  return {
    playerId: id,
    fullName: profile.fullName,
    team,
    throws: profile.throws,
    ipSeason: profile.ipSeason,
    k9Season: profile.k9Season,
    k9Last30: profile.k9Last30,
    hr9Season: profile.hr9Season,
    xBaAgainstSeason: profile.xBaAgainst,
    xSlgAgainstSeason: profile.xSlgAgainst,
    whiffPct: profile.whiffPct ?? null,
    expectedIp,
  };
}

function relLeagueKPct(teamK: Map<number, TeamSeasonHitting>, teamId: number): number | null {
  const team = teamK.get(teamId);
  if (!team || team.kPctSeason === null) return null;
  let sum = 0;
  let count = 0;
  for (const t of teamK.values()) {
    if (t.kPctSeason !== null) { sum += t.kPctSeason; count++; }
  }
  if (count === 0) return null;
  return team.kPctSeason / (sum / count);
}

function annotateMarket(
  picks: Pick[],
  category: Category,
  market: {
    get(playerId: number, category: Category): number | null;
    getLine(playerId: number, category: Category): { impliedPct: number; americanOdds: number; line: number | null } | null;
  },
) {
  for (const p of picks) {
    try {
      const line = market.getLine(p.playerId, category);
      if (line) {
        p.marketPct = line.impliedPct;
        p.marketOddsAmerican = line.americanOdds;
        p.marketOverLine = line.line;
        const pct = Math.round(line.impliedPct * 100);
        const odds = line.americanOdds > 0 ? `+${line.americanOdds}` : String(line.americanOdds);
        p.marketLine = `${pct}% / ${odds}`;
      } else {
        p.marketPct = null;
        p.marketOddsAmerican = null;
        p.marketLine = null;
        p.marketOverLine = null;
      }
    } catch {
      p.marketPct = null;
      p.marketOddsAmerican = null;
      p.marketLine = null;
      p.marketOverLine = null;
    }
  }
}
