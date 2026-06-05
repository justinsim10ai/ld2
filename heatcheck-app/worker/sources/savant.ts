import { parseCsv } from "./http";
import type { Env } from "../types";

// Baseball Savant (Statcast) data — barrel%/hard-hit% for batters, whiff% for
// pitchers. Savant blocks Cloudflare Worker egress (returns header-only CSV),
// so the CSVs are fetched OFF-worker by a scheduled job on a normal IP (see
// .github/workflows/savant.yml) and POSTed to /admin/savant, which parses and
// stores them here in KV. The daily pipeline reads them back via readSavant().

const KV_BATTERS = "savant:batters";
const KV_PITCHERS = "savant:pitchers";
// Season-to-date stats refreshed daily; expire after 5 days so a stalled
// uploader degrades to neutral rather than serving very stale numbers.
const TTL_SECONDS = 60 * 60 * 24 * 5;

export interface SavantBatter {
  barrelRate: number | null; // barrel_batted_rate, % of batted balls barreled
  hardHitPct: number | null; // hard_hit_percent, % of BBE with EV >= 95 mph
  bestSpeed: number | null;  // avg_best_speed, avg EV of hardest ~50% of BBE (mph)
}

export interface SavantPitcher {
  whiffPct: number | null;   // whiff_percent, whiffs per swing
  kPct: number | null;       // k_percent
}

function n(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}

// Parse an uploaded savant CSV (custom leaderboard export) into an id→fields map.
function parseBatterCsv(csv: string): Record<string, SavantBatter> {
  const out: Record<string, SavantBatter> = {};
  for (const r of parseCsv(csv)) {
    const id = r["player_id"];
    if (!id || !/^\d+$/.test(id)) continue;
    out[id] = {
      barrelRate: n(r["barrel_batted_rate"]),
      hardHitPct: n(r["hard_hit_percent"]),
      bestSpeed: n(r["avg_best_speed"]),
    };
  }
  return out;
}

function parsePitcherCsv(csv: string): Record<string, SavantPitcher> {
  const out: Record<string, SavantPitcher> = {};
  for (const r of parseCsv(csv)) {
    const id = r["player_id"];
    if (!id || !/^\d+$/.test(id)) continue;
    out[id] = {
      whiffPct: n(r["whiff_percent"]),
      kPct: n(r["k_percent"]),
    };
  }
  return out;
}

// Ingest: parse a posted CSV and persist the compact map to KV. Returns the
// number of players stored (0 → almost certainly a bad/blocked upload).
export async function storeSavantCsv(env: Env, type: "batters" | "pitchers", csv: string): Promise<number> {
  const map = type === "batters" ? parseBatterCsv(csv) : parsePitcherCsv(csv);
  const count = Object.keys(map).length;
  if (count === 0) return 0; // never overwrite good data with an empty upload
  const key = type === "batters" ? KV_BATTERS : KV_PITCHERS;
  await env.LINEDRIVE_KV.put(key, JSON.stringify(map), { expirationTtl: TTL_SECONDS });
  return count;
}

// Read both maps back for the pipeline. Empty maps when nothing's been uploaded
// (or it expired) — scorers then fall back to neutral.
export async function readSavant(env: Env): Promise<{
  batters: Map<number, SavantBatter>;
  pitchers: Map<number, SavantPitcher>;
}> {
  const [b, p] = await Promise.all([
    env.LINEDRIVE_KV.get(KV_BATTERS),
    env.LINEDRIVE_KV.get(KV_PITCHERS),
  ]);
  const batters = new Map<number, SavantBatter>();
  const pitchers = new Map<number, SavantPitcher>();
  if (b) for (const [id, v] of Object.entries(JSON.parse(b) as Record<string, SavantBatter>)) batters.set(parseInt(id, 10), v);
  if (p) for (const [id, v] of Object.entries(JSON.parse(p) as Record<string, SavantPitcher>)) pitchers.set(parseInt(id, 10), v);
  return { batters, pitchers };
}
