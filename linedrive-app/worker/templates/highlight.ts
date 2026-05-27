import type { Category, Pick } from "../types";
import { h } from "./h";
import { COLORS, CATEGORY_ACCENT, FONT_DISPLAY, FONT_SANS } from "./theme";

export interface HighlightProps {
  category: Category;
  title: string;
  pick: Pick;
  dateLabel: string;
  logoDataUrl: string | null;
}

const SIZE = 1080;

export function highlightNode(props: HighlightProps) {
  const accent = CATEGORY_ACCENT[props.category];
  const p = props.pick;

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
    // Brand strip
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
          h("div", { style: { display: "flex", fontFamily: FONT_SANS, fontSize: 17, color: COLORS.muted, letterSpacing: 3, marginTop: 6 } }, "FIND YOUR EDGE"),
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
    // Player block
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginBottom: 24 } },
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
    // Score
    h(
      "div",
      {
        style: {
          backgroundColor: COLORS.panel,
          borderRadius: 22,
          padding: "26px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 26,
          border: `1px solid ${COLORS.rule}`,
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { display: "flex", fontSize: 22, color: COLORS.muted, letterSpacing: 2 } }, "MODEL SCORE"),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: FONT_DISPLAY,
              fontSize: 64,
              fontWeight: 800,
              color: COLORS.flame,
              letterSpacing: -1,
              marginTop: 2,
            },
          },
          p.scoreLabel,
        ),
      ),
      p.marketLine
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
            h("div", { style: { display: "flex", fontSize: 22, color: COLORS.muted, letterSpacing: 2 } }, "OG MARKET"),
            h(
              "div",
              { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 56, fontWeight: 800, marginTop: 2, color: COLORS.sunset, whiteSpace: "nowrap" } },
              p.marketLine,
            ),
          )
        : h("div", { style: { display: "flex" } }, ""),
    ),
    // Signals
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", flexGrow: 1 } },
      h(
        "div",
        { style: { display: "flex", fontSize: 22, color: COLORS.muted, marginBottom: 14, letterSpacing: 2 } },
        "WHY THIS PICK",
      ),
      ...p.signals.map((s) =>
        h(
          "div",
          { style: { display: "flex", alignItems: "center", fontSize: 30, marginBottom: 10 } },
          h(
            "div",
            { style: { display: "flex", width: 10, height: 10, borderRadius: 99, backgroundColor: COLORS.flame, marginRight: 16 } },
          ),
          h("div", { style: { display: "flex" } }, s),
        ),
      ),
    ),
    // Footer
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
      h("div", { style: { display: "flex" } }, `Date: ${props.dateLabel}`),
    ),
  );
}
