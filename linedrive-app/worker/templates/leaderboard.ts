import type { Category, Pick } from "../types";
import { h } from "./h";
import { COLORS, CATEGORY_ACCENT, FONT_DISPLAY, FONT_SANS } from "./theme";

function scoreLegend(category: Category): string {
  if (category === "k") return "Score = expected strikeouts. Higher = more K's.";
  if (category === "outs") return "Score = expected outs recorded. Higher = longer outing.";
  if (category === "game") return "Score = expected total runs. Higher = more scoring.";
  return "Score = z-score composite (0 = league average, +1 ≈ one stdev above).";
}

export interface LeaderboardProps {
  category: Category;
  title: string;
  picks: Pick[];
  dateLabel: string;
  logoDataUrl: string | null;
}

const WIDTH = 1080;
const HEIGHT = 1350;

export function leaderboardNode(props: LeaderboardProps) {
  const accent = CATEGORY_ACCENT[props.category];
  const rows = props.picks.slice(0, 10);

  return h(
    "div",
    {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT_SANS,
        padding: 56,
        backgroundImage: `radial-gradient(circle at 85% -10%, ${accent.chipBg}40 0%, transparent 50%)`,
      },
    },
    // Header
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 26,
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        props.logoDataUrl
          ? h("img", { src: props.logoDataUrl, width: 180, height: 90 })
          : h("div", { style: { display: "flex", width: 0, height: 0 } }),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", marginLeft: 22 } },
          h(
            "div",
            { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 32, fontWeight: 800, letterSpacing: 1, color: COLORS.flame, lineHeight: 1 } },
            "LINEDRIVE",
          ),
          h(
            "div",
            { style: { display: "flex", fontFamily: FONT_SANS, fontSize: 18, color: COLORS.muted, letterSpacing: 3, marginTop: 6 } },
            "FIND YOUR EDGE",
          ),
        ),
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: COLORS.subtle } },
        `Date: ${props.dateLabel}`,
      ),
    ),
    // Title row
    h(
      "div",
      { style: { display: "flex", alignItems: "center", marginBottom: 14 } },
      h(
        "div",
        {
          style: {
            backgroundColor: accent.chipBg,
            color: accent.chipText,
            fontSize: 30,
            fontWeight: 800,
            fontFamily: FONT_DISPLAY,
            padding: "10px 22px",
            borderRadius: 999,
            letterSpacing: 1.2,
            display: "flex",
          },
        },
        accent.chip,
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginLeft: 22,
            fontFamily: FONT_DISPLAY,
            fontSize: 70,
            fontWeight: 800,
            letterSpacing: -1,
          },
        },
        props.title.toUpperCase(),
      ),
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginBottom: 14 } },
      h(
        "div",
        { style: { display: "flex", fontSize: 20, color: COLORS.subtle, letterSpacing: 1, fontWeight: 700 } },
        `TOP ${rows.length} RANKED BY MODEL SCORE`,
      ),
      h(
        "div",
        { style: { display: "flex", fontSize: 15, color: COLORS.muted, marginTop: 3 } },
        scoreLegend(props.category),
      ),
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      rows.map((p, i) => leaderboardRow(p, i, accent.rankColor)),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: "auto",
          paddingTop: 18,
          borderTop: `2px solid ${COLORS.rule}`,
          fontSize: 22,
          color: COLORS.flame,
          fontWeight: 700,
        },
      },
      h("div", { style: { display: "flex" } }, "FIND YOUR EDGE"),
    ),
  );
}

function leaderboardRow(p: Pick, i: number, accentColor: string) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        padding: "9px 18px",
        marginBottom: 3,
        backgroundColor: i % 2 === 0 ? COLORS.panel : "transparent",
        borderRadius: 12,
        border: i === 0 ? `1px solid ${accentColor}66` : "1px solid transparent",
      },
    },
    h(
      "div",
      {
        style: {
          width: 56,
          fontFamily: "FunnelDisplay",
          fontSize: 36,
          fontWeight: 800,
          color: i < 3 ? accentColor : COLORS.subtle,
          display: "flex",
        },
      },
      String(p.rank),
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", flexGrow: 1, paddingLeft: 8 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline" } },
        h(
          "div",
          { style: { fontFamily: "FunnelDisplay", fontSize: 28, fontWeight: 800, display: "flex", color: COLORS.text } },
          p.playerName,
        ),
        h(
          "div",
          { style: { fontSize: 18, color: COLORS.subtle, marginLeft: 12, display: "flex", fontWeight: 600 } },
          p.team ? `${p.team} · ${p.matchup}` : p.matchup,
        ),
      ),
      h(
        "div",
        { style: { fontSize: 16, color: COLORS.subtle, marginTop: 3, display: "flex" } },
        p.signals[0] ?? "",
      ),
    ),
    // Score column (model)
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center",
          width: 110,
          whiteSpace: "nowrap",
        },
      },
      h(
        "div",
        { style: { display: "flex", fontSize: 12, color: COLORS.muted, letterSpacing: 1 } },
        "SCORE",
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontFamily: "FunnelDisplay",
            fontSize: 26,
            fontWeight: 800,
            color: COLORS.sunset,
            marginTop: 2,
          },
        },
        p.scoreLabel,
      ),
    ),
    // OG market column
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center",
          width: 110,
          marginLeft: 14,
          whiteSpace: "nowrap",
        },
      },
      h(
        "div",
        { style: { display: "flex", fontSize: 12, color: COLORS.muted, letterSpacing: 1 } },
        "OG",
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontFamily: "FunnelDisplay",
            fontSize: 26,
            fontWeight: 800,
            color: p.marketLine ? COLORS.flame : COLORS.muted,
            marginTop: 2,
          },
        },
        p.marketLine ? p.marketLine.split(" / ")[0] : "—",
      ),
    ),
  );
}
