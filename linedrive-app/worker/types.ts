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

export interface Pick {
  rank: number;
  playerId: number;
  playerName: string;
  team: string;
  matchup: string;
  score: number;
  scoreLabel: string;
  signals: string[];
  marketPct: number | null;          // OG implied probability, 0..1
  marketOddsAmerican: number | null; // Yes-side American odds (-110, +260, ...)
  marketLine: string | null;         // Pre-formatted "15% / +566" label for card display
  lineupProjected: boolean;
  weatherSummary: string | null;
}

export interface CategoryBlock {
  category: Category;
  title: string;
  picks: Pick[];
  leaderboardImage: string;
  highlightImages: string[];
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
}
