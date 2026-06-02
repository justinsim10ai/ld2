import type { Category } from "../types";

// OG.com brand palette
export const COLORS = {
  white: "#FFFFFF",
  black: "#000000",
  sunset: "#FFB900",
  flame: "#F96200",
  indigo: "#121B38",
  cloud: "#FCF1EB",
  solace: "#B6D1E6",
  midnight: "#07081D",

  bg: "#07081D",
  panel: "#121B38",
  panelAlt: "#1A2447",
  text: "#FCF1EB",
  // Higher contrast: previously rgba(...0.62) felt muddy on the leaderboard rows.
  subtle: "rgba(252, 241, 235, 0.92)",
  muted: "rgba(182, 209, 230, 0.72)",
  rule: "rgba(182, 209, 230, 0.14)",
  accent: "#F96200",
  accent2: "#FFB900",
};

export const CATEGORY_ACCENT: Record<Category, { chipBg: string; chipText: string; rankColor: string; chip: string }> = {
  hr:   { chipBg: "#F96200", chipText: "#07081D", rankColor: "#F96200", chip: "HR" },
  hit:  { chipBg: "#B6D1E6", chipText: "#07081D", rankColor: "#B6D1E6", chip: "HIT" },
  k:    { chipBg: "#FFB900", chipText: "#07081D", rankColor: "#FFB900", chip: "K" },
  tb:   { chipBg: "#FF8B36", chipText: "#07081D", rankColor: "#FF8B36", chip: "TB" },
  rbi:  { chipBg: "#E95E5E", chipText: "#07081D", rankColor: "#E95E5E", chip: "RBI" },
  outs: { chipBg: "#FFD566", chipText: "#07081D", rankColor: "#FFD566", chip: "OUTS" },
  game: { chipBg: "#7AE3B8", chipText: "#07081D", rankColor: "#7AE3B8", chip: "GAME" },
};

export const FONT_DISPLAY = "FunnelDisplay";
export const FONT_SANS = "FunnelSans";
