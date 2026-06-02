export type Position = "QB" | "RB" | "WR" | "TE" | "FB" | "OTHER";

// A scheduled NFL game, parsed from nflverse games.csv. Carries schedule,
// venue/roof, weather, the betting lines (spread + total), and — once played —
// the final scores. nflverse `spread_line` is the HOME line (positive = home
// favored by that many points).
export interface NflGame {
  gameId: string;          // "2026_01_NE_SEA"
  season: number;
  week: number;
  gameType: string;        // "REG" | "POST" | "PRE"
  dateIso: string;         // gameday, "2026-09-09"
  kickoffLocal: string;    // gametime, "20:20"
  away: string;            // team abbreviation
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  finalTotal: number | null;   // away+home points once final
  spreadLine: number | null;   // home favored by this many
  totalLine: number | null;    // O/U
  overOdds: number | null;
  underOdds: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  roof: string;            // "outdoors" | "dome" | "closed" | "open"
  surface: string;
  tempF: number | null;
  windMph: number | null;
  stadium: string;
}

// Season-aggregated per-game player rates, from nflverse stats_player_week.
export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  position: Position;
  team: string;            // most recent team abbreviation
  games: number;
  // passing
  passYdsPg: number; passTdPg: number; attPg: number; intPg: number; passAirYdsPg: number;
  // rushing
  rushYdsPg: number; carriesPg: number; rushTdPg: number;
  // receiving
  recYdsPg: number; recPg: number; targetsPg: number; recTdPg: number; recAirYdsPg: number;
  // usage (latest/averaged)
  targetShare: number; airYardsShare: number; wopr: number;
  // touchdowns of any kind per game (rush + rec, or pass for QB)
  anytimeTdPg: number;
}

// Per-defense allowances, aggregated from the same weekly file by opponent_team.
export interface TeamDefenseStats {
  team: string;
  games: number;
  passYdsAllowedPg: number;
  rushYdsAllowedPg: number;
  passTdAllowedPg: number;
  rushTdAllowedPg: number;
  recAllowedPg: number;      // receptions allowed per game
}

// Built in the pipeline: a player + their game environment + opposing defense.
export interface PlayerContext {
  player: PlayerSeasonStats;
  game: NflGame;
  isHome: boolean;
  opponent: string;
  opponentDefense: TeamDefenseStats | null;
  impliedTeamTotal: number | null;   // this player's team's implied points
  scheduleProjected: boolean;        // true when stats are prior-season (preseason/early)
}

export type Category = "pass_yds" | "pass_td" | "rush_yds" | "rec_yds" | "rec" | "atd" | "game";

export type PlayerCategory = "pass_yds" | "pass_td" | "rush_yds" | "rec_yds" | "rec" | "atd";

export interface PickResult {
  hadGame: boolean;       // false = postponed, scratched, or no row found
  finalized: boolean;     // game is final + stats settled
  statValue: number;      // actual: HR count, hits, TB, RBI, K, outs recorded
  hit: boolean;           // pick won — category threshold cleared
  display: string;        // "1 HR", "0 HR", "2 H", "6 K", "18 outs", "—"
  payoutDollars: number | null; // $10 stake profit (positive for win, -10 for loss, null if no odds)
}

// A single scoring factor's contribution to a pick, surfaced for the factor
// table and per-factor explainer pages. The `id` is the contract key shared
// with the frontend registry (src/factors.js) and worker/factors.ts.
export interface PickFactor {
  id: string;            // "iso", "parkHr", "pitcherHr9", ...
  value: number;         // raw underlying stat (park.hrFactor=92, iso=0.241)
  contribution: number;  // signed weight×z added to the score (0 for multiplicative scorers)
  display: string;       // pre-formatted cell, e.g. "92", ".241", "1.6 HR/9"
  neutral?: boolean;     // value was defaulted to a league baseline (missing data)
  proxy?: boolean;       // value is an approximation, not a directly-measured stat
}

export interface DataQuality {
  complete: boolean;           // false → some inputs (e.g. opponent defense) missing
  neutralFactorIds: string[];  // which factors fell back to a baseline
}

export interface Pick {
  rank: number;
  playerId: number;
  playerName: string;
  team: string;
  matchup: string;
  score: number;
  scoreLabel: string;
  signals: string[];
  factors?: PickFactor[];            // structured per-factor breakdown (player props only)
  dataQuality?: DataQuality;         // data-completeness flags for this pick
  marketPct: number | null;          // OG implied probability, 0..1
  marketOddsAmerican: number | null; // Yes-side American odds (-110, +260, ...)
  marketLine: string | null;         // Pre-formatted "15% / +566" label for card display
  marketOverLine: number | null;     // OG over/under threshold value (e.g. 1.5 TB, 5.5 K). null for binary (HR/Hit)
  lineupProjected: boolean;
  weatherSummary: string | null;
  result?: PickResult;
}

export interface CategoryBlock {
  category: Category;
  title: string;
  picks: Pick[];
  leaderboardImage: string;
  leaderboardImageAmerican?: string;   // alternate render with American odds (player props only)
  leaderboardSettledImage?: string;
  highlightImages: string[];
  highlightSettledImages?: string[];
}

export type League = "nfl";

export interface GameSummary {
  gamePk: number;
  awayAbbrev: string;
  homeAbbrev: string;
  awayName: string;
  homeName: string;
  gameDateIso: string;
  venueName: string;
  ogUrl: string | null;
  modelTotalRuns: number;
  marketLine: number | null;        // OG's total line
  marketOverOdds: number | null;
  marketUnderOdds: number | null;
  cardImage: string;                // file name in R2 (relative)
}

export interface DailyPayload {
  league: League;
  date: string;
  generatedAtIso: string;
  gameCount: number;
  categories: Record<Category, CategoryBlock>;
  games: GameSummary[];
  renderScope: "full" | "leaderboards-only";
  notes: string[];
}

export interface Env {
  HAILMARY_KV: KVNamespace;
  HAILMARY_ASSETS: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_KEY: string;
  OG_API_KEY: string;
  RESEND_API_KEY: string;
}
