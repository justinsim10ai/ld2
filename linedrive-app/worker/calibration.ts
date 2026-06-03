import type { Env, League, DailyPayload, PlayerCategory } from "./types";
import { readArchiveIndex } from "./pipeline";
import { pLimit } from "./sources/http";

// Calibration maps a category's raw model score → an empirical hit probability,
// learned from settled results in the archive via a simple logistic fit
// p = sigmoid(a + b·z), where z is the standardized score. This turns the
// abstract composite ("+1.43") into "~28% to hit", makes the ranking meaningful
// (higher score → higher prob when b>0), and lets us compute a true edge vs the
// market (modelProb − marketPct). Refit as the archive grows.

const PLAYER_CATEGORIES: PlayerCategory[] = ["hr", "hit", "k", "tb", "rbi", "outs"];
const MIN_SAMPLE = 40; // below this, a category stays uncalibrated (too noisy)
const KV_KEY = (league: League) => `calibration:${league}`;

export interface CatCalibration { mean: number; sd: number; a: number; b: number; n: number; baseRate: number; }
export type Calibration = Partial<Record<PlayerCategory, CatCalibration>>;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampProb = (p: number) => Math.min(0.99, Math.max(0.01, p));

// Fit p = sigmoid(a + b·z) by gradient descent on standardized scores.
function fitLogistic(scores: number[], hits: number[]): CatCalibration | null {
  const n = scores.length;
  if (n < MIN_SAMPLE) return null;
  const mean = scores.reduce((s, v) => s + v, 0) / n;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance) || 1;
  const z = scores.map((v) => (v - mean) / sd);
  const baseRate = hits.reduce((s, v) => s + v, 0) / n;

  let a = Math.log(baseRate / (1 - baseRate || 1e-3)); // logit(base rate)
  let b = 0;
  const lr = 0.3;
  for (let iter = 0; iter < 500; iter++) {
    let ga = 0, gb = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a + b * z[i]);
      const err = p - hits[i];
      ga += err; gb += err * z[i];
    }
    a -= (lr * ga) / n;
    b -= (lr * gb) / n;
  }
  return { mean, sd, a, b, n, baseRate };
}

const TRUST_N = 60;      // need this many settled picks before trusting the slope
const TRUST_SLOPE = 0.05; // and a positive, non-trivial score→hit relationship

// Calibrated hit probability for a pick's score. Only uses the per-pick slope
// when the fit is trustworthy (enough sample + positive direction); otherwise
// returns the category base rate — an honest "we can't rank within this
// category yet". Returns null when the category is uncalibrated.
export function applyCalibration(score: number, cal: CatCalibration | undefined): number | null {
  if (!cal) return null;
  if (cal.n < TRUST_N || cal.b <= TRUST_SLOPE) return Math.round(cal.baseRate * 1000) / 1000;
  const zz = (score - cal.mean) / (cal.sd || 1);
  return Math.round(clampProb(sigmoid(cal.a + cal.b * zz)) * 1000) / 1000;
}

export async function computeCalibration(env: Env, league: League): Promise<Calibration> {
  const dates = await readArchiveIndex(env, league);
  const entries = await pLimit(dates, 10, async (date) => {
    const raw = await env.LINEDRIVE_KV.get(`r:${league}:${date}`);
    return raw ? (JSON.parse(raw) as DailyPayload) : null;
  });
  const byCat: Record<string, { scores: number[]; hits: number[] }> = {};
  for (const c of PLAYER_CATEGORIES) byCat[c] = { scores: [], hits: [] };

  for (const payload of entries) {
    if (!payload?.categories) continue;
    for (const c of PLAYER_CATEGORIES) {
      const block = payload.categories[c];
      if (!block) continue;
      for (const p of block.picks) {
        const r = p.result;
        if (!r || !r.finalized || !r.hadGame) continue;
        byCat[c].scores.push(p.score);
        byCat[c].hits.push(r.hit ? 1 : 0);
      }
    }
  }

  const cal: Calibration = {};
  for (const c of PLAYER_CATEGORIES) {
    const fit = fitLogistic(byCat[c].scores, byCat[c].hits);
    if (fit) cal[c] = fit;
  }
  return cal;
}

export async function storeCalibration(env: Env, league: League, cal: Calibration): Promise<void> {
  await env.LINEDRIVE_KV.put(KV_KEY(league), JSON.stringify(cal));
}

export async function readCalibration(env: Env, league: League): Promise<Calibration> {
  const raw = await env.LINEDRIVE_KV.get(KV_KEY(league));
  if (!raw) return {};
  try { return JSON.parse(raw) as Calibration; } catch { return {}; }
}
