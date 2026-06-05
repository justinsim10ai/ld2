import type { ScheduledGame, PlayerRef, TeamRef } from "../types";
import { fetchJson } from "./http";

interface ScheduleResponse {
  dates: Array<{
    date: string;
    games: ScheduleGameRaw[];
  }>;
}

interface ScheduleGameRaw {
  gamePk: number;
  gameDate: string;
  status?: { detailedState?: string; abstractGameState?: string };
  venue: { id: number; name: string };
  teams: {
    away: ScheduleTeamRaw;
    home: ScheduleTeamRaw;
  };
}

interface ScheduleTeamRaw {
  team: { id: number; name: string; abbreviation?: string };
  probablePitcher?: { id: number; fullName: string };
}

export async function fetchTodaysGames(dateIso: string): Promise<ScheduledGame[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1` +
    `&date=${encodeURIComponent(dateIso)}` +
    `&hydrate=lineups,probablePitcher,venue,team`;
  const data = await fetchJson<ScheduleResponse>(url);
  const games: ScheduledGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      const state = g.status?.abstractGameState;
      if (state === "Final") continue;
      games.push({
        gamePk: g.gamePk,
        gameDateIso: g.gameDate,
        venueId: g.venue.id,
        venueName: g.venue.name,
        homeTeam: toTeamRef(g.teams.home),
        awayTeam: toTeamRef(g.teams.away),
        homeProbablePitcher: toPlayerRef(g.teams.home.probablePitcher),
        awayProbablePitcher: toPlayerRef(g.teams.away.probablePitcher),
      });
    }
  }
  return games;
}

function toTeamRef(raw: ScheduleTeamRaw): TeamRef {
  return {
    id: raw.team.id,
    name: raw.team.name,
    abbreviation: raw.team.abbreviation ?? deriveAbbrev(raw.team.name),
  };
}

function toPlayerRef(raw: ScheduleTeamRaw["probablePitcher"]): PlayerRef | null {
  if (!raw) return null;
  return { id: raw.id, fullName: raw.fullName };
}

function deriveAbbrev(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export interface BoxscoreLineup {
  homeBatters: number[];
  awayBatters: number[];
  homeProjected: boolean;
  awayProjected: boolean;
}

interface BoxscoreResponse {
  teams: {
    home: { batters?: number[]; battingOrder?: number[] };
    away: { batters?: number[]; battingOrder?: number[] };
  };
}

export async function fetchLineupForGame(gamePk: number): Promise<BoxscoreLineup> {
  const url = `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`;
  try {
    const data = await fetchJson<BoxscoreResponse>(url, { retries: 1, timeoutMs: 6000 });
    const home = data.teams?.home;
    const away = data.teams?.away;
    return {
      homeBatters: home?.battingOrder ?? [],
      awayBatters: away?.battingOrder ?? [],
      homeProjected: !(home?.battingOrder && home.battingOrder.length >= 9),
      awayProjected: !(away?.battingOrder && away.battingOrder.length >= 9),
    };
  } catch {
    return { homeBatters: [], awayBatters: [], homeProjected: true, awayProjected: true };
  }
}

export interface RosterPlayer {
  playerId: number;
  fullName: string;
  position: string;
}

interface RosterResponse {
  roster: Array<{
    person: { id: number; fullName: string };
    position: { code: string; abbreviation: string };
  }>;
}

export async function fetchTeamActiveRoster(teamId: number): Promise<RosterPlayer[]> {
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`;
  try {
    const data = await fetchJson<RosterResponse>(url);
    return (data.roster ?? []).map((r) => ({
      playerId: r.person.id,
      fullName: r.person.fullName,
      position: r.position?.abbreviation ?? r.position?.code ?? "",
    }));
  } catch {
    return [];
  }
}
