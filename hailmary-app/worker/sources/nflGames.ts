import { fetchText, parseCsv } from "./http";
import type { NflGame } from "../types";

// nflverse games.csv — schedule + venue/roof + weather + betting lines (spread,
// total) + final scores, all in one file, including the upcoming season. Small
// enough to fetch + parse worker-direct.
const GAMES_CSV =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

function num(v: string | undefined): number | null {
  if (v == null || v === "" || v === "NA") return null;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}

export function parseGames(csv: string, season?: number): NflGame[] {
  const out: NflGame[] = [];
  for (const r of parseCsv(csv)) {
    if (!r.game_id) continue;
    const s = parseInt(r.season, 10);
    if (season != null && s !== season) continue;
    out.push({
      gameId: r.game_id,
      season: s,
      week: parseInt(r.week, 10) || 0,
      gameType: r.game_type || "REG",
      dateIso: r.gameday,
      kickoffLocal: r.gametime || "",
      away: r.away_team,
      home: r.home_team,
      awayScore: num(r.away_score),
      homeScore: num(r.home_score),
      finalTotal: num(r.total),
      spreadLine: num(r.spread_line),   // home favored by this many
      totalLine: num(r.total_line),
      overOdds: num(r.over_odds),
      underOdds: num(r.under_odds),
      awayMoneyline: num(r.away_moneyline),
      homeMoneyline: num(r.home_moneyline),
      roof: r.roof || "",
      surface: r.surface || "",
      tempF: num(r.temp),
      windMph: num(r.wind),
      stadium: r.stadium || "",
    });
  }
  return out;
}

export async function fetchGames(season: number): Promise<NflGame[]> {
  const csv = await fetchText(GAMES_CSV, { timeoutMs: 25000, retries: 1 });
  return parseGames(csv, season);
}

// Implied team totals from spread + total. nflverse spread_line is the HOME
// line (positive = home favored), so home gets the bump.
export function impliedTotals(g: NflGame): { home: number; away: number } | null {
  if (g.totalLine == null || g.spreadLine == null) return null;
  return {
    home: g.totalLine / 2 + g.spreadLine / 2,
    away: g.totalLine / 2 - g.spreadLine / 2,
  };
}

export const gamesForDate = (games: NflGame[], dateIso: string): NflGame[] =>
  games.filter((g) => g.dateIso === dateIso);

export const isDomeGame = (g: NflGame): boolean => /dome|closed/i.test(g.roof);
