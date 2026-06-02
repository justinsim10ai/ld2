import type { PlayerCategory, Pick } from "./types";

// ---------------------------------------------------------------------------
// Factor registry — the source of truth for which scoring factors exist, what
// they're called, and which prop categories use them. Prose explanations live
// frontend-side in src/factors.js (keyed by the same `id`).
//
// The `id` strings are the contract between the scorers (which emit
// PickFactor[] on each Pick) and the frontend table/explainer pages.
// ---------------------------------------------------------------------------

export type FactorDirection = "higher-better" | "lower-better";

export interface FactorDef {
  id: string;
  column: string;                 // short table header
  name: string;                   // full name
  categories: PlayerCategory[];   // which categories show this factor
  direction: FactorDirection;
  keyColumn?: boolean;            // surfaced on mobile (highest-signal factors)
  format: (v: number) => string;  // raw value → display (used by factor-page leaders)
}

const yds = (v: number) => `${Math.round(v)} yd`;
const one = (v: number) => v.toFixed(1);
const two = (v: number) => v.toFixed(2);
const pctShare = (v: number) => `${Math.round(v * 100)}%`;

export const FACTORS: Record<string, FactorDef> = {
  // passing
  passYds: { id: "passYds", column: "Pass Y/G", name: "Passing Yards / Game", categories: ["pass_yds", "pass_td"], direction: "higher-better", keyColumn: true, format: yds },
  passAtt: { id: "passAtt", column: "Att/G", name: "Pass Attempts / Game", categories: ["pass_yds"], direction: "higher-better", format: one },
  passAirYds: { id: "passAirYds", column: "Air Y/G", name: "Passing Air Yards / Game", categories: ["pass_yds"], direction: "higher-better", format: yds },
  passTd: { id: "passTd", column: "Pass TD/G", name: "Passing TDs / Game", categories: ["pass_td"], direction: "higher-better", keyColumn: true, format: two },
  oppPassDef: { id: "oppPassDef", column: "Opp Pass D", name: "Opponent Pass Yards Allowed / Game", categories: ["pass_yds", "rec_yds"], direction: "higher-better", keyColumn: true, format: yds },
  oppPassTdDef: { id: "oppPassTdDef", column: "Opp PaTD", name: "Opponent Pass TDs Allowed / Game", categories: ["pass_td"], direction: "higher-better", keyColumn: true, format: two },
  // rushing
  rushYds: { id: "rushYds", column: "Rush Y/G", name: "Rushing Yards / Game", categories: ["rush_yds"], direction: "higher-better", keyColumn: true, format: yds },
  carries: { id: "carries", column: "Carries/G", name: "Carries / Game", categories: ["rush_yds"], direction: "higher-better", keyColumn: true, format: one },
  oppRushDef: { id: "oppRushDef", column: "Opp Run D", name: "Opponent Rush Yards Allowed / Game", categories: ["rush_yds"], direction: "higher-better", keyColumn: true, format: yds },
  gameScript: { id: "gameScript", column: "Spread", name: "Game Script (Favored By)", categories: ["rush_yds"], direction: "higher-better", format: (v) => `${v.toFixed(0)}` },
  // receiving
  recYds: { id: "recYds", column: "Rec Y/G", name: "Receiving Yards / Game", categories: ["rec_yds"], direction: "higher-better", keyColumn: true, format: yds },
  receptions: { id: "receptions", column: "Rec/G", name: "Receptions / Game", categories: ["rec"], direction: "higher-better", keyColumn: true, format: one },
  targets: { id: "targets", column: "Tgts/G", name: "Targets / Game", categories: ["rec"], direction: "higher-better", keyColumn: true, format: one },
  targetShare: { id: "targetShare", column: "Tgt%", name: "Target Share", categories: ["rec_yds", "rec"], direction: "higher-better", keyColumn: true, format: pctShare },
  airYardsShare: { id: "airYardsShare", column: "AY%", name: "Air Yards Share", categories: ["rec_yds"], direction: "higher-better", format: pctShare },
  wopr: { id: "wopr", column: "WOPR", name: "Weighted Opportunity Rating", categories: ["rec_yds", "rec"], direction: "higher-better", format: two },
  oppRecDef: { id: "oppRecDef", column: "Opp Rec", name: "Opponent Receptions Allowed / Game", categories: ["rec"], direction: "higher-better", format: one },
  // anytime TD
  anytimeTd: { id: "anytimeTd", column: "TD/G", name: "Anytime TDs / Game", categories: ["atd"], direction: "higher-better", keyColumn: true, format: two },
  oppTdDef: { id: "oppTdDef", column: "Opp TD D", name: "Opponent TDs Allowed / Game", categories: ["atd"], direction: "higher-better", keyColumn: true, format: two },
  volume: { id: "volume", column: "Touches", name: "Touches + Targets / Game", categories: ["atd"], direction: "higher-better", format: one },
  involvement: { id: "involvement", column: "Yds/G", name: "Total Yards / Game", categories: ["atd"], direction: "higher-better", format: yds },
  // shared game environment
  impliedTotal: { id: "impliedTotal", column: "Tm Total", name: "Implied Team Total", categories: ["pass_yds", "pass_td", "rush_yds", "rec_yds", "atd"], direction: "higher-better", keyColumn: true, format: one },
};

// Factors for a category, in registry order.
export function factorsForCategory(category: PlayerCategory): FactorDef[] {
  return Object.values(FACTORS).filter((f) => f.categories.includes(category));
}

// Top-N factors for a pick as compact "Label value" chips, highest |contribution|
// first; skips neutral fallbacks. Used by the social PNGs. Falls back to the
// pick's signals (e.g. game totals, which have no factors).
export function topFactorChips(pick: Pick, n: number): string[] {
  const factors = (pick.factors ?? []).filter((f) => !f.neutral);
  if (!factors.length) return pick.signals.slice(0, n);
  const ordered = [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return ordered.slice(0, n).map((f) => `${FACTORS[f.id]?.column ?? f.id} ${f.display}`);
}
