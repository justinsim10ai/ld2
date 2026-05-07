# Handoff: Justin's Personal Website

## Overview
A single-page personal portfolio site for Justin. Brutalist / raw aesthetic — monospace + serif typography, hard edges, no rounded corners, hairline rules everywhere. Layout: sticky meta header → big serif hero ("HI! I'm JUSTIN.") → 4-link nav row → staggered 1-2-1-2 card grid of selected projects → footer. Card grid loops/loads more on scroll ("endless"). A Tweaks panel lets the designer swap hover style, palette, and headline treatment live.

## About the Design Files
The files in `reference/` are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in your target codebase's environment** (Next.js + React + CSS Modules / Tailwind / vanilla, etc.) using its established patterns. If no codebase exists yet, **Next.js (App Router) + plain CSS** or **Astro** is a great fit — this site is mostly static and benefits from no framework overhead.

The reference uses inline JSX via Babel + a `<script type="text/babel">` setup purely for live-design ergonomics. **Do not ship Babel-in-the-browser.** Translate the JSX into a proper component tree in your framework of choice.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are settled. The developer should recreate this pixel-perfectly using the codebase's existing libraries and patterns. The Tweaks panel is a designer affordance — **do not ship it** in production. Pick the chosen variant (defaults: `hover=overlay`, `palette=cool pastel`, `headline=HI! I'm JUSTIN.`) and bake it in.

## Screens / Views

This is a single-page site. Top-to-bottom regions:

### 1. Sticky Top Bar (`<header class="topbar">`)
- **Purpose**: Quasi-OS chrome / status line. Reinforces brutalist "this is a system" feeling.
- **Layout**: 100% width, sticky to top, `z-index: 50`. Flex row, space-between. Bottom border 1.5px ink.
- **Left cell**: `JUSTIN ⁄ PERSONAL INDEX ⁄ EST. 2026` — padded 12px×20px, right border 1.5px ink.
- **Right cell**: `NYC · 38°F` + `AVAILABLE FOR WORK` (with blinking 8×8 ink square after) — padded 12px×20px, left border 1.5px ink, gap 16px.
- **Type**: JetBrains Mono 11px, uppercase, `letter-spacing: 0.08em`.
- **Blink animation**: 1.1s steps(2, end) infinite, opacity 50%→0.

### 2. Hero (`<section class="hero">`)
- **Purpose**: Establish identity, immediately.
- **Layout**: Padding `96px 32px 56px`. Bottom border 1.5px ink. Inner max-width 1440px, centered.
- **Eyebrow**: `FILE 001 — INDEX.HTML`. JetBrains Mono 12px, uppercase, `letter-spacing: 0.12em`. Preceded by a 36×1.5px ink rule, gap 12px.
- **Headline**: Instrument Serif, weight 400, `font-size: clamp(72px, 14vw, 240px)`, `line-height: 0.88`, `letter-spacing: -0.02em`. Two lines:
  - Line 1: `HI! ` then `I'm` in italic.
  - Line 2: `JUSTIN.` rendered as a punch-tag — inline-block, ink background, paper-colored text, padding `0 0.18em 0.06em`, line-height 0.95, NOT italic.
- **Meta row** (below headline, top border, padding-top 24px, margin-top 40px): grid `1fr auto`, gap 32px, items aligned to bottom.
  - Left: lede paragraph, JetBrains Mono 13px, line-height 1.55, `max-width: 60ch`, color `#2a2a2e`. Bold spans use ink color and weight 700.
  - Right: stat list (`⌗ 12 PROJECTS`, `⌗ ENDLESS SCROLL`, `⌗ NO COOKIES`). Mono 11px, uppercase, `letter-spacing: 0.14em`, line-height 1.7, right-aligned.

### 3. Nav Row (`<nav class="navrow">`)
- **Purpose**: Primary links: Resume, LinkedIn, All Projects, Contact.
- **Layout**: Flex row, paper background, bottom border 1.5px ink. Each link `flex: 1`, centered, padding `22px 16px`, right border 1.5px ink (last child no border).
- **Link content**: Each link is positioned-relative with:
  - Tiny number (`<span class="num">`) absolutely positioned top-left (`top: 8px; left: 10px`), 10px, 0.55 opacity.
  - Label (uppercase, JetBrains Mono 12px, `letter-spacing: 0.14em`).
  - Up-right arrow `↗` (margin-left 8px) that translates `(2px, -2px)` on hover.
- **Hover state**: Background flips to ink, text flips to paper. Transition 0.15s.
- **Mobile (≤720px)**: 2-up wrap, bottom borders added so wrapped rows separate cleanly.

### 4. Section Heading
- **Layout**: Grid `1fr auto`, padding `56px 32px 24px`, max-width 1440px centered, bottom border 1.5px ink.
- **Left**:
  - Label `⁂ SELECTED WORK ⁂ 2019 — PRESENT`. Mono 11px, uppercase, `letter-spacing: 0.16em`, color `#6b6b70`.
  - H2 `The things I've made.` ("things" italic). Instrument Serif 400, `clamp(36px, 5vw, 64px)`, line-height 1, `letter-spacing: -0.01em`, margin-top 8px.
- **Right**: counter `SHOWING <N> ⁄ INFINITE`. Mono 11px, uppercase, `letter-spacing: 0.14em`, right-aligned, line-height 1.4. `<N>` updates as cards load.

### 5. Card Grid (`<div class="grid">`)
- **Layout**: Wrapper has padding `0 32px`. Inner grid max-width 1440px centered. Composed of rows with 1.5px ink bottom borders.
- **Row pattern**: 1, 2, 1, 2, 1, 2, … repeating. (Implemented in `buildRows()` in `cards.jsx`.)
  - `row.one` → `grid-template-columns: 1fr` (one full-width card).
  - `row.two` → `grid-template-columns: 1fr 1fr` with 1.5px ink left-border on the second card.
- **Card aspect ratios**:
  - First card in every 4-card cycle is `21 / 8` (wide hero).
  - Other one-up cards are `16 / 9`.
  - Two-up cards are `4 / 3`.
- **Card structure** (`<article class="card">`):
  - `.card-bg` (absolutely positioned, fills card) — pastel color from a 6-color palette, layered with two pseudo-elements:
    - `::before`: 22px diagonal stripes at 135° in `rgba(14,14,16,0.06)` — the "placeholder texture" treatment, since real images don't exist yet.
    - `::after`: radial-gradient highlight from top-right (white 45% → transparent at 55%).
  - `.card-tag` (top-left, 16px inset): ink-bg paper-text label, mono 10px, uppercase, `letter-spacing: 0.16em`, padding `5px 8px`, line-height 1. Examples: `FOUNDER · 2024 →`, `AGENTIC WORKFLOWS`, `PRODUCT · LAUNCH`.
  - `.card-num` (top-right, 16px inset): mono 10px, e.g. `⁄01`, `⁄02`. 0.7 opacity.
  - `.card-foot` (bottom 16px inset, left+right): two spans space-between — type tag and year. Mono 10px, uppercase. Hidden on hover in `slide` mode.
  - `.card-overlay` (covers card): hidden text that reveals on hover.
    - H3: Instrument Serif 400, `clamp(40px, 5vw, 88px)`, line-height 0.92, `letter-spacing: -0.01em`. Two lines — title (roman) + subtitle (italic).
    - Paragraph: mono 12px, line-height 1.55, `max-width: 52ch`, margin-top 18px.
    - CTA: small uppercase mono link with ink bottom-border. `→` after.
- **Card data**: 12 entries in `PROJECTS` array in `cards.jsx`. Real ones include: Sim10.ai (founder), Profound (agentic workflows), Crypto.com MCP (product launch), Review Scraper (tool), plus 8 placeholder entries (essay, talk, photo series, newsletter, colophon, etc.) that should be replaced with real content.

### 6. Loader
- After the grid: `<div class="loader">` with two thin ink bars and `LOADING MORE` text. Bars have a paper-colored sweep animation (`@keyframes scan`, 1.4s linear infinite). Acts as the IntersectionObserver sentinel.

### 7. Footer
- **Layout**: Top border 1.5px ink, padding `64px 32px 32px`. Inner grid `1fr auto`, max-width 1440px.
- **Left ("foot-mark")**: Big italic Instrument Serif `— see you around.` ("you" roman, rest italic). `clamp(48px, 8vw, 140px)`, line-height 0.9, `letter-spacing: -0.02em`.
- **Right ("foot-meta")**: 4 lines of mono 11px right-aligned uppercase, line-height 2, color `#2a2a2e`. Email / LinkedIn / GitHub / X.
- **Bottom strip**: top border 1.5px ink, padding-top 16px, margin-top 48px. Flex space-between, mono 10px, uppercase, color `#6b6b70`. Left: copyright. Right: `BUILT BY HAND ⁄ NO TEMPLATE`.

## Interactions & Behavior

### Sticky topbar
Sticks to top on scroll, never hides. Stays in front of cards (z-index 50).

### Nav link hover
- Transition 0.15s. Background → ink, color → paper. Arrow translates `(2px, -2px)`.

### Card hover (default `overlay` style)
- `.card-bg` filter: `saturate(0.15) brightness(0.96)`, transform `scale(1.02)`. Transition 0.5–0.6s, easing `cubic-bezier(.2,.7,.2,1)`.
- Overlay h3 / p / cta: each fades in (`opacity 0→1`) and translates from `translateY(24/20/16px)` → 0. Staggered delays 0ms, 50ms, 100ms.
- Text color stays ink (overlay style is "image desaturates, big serif overlays").

### Alt hover modes (via Tweaks)
Choose one and bake it in:
- `slide`: image dims (`brightness(0.85)`) + scales 1.03; text reveals in PAPER color (overlay padding 32px); card-foot hides on hover.
- `corner`: image fully desaturates and scales 1.05; smaller h3 (`clamp(28px, 3vw, 56px)`), reveals at top-left with 24px padding.

### Infinite scroll
- IntersectionObserver on `#loader`, `rootMargin: 400px`. When intersecting, append another copy of all 12 projects (cap at 5 pages = 60 cards in current ref; remove cap and use real pagination in production).
- Counter `#count-num` updates with `items.length` on every change.

## State Management
For a real implementation, you really only need:
- `pages: number` (or use cursor-based pagination from a CMS / data file). Increment on intersection.
- `tweaks` is **designer-only**. Don't ship.

Project data should come from a typed source — a TS file, an MDX collection (Astro / Next), or a small CMS. Schema:
```ts
type Project = {
  tag: string;          // top-left chip, e.g. "FOUNDER · 2024 →"
  title: string;        // big serif title
  titleItalic: string;  // italic subtitle line
  blurb: string;        // hover paragraph
  cta: string;          // CTA label
  color: string;        // CSS var, e.g. "var(--pastel-mint)"
  type: string;         // bottom-left foot label
  year: string;         // bottom-right foot label
  href?: string;        // link target
  image?: string;       // optional real image
};
```

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| `--paper` | `#f1f1ec` | Page background, inverse text |
| `--ink` | `#0e0e10` | All text, all rules, hover-bg |
| `--ink-soft` | `#2a2a2e` | Lede paragraphs, footer meta |
| `--muted` | `#6b6b70` | Secondary labels, copyright |
| `--rule` | `#0e0e10` | (alias of ink) |
| `--pastel-mint` | `#c9e4d4` | Card wash |
| `--pastel-lavender` | `#d9d2ee` | Card wash |
| `--pastel-peach` | `#f5d6c6` | Card wash |
| `--pastel-sky` | `#cfe0ee` | Card wash |
| `--pastel-butter` | `#efe7c7` | Card wash |
| `--pastel-rose` | `#ecd2d8` | Card wash |

### Typography
- **Headline / display**: Instrument Serif (Google Fonts), weight 400, italic 400. Used for hero h1, section h2, card overlay h3, footer mark.
- **Body / UI / labels**: JetBrains Mono (Google Fonts), weights 400 / 500 / 700. Used for everything else.
- **Optional fallback**: Inter is loaded but not currently used. Remove it.
- **Sizes** (clamp-based; respect them):
  - Hero h1: `clamp(72px, 14vw, 240px)` / line-height 0.88 / `letter-spacing: -0.02em`
  - Section h2: `clamp(36px, 5vw, 64px)` / line-height 1 / `letter-spacing: -0.01em`
  - Card h3: `clamp(40px, 5vw, 88px)` / line-height 0.92
  - Footer mark: `clamp(48px, 8vw, 140px)` / line-height 0.9
  - Body / lede: 13px / line-height 1.55
  - Labels: 10–12px, uppercase, `letter-spacing: 0.08em–0.18em`

### Spacing & Rules
- **Hairline rule**: `1.5px solid var(--ink)` everywhere — this is the load-bearing visual primitive. Never use a different border weight.
- **Gutter**: 32px desktop, 16px ≤720px (use a CSS var `--gutter`).
- **Content max-width**: 1440px, centered.
- **No border-radius**, anywhere. Hard edges only.
- **No box-shadow**, anywhere.
- **Selection**: `::selection { background: ink; color: paper; }`.

### Animation Easings
- Hover image transforms: `cubic-bezier(.2, .7, .2, 1)` over 0.5–0.6s.
- Hover text reveals: same easing, 0.4–0.55s, with 0–100ms stagger.
- Nav hover: 0.15s ease.
- Loader sweep: `@keyframes scan` — translateX -100% → 100%, 1.4s linear infinite.
- Topbar blink: `1.1s steps(2, end) infinite`, opacity 50%→0.

### Responsive Breakpoint
- Single breakpoint at `max-width: 720px`:
  - Two-up rows collapse to one column (left border becomes top border).
  - Nav wraps 2×2.
  - Hero meta + footer collapse to single column.

## Assets
- **Fonts**: Instrument Serif + JetBrains Mono via Google Fonts. Self-host in production for performance/privacy.
- **Images**: NONE in the design — every card uses CSS-generated stripe placeholders. Replace with real images per project (square crops for two-up cards, 16:9 or 21:8 for one-up cards).
- **Icons**: All "icons" are unicode glyphs typed inline (`↗`, `⁄`, `⁂`, `⌗`, `→`, `✕`, `—`). Keep them — sourcing an icon set would betray the brutalist feel.

## Files in this bundle (reference/)
- `Personal Website.html` — page shell, all CSS, font links, semantic markup.
- `cards.jsx` — `PROJECTS` data array, `buildRows()` row pattern logic, `<Card>` and `<Grid>` components, IntersectionObserver infinite scroll, Tweaks wiring.
- `tweaks-panel.jsx` — designer-only panel + helpers. **Strip from production.**

## Implementation Suggestion
1. Spin up Next.js (App Router) or Astro — both nail the "static + minimal JS" target.
2. Move project data to a typed `projects.ts` (or `content/projects/*.mdx`).
3. Translate the `<style>` block in `Personal Website.html` directly — it's already vanilla CSS with custom properties. Move it to `globals.css`.
4. Build `<Card>`, `<Row>`, `<Grid>` as components. Use `loading="lazy"` on real `<img>` tags.
5. Replace the JS infinite-scroll loop with real pagination (or just render all projects — there's no SEO reason to chunk if you have <60).
6. Drop the Tweaks panel entirely.
7. Self-host fonts; add `font-display: swap`.
8. Verify hover states have a non-pointer-device fallback (cards should still tell you what they are without hover — the always-visible tag + foot lines do this).
