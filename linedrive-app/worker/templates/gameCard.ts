import type { Pick, Category } from "../types";
import { h } from "./h";
import { COLORS, CATEGORY_ACCENT, FONT_DISPLAY, FONT_SANS } from "./theme";
import type { ScrapedGameMarkets } from "../sources/ogScraper";

export interface GameCardProps {
  game: {
    gamePk: number;
    awayAbbrev: string;
    homeAbbrev: string;
    awayName: string;
    homeName: string;
  };
  dateLabel: string;
  logoDataUrl: string | null;
  markets: ScrapedGameMarkets | null;
  topPick: { pick: Pick; category: Category } | null;
}

const SIZE = 1080;

export function gameCardNode(props: GameCardProps) {
  const { game, markets, topPick } = props;
  const total = markets?.gameTotal;
  const accent = topPick ? CATEGORY_ACCENT[topPick.category] : CATEGORY_ACCENT.hr;

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
    // Brand
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        props.logoDataUrl
          ? h("img", { src: props.logoDataUrl, width: 130, height: 65 })
          : h("div", { style: { display: "flex", width: 0, height: 0 } }),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", marginLeft: 18 } },
          h("div", { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: COLORS.flame, letterSpacing: 1, lineHeight: 1 } }, "LINEDRIVE"),
          h("div", { style: { display: "flex", fontFamily: FONT_SANS, fontSize: 15, color: COLORS.muted, letterSpacing: 3, marginTop: 5 } }, "FIND YOUR EDGE"),
        ),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
        h("div", { style: { display: "flex", fontSize: 20, color: COLORS.muted, letterSpacing: 2 } }, "MATCHUP"),
        h("div", { style: { display: "flex", fontSize: 22, fontWeight: 700, marginTop: 2 } }, props.dateLabel),
      ),
    ),
    // Teams headline
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          marginBottom: 22,
        },
      },
      h(
        "div",
        { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 92, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2 } },
        `${game.awayAbbrev} @ ${game.homeAbbrev}`,
      ),
      h(
        "div",
        { style: { display: "flex", fontSize: 26, color: COLORS.muted, marginTop: 8 } },
        `${game.awayName} at ${game.homeName}`,
      ),
    ),
    // Top pick block
    topPick
      ? h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              backgroundColor: COLORS.panel,
              borderRadius: 18,
              padding: "20px 24px",
              border: `1px solid ${COLORS.rule}`,
              marginBottom: 18,
            },
          },
          h(
            "div",
            {
              style: {
                backgroundColor: CATEGORY_ACCENT[topPick.category].chipBg,
                color: CATEGORY_ACCENT[topPick.category].chipText,
                fontFamily: FONT_DISPLAY,
                fontSize: 22,
                fontWeight: 800,
                padding: "6px 16px",
                borderRadius: 999,
                letterSpacing: 1.2,
                display: "flex",
              },
            },
            CATEGORY_ACCENT[topPick.category].chip,
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", flexGrow: 1, marginLeft: 18 } },
            h("div", { style: { display: "flex", fontSize: 18, color: COLORS.muted, letterSpacing: 1 } }, "TOP MODEL PICK"),
            h(
              "div",
              { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 800, marginTop: 2 } },
              topPick.pick.playerName,
            ),
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
            h("div", { style: { display: "flex", fontSize: 18, color: COLORS.muted, letterSpacing: 1 } }, "MODEL"),
            h(
              "div",
              { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 38, fontWeight: 800, color: COLORS.flame } },
              topPick.pick.scoreLabel,
            ),
          ),
        )
      : h("div", { style: { display: "flex" } }, ""),
    // Game total
    total
      ? h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: COLORS.panel,
              borderRadius: 18,
              padding: "22px 26px",
              border: `1px solid ${COLORS.rule}`,
              marginBottom: 18,
            },
          },
          h(
            "div",
            { style: { display: "flex", flexDirection: "column" } },
            h("div", { style: { display: "flex", fontSize: 18, color: COLORS.muted, letterSpacing: 1 } }, "OG GAME TOTAL"),
            h(
              "div",
              { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 800, marginTop: 2 } },
              `O/U ${total.line}`,
            ),
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
            h("div", { style: { display: "flex", fontSize: 18, color: COLORS.muted, letterSpacing: 1 } }, "OVER / UNDER"),
            h(
              "div",
              { style: { display: "flex", fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 800, marginTop: 2, color: COLORS.sunset } },
              `${total.overOdds > 0 ? "+" : ""}${total.overOdds} / ${total.underOdds > 0 ? "+" : ""}${total.underOdds}`,
            ),
          ),
        )
      : h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              backgroundColor: COLORS.panel,
              borderRadius: 18,
              padding: "18px 26px",
              border: `1px dashed ${COLORS.rule}`,
              marginBottom: 18,
            },
          },
          h("div", { style: { display: "flex", fontSize: 20, color: COLORS.muted } }, "Game total market not yet priced on OG.com"),
        ),
    // First inning + first three player props as bullets
    markets
      ? h(
          "div",
          { style: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 8 } },
          h(
            "div",
            { style: { display: "flex", fontSize: 18, color: COLORS.muted, letterSpacing: 2, marginBottom: 6 } },
            "OG MARKETS",
          ),
          ...marketLines(markets).slice(0, 5).map((line) =>
            h(
              "div",
              { style: { display: "flex", alignItems: "center", fontSize: 22 } },
              h("div", {
                style: { display: "flex", width: 8, height: 8, borderRadius: 99, backgroundColor: COLORS.flame, marginRight: 14 },
              }),
              h("div", { style: { display: "flex" } }, line),
            ),
          ),
        )
      : h("div", { style: { display: "flex", flexGrow: 1 } }, ""),
    // Footer with OG.com link
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          paddingTop: 14,
          borderTop: `2px solid ${COLORS.rule}`,
          fontSize: 20,
          color: COLORS.muted,
        },
      },
      h("div", { style: { display: "flex" } }, markets?.ogUrl ? truncateUrl(markets.ogUrl) : "linedrive.weregoingplaces.xyz"),
      h("div", { style: { display: "flex", color: COLORS.flame, fontWeight: 700 } }, "FIND YOUR EDGE"),
    ),
  );
}

function marketLines(m: ScrapedGameMarkets): string[] {
  const out: string[] = [];
  if (m.firstInning) {
    out.push(`1st-inning run: Yes ${signed(m.firstInning.yesOdds)} · No ${signed(m.firstInning.noOdds)}`);
  }
  // Top pitcher K props
  const ks = [...m.players.entries()].filter(([, p]) => p.k).slice(0, 2);
  for (const [name, p] of ks) {
    if (!p.k) continue;
    out.push(`${prettyName(name)} K's over ${p.k.line}: ${signed(p.k.yesOdds)}`);
  }
  // Top batter TB
  const tbs = [...m.players.entries()].filter(([, p]) => p.tb).slice(0, 2);
  for (const [name, p] of tbs) {
    if (!p.tb) continue;
    out.push(`${prettyName(name)} TB over ${p.tb.line}: ${signed(p.tb.yesOdds)}`);
  }
  return out;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function prettyName(normalized: string): string {
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateUrl(url: string): string {
  const max = 64;
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + "…";
}
