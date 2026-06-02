import { parseCsv } from "./http";
import type { Env, PlayerSeasonStats, TeamDefenseStats, Position } from "../types";

// nflverse stats_player_week_<season>.csv → season-aggregated per-game player
// rates + per-defense allowances. Fetched off-worker (GitHub Action) and POSTed
// to /admin/nfl-stats, which parses + aggregates here and stores JSON in KV.
// The pipeline reads it back via readPlayerStats(). Mirrors the savant pattern.

const KV_PLAYERS = "nfl:players";
const KV_DEFENSE = "nfl:defense";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function num(v: string | undefined): number {
  if (v == null || v === "" || v === "NA") return 0;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : 0;
}
function asPosition(p: string | undefined): Position {
  return (["QB", "RB", "WR", "TE", "FB"] as const).includes(p as Position) ? (p as Position) : "OTHER";
}

interface PlayerAcc {
  id: string; name: string; position: Position; team: string; latestWeek: number;
  weeks: Set<number>; sum: Record<string, number>;
}
interface DefAcc { team: string; weeks: Set<number>; sum: Record<string, number>; }

export function aggregate(csv: string): {
  players: Record<string, PlayerSeasonStats>;
  defense: Record<string, TeamDefenseStats>;
} {
  const rows = parseCsv(csv).filter((r) => (r.season_type ?? "REG") === "REG");
  const P = new Map<string, PlayerAcc>();
  const D = new Map<string, DefAcc>();

  for (const r of rows) {
    const id = r.player_id;
    if (!id) continue;
    const wk = parseInt(r.week, 10) || 0;

    let p = P.get(id);
    if (!p) {
      p = { id, name: r.player_display_name || r.player_name || id, position: asPosition(r.position), team: r.team, latestWeek: -1, weeks: new Set(), sum: {} };
      P.set(id, p);
    }
    p.weeks.add(wk);
    if (wk >= p.latestWeek) { p.latestWeek = wk; p.team = r.team; }
    const padd = (k: string, col: string) => { p!.sum[k] = (p!.sum[k] ?? 0) + num(r[col]); };
    padd("passYds", "passing_yards"); padd("passTd", "passing_tds"); padd("att", "attempts");
    padd("int", "passing_interceptions"); padd("passAy", "passing_air_yards");
    padd("rushYds", "rushing_yards"); padd("carries", "carries"); padd("rushTd", "rushing_tds");
    padd("recYds", "receiving_yards"); padd("rec", "receptions"); padd("targets", "targets");
    padd("recTd", "receiving_tds"); padd("recAy", "receiving_air_yards");
    padd("targetShare", "target_share"); padd("airYardsShare", "air_yards_share"); padd("wopr", "wopr");

    const def = r.opponent_team; // the defense this stat line was recorded against
    if (def) {
      let d = D.get(def);
      if (!d) { d = { team: def, weeks: new Set(), sum: {} }; D.set(def, d); }
      d.weeks.add(wk);
      const dadd = (k: string, col: string) => { d!.sum[k] = (d!.sum[k] ?? 0) + num(r[col]); };
      dadd("passYds", "passing_yards"); dadd("rushYds", "rushing_yards");
      dadd("passTd", "passing_tds"); dadd("rushTd", "rushing_tds"); dadd("rec", "receptions");
    }
  }

  const players: Record<string, PlayerSeasonStats> = {};
  for (const p of P.values()) {
    const g = p.weeks.size || 1;
    players[p.id] = {
      playerId: p.id, name: p.name, position: p.position, team: p.team, games: g,
      passYdsPg: p.sum.passYds / g, passTdPg: p.sum.passTd / g, attPg: p.sum.att / g,
      intPg: p.sum.int / g, passAirYdsPg: p.sum.passAy / g,
      rushYdsPg: p.sum.rushYds / g, carriesPg: p.sum.carries / g, rushTdPg: p.sum.rushTd / g,
      recYdsPg: p.sum.recYds / g, recPg: p.sum.rec / g, targetsPg: p.sum.targets / g,
      recTdPg: p.sum.recTd / g, recAirYdsPg: p.sum.recAy / g,
      targetShare: p.sum.targetShare / g, airYardsShare: p.sum.airYardsShare / g, wopr: p.sum.wopr / g,
      anytimeTdPg: (p.sum.rushTd + p.sum.recTd) / g,
    };
  }

  const defense: Record<string, TeamDefenseStats> = {};
  for (const d of D.values()) {
    const g = d.weeks.size || 1;
    defense[d.team] = {
      team: d.team, games: g,
      passYdsAllowedPg: d.sum.passYds / g, rushYdsAllowedPg: d.sum.rushYds / g,
      passTdAllowedPg: d.sum.passTd / g, rushTdAllowedPg: d.sum.rushTd / g, recAllowedPg: d.sum.rec / g,
    };
  }
  return { players, defense };
}

export async function storePlayerStats(env: Env, csv: string): Promise<number> {
  const { players, defense } = aggregate(csv);
  const n = Object.keys(players).length;
  if (n === 0) return 0; // never overwrite good data with a bad upload
  await Promise.all([
    env.HAILMARY_KV.put(KV_PLAYERS, JSON.stringify(players), { expirationTtl: TTL_SECONDS }),
    env.HAILMARY_KV.put(KV_DEFENSE, JSON.stringify(defense), { expirationTtl: TTL_SECONDS }),
  ]);
  return n;
}

export async function readPlayerStats(env: Env): Promise<{
  players: Record<string, PlayerSeasonStats>;
  defense: Record<string, TeamDefenseStats>;
}> {
  const [p, d] = await Promise.all([env.HAILMARY_KV.get(KV_PLAYERS), env.HAILMARY_KV.get(KV_DEFENSE)]);
  return {
    players: p ? (JSON.parse(p) as Record<string, PlayerSeasonStats>) : {},
    defense: d ? (JSON.parse(d) as Record<string, TeamDefenseStats>) : {},
  };
}
