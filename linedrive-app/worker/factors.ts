import type { PlayerCategory, Pick } from "./types";

// ---------------------------------------------------------------------------
// Factor registry — the source of truth for which scoring factors exist, what
// they're called, which prop categories use them, and how their raw value is
// formatted for the table. Prose explanations live frontend-side in
// src/factors.js (keyed by the same `id`); the worker never needs them.
//
// The `id` strings are the contract between the scorers (which emit
// PickFactor[] on each Pick) and the frontend table/explainer pages.
// ---------------------------------------------------------------------------

export type FactorDirection = "higher-better" | "lower-better";

export interface FactorDef {
  id: string;
  column: string;                 // short table header, e.g. "Park"
  name: string;                   // full name, e.g. "Park HR Factor"
  categories: PlayerCategory[];   // which categories show this factor
  direction: FactorDirection;
  keyColumn?: boolean;            // surfaced on mobile (highest-signal factors)
  format: (v: number) => string; // raw value → PickFactor.display
}

// Batting-average-style formatter: ".241" (drop leading zero, 3 decimals).
function avg3(v: number): string {
  return v.toFixed(3).replace(/^0/, "").replace(/^-0/, "-");
}

export const FACTORS: Record<string, FactorDef> = {
  iso: {
    id: "iso",
    column: "ISO",
    name: "Isolated Power",
    categories: ["hr", "tb", "rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  xSlg: {
    id: "xSlg",
    column: "xSLG",
    name: "Expected Slugging",
    categories: ["hr", "tb", "rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  xBa: {
    id: "xBa",
    column: "xBA",
    name: "Expected Batting Average",
    categories: ["hit"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  xwoba: {
    id: "xwoba",
    column: "xwOBA",
    name: "Expected Weighted On-Base Average",
    categories: ["hit", "tb", "rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  ba30d: {
    id: "ba30d",
    column: "BA (30d)",
    name: "Batting Average, Last 30 Days",
    categories: ["hit"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  recentHr: {
    id: "recentHr",
    column: "HR (30d)",
    name: "Home Runs, Last 30 Days",
    categories: ["hr"],
    direction: "higher-better",
    format: (v) => `${Math.round(v)}`,
  },
  barrelRate: {
    id: "barrelRate",
    column: "Barrel%",
    name: "Barrel Rate",
    categories: ["hr"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  hardHitPct: {
    id: "hardHitPct",
    column: "HardHit%",
    name: "Hard-Hit Rate",
    categories: ["tb"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  whiffPct: {
    id: "whiffPct",
    column: "Whiff%",
    name: "Swinging-Strike (Whiff) Rate",
    categories: ["k"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  pitcherHr9: {
    id: "pitcherHr9",
    column: "SP HR/9",
    name: "Opposing Pitcher HR/9",
    categories: ["hr"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => v.toFixed(2),
  },
  pitcherXBaAgainst: {
    id: "pitcherXBaAgainst",
    column: "SP xBA",
    name: "Opposing Pitcher xBA Against",
    categories: ["hit", "rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  pitcherXSlgAgainst: {
    id: "pitcherXSlgAgainst",
    column: "SP xSLG",
    name: "Opposing Pitcher xSLG Against",
    categories: ["tb"],
    direction: "higher-better",
    keyColumn: true,
    format: avg3,
  },
  parkHr: {
    id: "parkHr",
    column: "Park",
    name: "Park HR Factor",
    categories: ["hr", "hit", "tb", "rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => `${Math.round(v)}`,
  },
  windCarry: {
    id: "windCarry",
    column: "Wind",
    name: "Wind Carry",
    categories: ["hr"],
    direction: "higher-better",
    format: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
  },
  handedness: {
    id: "handedness",
    column: "Platoon",
    name: "Platoon (Batter vs Pitcher Hand)",
    categories: ["hr", "hit", "tb", "rbi"],
    direction: "higher-better",
    format: (v) => (v > 0 ? "Fav" : v < 0 ? "Unfav" : "—"),
  },
  lineupSlot: {
    id: "lineupSlot",
    column: "Slot",
    name: "Lineup Slot",
    categories: ["hit", "tb"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => (v >= 1 && v <= 9 ? `#${Math.round(v)}` : "—"),
  },
  lineupRbi: {
    id: "lineupRbi",
    column: "Slot",
    name: "Lineup Slot (RBI Opportunity)",
    categories: ["rbi"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => (v >= 1 && v <= 9 ? `#${Math.round(v)}` : "—"),
  },
  kRate: {
    id: "kRate",
    column: "K/9",
    name: "Pitcher K/9",
    categories: ["k"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => v.toFixed(1),
  },
  expectedIp: {
    id: "expectedIp",
    column: "xIP",
    name: "Expected Innings Pitched",
    categories: ["k", "outs"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => v.toFixed(1),
  },
  oppKRate: {
    id: "oppKRate",
    column: "Opp K%",
    name: "Opponent Strikeout Rate (vs League)",
    categories: ["k"],
    direction: "higher-better",
    keyColumn: true,
    format: (v) => `${v >= 1 ? "+" : ""}${((v - 1) * 100).toFixed(0)}%`,
  },
  parkK: {
    id: "parkK",
    column: "Park K",
    name: "Park Strikeout Factor",
    categories: ["k"],
    direction: "higher-better",
    format: (v) => `${Math.round(v)}`,
  },
};

// Factors for a category, in registry (column) order.
export function factorsForCategory(category: PlayerCategory): FactorDef[] {
  return Object.values(FACTORS).filter((f) => f.categories.includes(category));
}

// Top-N factors for a pick as compact "Label value" chips (e.g. "Barrel% 20.2%",
// "Park 119"), highest |contribution| first. Used by the social PNGs so they
// reflect the same structured factors as the web table. Skips baseline-fallback
// (neutral) factors; for multiplicative scorers (K/Outs, all contribution 0)
// keeps registry order. Falls back to legacy signals for picks with no factors
// (game totals) or when every factor is neutral.
export function topFactorChips(pick: Pick, n: number): string[] {
  const factors = (pick.factors ?? []).filter((f) => !f.neutral);
  if (!factors.length) return pick.signals.slice(0, n);
  const hasContrib = factors.some((f) => f.contribution !== 0);
  const ordered = hasContrib
    ? [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    : factors;
  return ordered.slice(0, n).map((f) => `${FACTORS[f.id]?.column ?? f.id} ${f.display}`);
}
