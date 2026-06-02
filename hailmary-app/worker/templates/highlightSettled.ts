import type { Category, Pick } from "../types";
import { h } from "./h";
import { COLORS, CATEGORY_ACCENT, FONT_DISPLAY, FONT_SANS } from "./theme";

export interface SettledHighlightProps {
  category: Category;
  title: string;
  pick: Pick;
  dateLabel: string;
  logoDataUrl: string | null;
}

const SIZE = 1080;

// Result palette
const WIN_BG = "#1F7A4D";
const WIN_TEXT = "#E9FBF1";
const MISS_BG = "#9B2A2A";
const MISS_TEXT = "#FBE7E7";
const DNP_BG = "#4A4F66";
const DNP_TEXT = "#D8DEF0";

export function highlightSettledNode(props: SettledHighlightProps) {
  const accent = CATEGORY_ACCENT[props.category];
  const p = props.pick;
  const r = p.result;
  const outcome = outcomeKind(p);
  const pillBg =
    outcome === "win" ? WIN_BG :
    outcome === "miss" ? MISS_BG : DNP_BG;
  const pillText =
    outcome === "win" ? WIN_TEXT :
    outcome === "miss" ? MISS_TEXT : DNP_TEXT;
  const pillLabel =
    outcome === "win" ? "WIN" :
    outcome === "miss" ? "MISS" : "DNP";
  const oddsLabel = americanLabel(p.marketOddsAmerican);
  const payoutLabel = payoutLabelFor(p, outcome);

  return h(
    "div",
    {
      style: {
        width: SIZE,
        height: SIZE,
        display: "flex",
        flexDirection: "column",
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT_SANS,
        padding: 60,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${accent.chipBg}44 0%, transparent 55%)`,
      },
    },
    // Brand strip (identical to original highlight)
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        props.logoDataUrl
          ? h("img", { src: props.logoDataUrl, width: 160, height: 80 })
          : h("div", { style: { display: "flex", width: 0, height: 0 } }),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", marginLeft: 20 } },
          h("div", { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 800, color: COLORS.flame, letterSpacing: 1, lineHeight: 1 } }, "LINEDRIVE"),
          h("div", { style: { display: "flex", fontFamily: FONT_SANS, fontSize: 17, color: COLORS.muted, letterSpacing: 3, marginTop: 6 } }, "SETTLED"),
        ),
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        h(
          "div",
          {
            style: {
              backgroundColor: accent.chipBg,
              color: accent.chipText,
              fontFamily: FONT_DISPLAY,
              fontSize: 26,
              fontWeight: 800,
              padding: "8px 18px",
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
              marginLeft: 14,
              fontFamily: FONT_DISPLAY,
              fontSize: 30,
              fontWeight: 800,
              color: COLORS.muted,
            },
          },
          `#${p.rank}`,
        ),
      ),
    ),

    // Player block (same as original)
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginBottom: 28 } },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontFamily: FONT_DISPLAY,
            fontSize: 100,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: -2,
          },
        },
        p.playerName,
      ),
      h(
        "div",
        { style: { display: "flex", fontSize: 32, color: COLORS.muted, marginTop: 12 } },
        `${p.team} · ${p.matchup}`,
      ),
    ),

    // Result panel: pill (WIN/MISS/DNP) + big stat display
    h(
      "div",
      {
        style: {
          backgroundColor: COLORS.panel,
          borderRadius: 22,
          padding: "26px 32px",
          display: "flex",
          alignItems: "center",
          marginBottom: 26,
          border: `1px solid ${COLORS.rule}`,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: pillBg,
            color: pillText,
            fontFamily: FONT_DISPLAY,
            fontSize: 46,
            fontWeight: 800,
            letterSpacing: 2,
            padding: "10px 28px",
            borderRadius: 14,
          },
        },
        pillLabel,
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginLeft: 28,
            fontFamily: FONT_DISPLAY,
            fontSize: 76,
            fontWeight: 800,
            color: COLORS.text,
            letterSpacing: -1,
          },
        },
        r?.display ?? "—",
      ),
    ),

    // OG odds + $10 winnings row
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          marginBottom: 26,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: COLORS.panel,
            border: `1px solid ${COLORS.rule}`,
            borderRadius: 22,
            padding: "20px 28px",
            width: 440,
          },
        },
        h("div", { style: { display: "flex", fontSize: 22, color: COLORS.muted, letterSpacing: 2 } }, "OG ODDS"),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: FONT_DISPLAY,
              fontSize: 70,
              fontWeight: 800,
              color: COLORS.sunset,
              marginTop: 4,
              letterSpacing: -1,
            },
          },
          oddsLabel,
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: COLORS.panel,
            border: `1px solid ${COLORS.rule}`,
            borderRadius: 22,
            padding: "20px 28px",
            width: 440,
            alignItems: "flex-end",
          },
        },
        h("div", { style: { display: "flex", fontSize: 22, color: COLORS.muted, letterSpacing: 2 } }, "$10 BET"),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: FONT_DISPLAY,
              fontSize: 70,
              fontWeight: 800,
              color: outcome === "win" ? "#7AE3B8" : outcome === "miss" ? "#F4A0A0" : COLORS.muted,
              marginTop: 4,
              letterSpacing: -1,
            },
          },
          payoutLabel,
        ),
      ),
    ),

    // Spacer fills, footer bar
    h("div", { style: { display: "flex", flexGrow: 1 } }),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 18,
          borderTop: `2px solid ${COLORS.rule}`,
          fontSize: 22,
          color: COLORS.flame,
          fontWeight: 700,
        },
      },
      h("div", { style: { display: "flex" } }, `SETTLED · ${props.dateLabel}`),
      h("div", { style: { display: "flex", color: COLORS.muted, fontWeight: 400 } }, "linedrive.weregoingplaces.xyz"),
    ),
  );
}

function outcomeKind(p: Pick): "win" | "miss" | "dnp" {
  const r = p.result;
  if (!r || !r.hadGame) return "dnp";
  return r.hit ? "win" : "miss";
}

function americanLabel(odds: number | null): string {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function payoutLabelFor(p: Pick, outcome: "win" | "miss" | "dnp"): string {
  const v = p.result?.payoutDollars;
  if (outcome === "dnp") return "PUSH";
  if (v === null || v === undefined) return "—";
  if (v > 0) {
    return `+$${formatMoney(v)}`;
  }
  return `−$${formatMoney(Math.abs(v))}`;
}

function formatMoney(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
