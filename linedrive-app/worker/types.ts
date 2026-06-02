export type Handedness = "L" | "R" | "S";

export interface ParkInfo {
  venueId: number;
  name: string;
  city: string;
  lat: number;
  lon: number;
  hrFactor: number;
  kFactor: number;
  cfBearingDegrees: number;
  isDome: boolean;
}

export interface WeatherSnapshot {
  windSpeedMph: number;
  windDirectionDegrees: number;
  temperatureF: number;
  shortForecast: string;
  startTimeIso: string;
}

export interface ScheduledGame {
  gamePk: number;
  gameDateIso: string;
  venueId: number;
  venueName: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  homeProbablePitcher: PlayerRef | null;
  awayProbablePitcher: PlayerRef | null;
}

export interface TeamRef {
  id: number;
  name: string;
  abbreviation: string;
}

export interface PlayerRef {
  id: number;
  fullName: string;
}

export interface BatterStats {
  playerId: number;
  fullName: string;
  team: TeamRef;
  bats: Handedness;

  paSeason: number;
  ba30d: number | null;
  hrLast30: number;
  isoSeason: number | null;
  hrPerPaSeason: number | null;
  xBaSeason: number | null;
  xSlgSeason: number | null;
  xwObaSeason: number | null;
}

export interface PitcherStats {
  playerId: number;
  fullName: string;
  team: TeamRef;
  throws: Handedness;

  ipSeason: number;
  k9Season: number | null;
  k9Last30: number | null;
  hr9Season: number | null;
  xBaAgainstSeason: number | null;
  expectedIp: number;
}

export interface VsPitcherCareer {
  ab: number;
  h: number;
  hr: number;
  k: number;
  bb: number;
}

export interface BatterContext {
  batter: BatterStats;
  opponentPitcher: PitcherStats | null;
  park: ParkInfo;
  weather: WeatherSnapshot | null;
  lineupSlot: number | null;
  lineupProjected: boolean;
  vsPitcher?: VsPitcherCareer | null;
}

export interface PitcherContext {
  pitcher: PitcherStats;
  opponentTeamId: number;
  opponentTeamKPctRelLeague: number | null;
  park: ParkInfo;
  weather: WeatherSnapshot | null;
}

export type Category = "hr" | "hit" | "k" | "tb" | "rbi" | "outs" | "game";

export type PlayerCategory = "hr" | "hit" | "k" | "tb" | "rbi" | "outs";

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
  pitcherConfirmed: boolean;   // false → opponent SP unknown, pitcher factors neutral
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

export type League = "mlb";

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
  LINEDRIVE_KV: KVNamespace;
  LINEDRIVE_ASSETS: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_KEY: string;
  OG_API_KEY: string;
  RESEND_API_KEY: string;
}
