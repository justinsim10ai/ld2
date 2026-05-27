import type { Pick, Category, Env } from "./types";
import type { RenderScope } from "./pipeline";
import { leaderboardNode } from "./templates/leaderboard";
import { leaderboardSettledNode } from "./templates/leaderboardSettled";
import { highlightNode } from "./templates/highlight";
import { highlightSettledNode } from "./templates/highlightSettled";
import { gameHighlightNode } from "./templates/gameHighlight";
import { gameCardNode } from "./templates/gameCard";
import { CATEGORY_TITLES } from "./scoring";
import type { PreloadedMarketLookup, ScrapedGameMarkets } from "./sources/ogScraper";

export interface RenderedImage {
  filename: string;
  bytes: Uint8Array;
}

export interface GameInfo {
  gamePk: number;
  awayAbbrev: string;
  homeAbbrev: string;
  awayName: string;
  homeName: string;
}

export interface RenderResult {
  leaderboard: Record<Category, string>;
  leaderboardAmerican: Record<Category, string>;
  highlights: Record<Category, string[]>;
  gameCards: Map<number, string>;
}

const ALL_CATEGORIES: Category[] = ["hr", "hit", "k", "tb", "rbi", "outs", "game"];
const FULL_HIGHLIGHTS: Category[] = ["hr", "hit", "k", "tb", "rbi", "outs"];
const HIGHLIGHT_CATEGORIES: Category[] = [...FULL_HIGHLIGHTS, "game"];
export const HIGHLIGHTS_PER_CATEGORY = 4;

void gameCardNode; // imported for later on-demand game card render

/**
 * Phase A: render the 7 %-mode leaderboard PNGs (one per category) plus 6
 * American-mode variants for the player-prop categories (game category uses an
 * O/U line which doesn't change between modes, so we skip it).
 * Targets ~20-25s CPU on a full slate. Streams each PNG to R2 to keep memory low.
 */
export async function renderLeaderboards(
  env: Env,
  dateIso: string,
  byCategory: Record<Category, Pick[]>,
): Promise<{ leaderboard: Record<Category, string>; leaderboardAmerican: Record<Category, string> }> {
  const renderer = await getRenderer(env);
  const leaderboard = emptyCat(() => "");
  const leaderboardAmerican = emptyCat(() => "");
  if (!renderer) {
    console.warn("[render] renderer unavailable for leaderboards");
    return { leaderboard, leaderboardAmerican };
  }
  const dateLabel = formatDateLabel(dateIso);
  const r2Prefix = `r/mlb/${dateIso}`;
  for (const cat of ALL_CATEGORIES) {
    const picks = byCategory[cat];
    if (!picks || picks.length === 0) continue;
    // %-mode
    try {
      const filename = `leaderboard-${cat}.png`;
      const node = leaderboardNode({
        category: cat,
        title: CATEGORY_TITLES[cat],
        picks,
        dateLabel,
        logoDataUrl: renderer.logoDataUrl,
        oddsMode: "pct",
      });
      const bytes = await renderer.fn(node, 1080, 1350);
      await env.LINEDRIVE_ASSETS.put(`${r2Prefix}/${filename}`, bytes, {
        httpMetadata: { contentType: "image/png" },
      });
      leaderboard[cat] = filename;
    } catch (err) {
      console.error(`[render:leaderboard ${cat}] failed`, err);
    }
    // American-odds variant (player categories only)
    if (cat === "game") continue;
    try {
      const filename = `leaderboard-${cat}-american.png`;
      const node = leaderboardNode({
        category: cat,
        title: CATEGORY_TITLES[cat],
        picks,
        dateLabel,
        logoDataUrl: renderer.logoDataUrl,
        oddsMode: "american",
      });
      const bytes = await renderer.fn(node, 1080, 1350);
      await env.LINEDRIVE_ASSETS.put(`${r2Prefix}/${filename}`, bytes, {
        httpMetadata: { contentType: "image/png" },
      });
      leaderboardAmerican[cat] = filename;
    } catch (err) {
      console.error(`[render:leaderboard ${cat}-american] failed`, err);
    }
  }
  return { leaderboard, leaderboardAmerican };
}

/**
 * Phase B: render highlight PNGs for the player-prop categories. Typically
 * runs as a separate Worker invocation so we get a fresh CPU/memory budget.
 */
export async function renderHighlights(
  env: Env,
  dateIso: string,
  byCategory: Record<Category, Pick[]>,
): Promise<Record<Category, string[]>> {
  const renderer = await getRenderer(env);
  const highlights = emptyCat<string[]>(() => []);
  if (!renderer) {
    console.warn("[render] renderer unavailable for highlights");
    return highlights;
  }
  const dateLabel = formatDateLabel(dateIso);
  const r2Prefix = `r/mlb/${dateIso}`;
  for (const cat of HIGHLIGHT_CATEGORIES) {
    const picks = byCategory[cat];
    if (!picks || picks.length === 0) continue;
    const top = cat === "game"
      ? pickTopGamesByDelta(picks, HIGHLIGHTS_PER_CATEGORY)
      : picks.slice(0, HIGHLIGHTS_PER_CATEGORY);
    for (let i = 0; i < top.length; i++) {
      const filename = `highlight-${cat}-${i + 1}.png`;
      const node = cat === "game"
        ? gameHighlightNode({
            title: CATEGORY_TITLES.game,
            pick: top[i],
            dateLabel,
            logoDataUrl: renderer.logoDataUrl,
          })
        : highlightNode({
            category: cat,
            title: CATEGORY_TITLES[cat],
            pick: top[i],
            dateLabel,
            logoDataUrl: renderer.logoDataUrl,
          });
      try {
        const bytes = await renderer.fn(node, 1080, 1080);
        await env.LINEDRIVE_ASSETS.put(`${r2Prefix}/${filename}`, bytes, {
          httpMetadata: { contentType: "image/png" },
        });
        highlights[cat].push(filename);
      } catch (err) {
        console.error(`[render:highlight ${cat}-${i + 1}] failed`, err);
      }
    }
  }
  return highlights;
}

// Order games by largest |model − market| edge. Games without an OG line drop
// to the bottom; if no game has a line we fall back to the score ranking the
// pipeline already produced.
function pickTopGamesByDelta(picks: Pick[], n: number): Pick[] {
  const scored = picks.map((p) => ({
    pick: p,
    delta: p.marketOverLine !== null && p.marketOverLine !== undefined
      ? Math.abs(p.score - p.marketOverLine)
      : -1,
  }));
  const anyLine = scored.some((s) => s.delta >= 0);
  if (!anyLine) return picks.slice(0, n);
  scored.sort((a, b) => b.delta - a.delta);
  return scored.slice(0, n).map((s) => s.pick);
}

/**
 * Settled phase A': render result-stamped leaderboard PNGs (top 10 per category)
 * for a date that has had settlement applied (pick.result set). One file per
 * player category, written as `leaderboard-{cat}-settled.png`.
 */
export async function renderSettledLeaderboards(
  env: Env,
  dateIso: string,
  byCategory: Record<Category, Pick[]>,
): Promise<Record<Category, string>> {
  const renderer = await getRenderer(env);
  const settled = emptyCat(() => "");
  if (!renderer) {
    console.warn("[render] renderer unavailable for settled leaderboards");
    return settled;
  }
  const dateLabel = formatDateLabel(dateIso);
  const r2Prefix = `r/mlb/${dateIso}`;
  for (const cat of FULL_HIGHLIGHTS) {
    const picks = byCategory[cat];
    if (!picks || picks.length === 0) continue;
    const filename = `leaderboard-${cat}-settled.png`;
    const node = leaderboardSettledNode({
      category: cat,
      title: CATEGORY_TITLES[cat],
      picks,
      dateLabel,
      logoDataUrl: renderer.logoDataUrl,
    });
    try {
      const bytes = await renderer.fn(node, 1080, 1350);
      await env.LINEDRIVE_ASSETS.put(`${r2Prefix}/${filename}`, bytes, {
        httpMetadata: { contentType: "image/png" },
      });
      settled[cat] = filename;
    } catch (err) {
      console.error(`[render:leaderboard-settled ${cat}] failed`, err);
    }
  }
  return settled;
}

/**
 * Settled phase B': render result-stamped highlight PNGs for the player-prop
 * categories on a date that has had settlement applied (pick.result set).
 * Mirrors renderHighlights() filename layout with a `-settled` suffix.
 */
export async function renderSettledHighlights(
  env: Env,
  dateIso: string,
  byCategory: Record<Category, Pick[]>,
): Promise<Record<Category, string[]>> {
  const renderer = await getRenderer(env);
  const settled = emptyCat<string[]>(() => []);
  if (!renderer) {
    console.warn("[render] renderer unavailable for settled highlights");
    return settled;
  }
  const dateLabel = formatDateLabel(dateIso);
  const r2Prefix = `r/mlb/${dateIso}`;
  for (const cat of FULL_HIGHLIGHTS) {
    const picks = byCategory[cat];
    if (!picks || picks.length === 0) continue;
    const top = picks.slice(0, HIGHLIGHTS_PER_CATEGORY);
    for (let i = 0; i < top.length; i++) {
      const filename = `highlight-${cat}-${i + 1}-settled.png`;
      const node = highlightSettledNode({
        category: cat,
        title: CATEGORY_TITLES[cat],
        pick: top[i],
        dateLabel,
        logoDataUrl: renderer.logoDataUrl,
      });
      try {
        const bytes = await renderer.fn(node, 1080, 1080);
        await env.LINEDRIVE_ASSETS.put(`${r2Prefix}/${filename}`, bytes, {
          httpMetadata: { contentType: "image/png" },
        });
        settled[cat].push(filename);
      } catch (err) {
        console.error(`[render:settled ${cat}-${i + 1}] failed`, err);
      }
    }
  }
  return settled;
}

// Keep the old all-in-one entry for backward compatibility (now unused but
// referenced by older callers). Combines both phases.
export async function renderAllImages(
  env: Env,
  dateIso: string,
  byCategory: Record<Category, Pick[]>,
  renderScope: RenderScope,
  _games: GameInfo[],
  _market: PreloadedMarketLookup,
): Promise<RenderResult> {
  const { leaderboard, leaderboardAmerican } = await renderLeaderboards(env, dateIso, byCategory);
  const highlights = renderScope === "full"
    ? await renderHighlights(env, dateIso, byCategory)
    : emptyCat<string[]>(() => []);
  return { leaderboard, leaderboardAmerican, highlights, gameCards: new Map() };
}

function pickGameTopHighlight(byCategory: Record<Category, Pick[]>, gamePk: number): { pick: Pick; category: Category } | null {
  // Find the highest-scored player pick involving this game across all player categories.
  let best: { pick: Pick; category: Category; score: number } | null = null;
  for (const cat of ["hr","hit","k","tb","rbi","outs"] as Category[]) {
    for (const p of byCategory[cat] ?? []) {
      // Player picks have playerId = MLB player; the game ranker uses gamePk as playerId
      if (cat === "game") continue;
      // We can't directly know gamePk from the pick. Skip if no match infra.
      // The caller-side check happens here: we conservatively only use the top-1 pick that mentions the same matchup token.
      // (lookup via gamePk would require an extra map; skipped for V2 — most useful information is the score anyway)
      // Take the highest-rank pick across all categories as a fallback if no specific game match
    }
  }
  // Fall back: top HR pick on the slate
  const allTop = byCategory.hr?.[0];
  return allTop ? { pick: allTop, category: "hr" } : null;
}

function emptyCat<T>(make: () => T): Record<Category, T> {
  return {
    hr: make(), hit: make(), k: make(), tb: make(), rbi: make(), outs: make(), game: make(),
  } as Record<Category, T>;
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---- Renderer ----

type RenderFn = (node: unknown, width: number, height: number) => Promise<Uint8Array>;

interface CachedRenderer {
  fn: RenderFn;
  logoDataUrl: string | null;
}

let cachedRenderer: CachedRenderer | null | undefined;

async function getRenderer(env: Env): Promise<CachedRenderer | null> {
  if (cachedRenderer !== undefined) return cachedRenderer;
  try {
    const { default: satori } = await import("satori");
    const { Resvg, initWasm } = await import("@resvg/resvg-wasm");
    // @ts-expect-error - wasm import handled by wrangler bundler
    const resvgWasm = (await import("@resvg/resvg-wasm/index_bg.wasm")).default;
    try { await initWasm(resvgWasm as WebAssembly.Module); }
    catch (e) { if (!/already/i.test(String(e))) throw e; }

    const [sansRegular, sansBold, displayBold, displayExtraBold, logoBytes] = await Promise.all([
      loadAsset(env, "/fonts/FunnelSans-Regular.ttf"),
      loadAsset(env, "/fonts/FunnelSans-Bold.ttf"),
      loadAsset(env, "/fonts/FunnelDisplay-Bold.ttf"),
      loadAsset(env, "/fonts/FunnelDisplay-ExtraBold.ttf"),
      loadAsset(env, "/brand/OG-LOGO-FLAME.png").catch(() => null),
    ]);

    const logoDataUrl = logoBytes ? `data:image/png;base64,${arrayBufferToBase64(logoBytes)}` : null;

    const fn: RenderFn = async (node, width, height) => {
      const svg = await satori(node as never, {
        width,
        height,
        fonts: [
          { name: "FunnelSans", data: sansRegular, weight: 400, style: "normal" },
          { name: "FunnelSans", data: sansBold, weight: 700, style: "normal" },
          { name: "FunnelDisplay", data: displayBold, weight: 700, style: "normal" },
          { name: "FunnelDisplay", data: displayExtraBold, weight: 800, style: "normal" },
        ],
      });
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
      return resvg.render().asPng();
    };
    cachedRenderer = { fn, logoDataUrl };
    return cachedRenderer;
  } catch (err) {
    console.error("[render] init failed", err);
    cachedRenderer = null;
    return null;
  }
}

async function loadAsset(env: Env, path: string): Promise<ArrayBuffer> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!res.ok) throw new Error(`asset fetch failed: ${path} (${res.status})`);
  return res.arrayBuffer();
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
