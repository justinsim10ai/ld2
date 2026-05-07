# Handoff: Blog Post Template

## Overview
A blog post template matching the brutalist system used across Justin's personal site (index + resume). Monospace + serif typography, hairline rules, cool-neutral paper background with pastel accents, green→blue pulsing status dot. Designed to be the canonical layout for any long-form essay or case study posted at `weregoingplaces.xyz/writing/<slug>`.

## About the Design Files
The file in `reference/` is a **design reference created in HTML** — a working prototype showing intended look and behavior, not production code to copy as-is. The task is to **recreate this design in your target codebase's environment** (Next.js + MDX, Astro Content Collections, etc.) using its established patterns. If no codebase exists yet, **Astro + Content Collections** is an ideal fit — natively static, ships zero JS by default, MDX support out of the box.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are settled. Recreate pixel-perfectly using the codebase's existing libraries.

---

## Page Anatomy

### 1. Reading Progress Bar
3px-tall fixed bar at top of viewport, `--accent-green` fill, width tracks scroll position within the `<article>` element. Updates on `scroll` (passive listener) and `resize`.

### 2. Sticky Topbar
Same as other pages. Left: `← JUSTIN ⁄ INDEX` back-link. Right: file label (`FILE 003 — POST.HTML`), `BOSTON · 52°F`, `PUBLISHED <DATE>` with the green→blue pulsing dot.

### 3. Post Header
- Soft sky/peach radial gradient wash on paper background
- **Breadcrumb**: `JUSTIN ⁄ WRITING ⁄ <CATEGORY>` (mono 11px, uppercase, preceded by 36px ink rule)
- **Post tag chip**: pastel-butter background, ink border, e.g. `⁂ ESSAY · 12 MIN READ`
- **Title**: Instrument Serif `clamp(48px, 8vw, 120px)`, line-height 0.95, `text-wrap: balance`. Last word/phrase as ink punch tag with green offset shadow + `box-decoration-break: clone`
- **Deck**: italic Instrument Serif, max-width 60ch, `clamp(20px, 2vw, 26px)`
- **Meta band**: 4-column row above a top hairline — PUBLISHED / AUTHOR / FILED UNDER / READING TIME

### 4. Three-column Body Layout
`grid-template-columns: 220px 1fr 200px`, gap 48px, max-width 1280px.

#### Left rail — Table of Contents
- Sticky (`top: 80px`)
- `⁂ Contents` label, ink hairline below
- Ordered list with `decimal-leading-zero` counters via CSS `counter()`
- Active section tracked via JS scroll listener — adds `.active` class, color shifts to ink, counter prefix turns green
- Dashed hairline separators between items

#### Center — Article column
- `max-width: 68ch`, justify-self: center
- **Lede** paragraph: Instrument Serif, `clamp(22px, 2.4vw, 28px)`, with butter-bg drop cap on `::first-letter`
- **H2 headings**: Instrument Serif `clamp(32px, 4vw, 48px)`, prefixed with `§ <NN>` mono kicker via CSS counter, top hairline rule, `scroll-margin-top: 80px` for anchor jumps
- **H3 headings**: Italic Instrument Serif `clamp(22px, 2.4vw, 28px)`
- **Paragraphs**: JetBrains Mono 14px, line-height 1.75, `--ink-soft` color, `text-wrap: pretty`. `<strong>` is ink + 700. Inline highlights: `.hl-mint`, `.hl-sky`, `.hl-peach` with 4px horizontal padding
- **Inline links**: ink color, hairline ink underline, hover background swaps to `--accent-green`
- **Lists**: 
  - `<ul>` markers are `→` glyphs in ink
  - `<ol>` markers are zero-padded numbers via CSS counters
  - Items in mono 14px, line-height 1.7
- **Pull quote** (`.pullquote`): top + bottom hairline rules, Instrument Serif `clamp(28px, 3.6vw, 44px)`, opening `"` in green italic. Followed by `.pullquote-cite` (mono 11px, uppercase)
- **Callout** (`.callout`): pastel background (mint/butter/lavender via `--callout-bg`), ink border, italic-serif icon + label + body. Two-column grid (icon, body)
- **Stats row** (`.stats-row`): 3 columns, ink border, each cell with `--stat-bg` pastel fill, big serif number with italic suffix, mono uppercase label
- **Code block** (`pre.code-block`): ink-bg paper-text, mono 12px, green label header (`<span class="label">`)
- **Inline code**: paper-bg with ink border, mono 12px
- **Figure** (`.fig`): `.frame` with pastel bg + diagonal stripe overlay (placeholder for real image), ink-bg paper-text label chip top-left, `data-label` driven. Caption is mono 11px with `FIG.` prefix
- **Footnotes** (`.footnotes`): mono 12px, `[N]` markers via counter, top hairline, `— Footnotes` label
- **End mark**: `⁂ ⁂ ⁂` centered Instrument Serif

#### Right rail — Aside
Sticky (`top: 80px`) stack of pastel-headed cards:
- **On this page**: read time, word count, section + footnote counts
- **Share**: copy link / LinkedIn / X / email (each as full-width hairline-bordered button, hover inverts to ink)
- **Subscribe**: small pitch + button

### 5. Author Card
Full-width band, mint background, top + bottom hairlines. Three columns: 80×80 ink avatar (italic serif initial), name + role, "Read more →" button.

### 6. Related Posts
Section with hairline-divided header (italic-serif title left, mono label right), then a 3-column grid of cards with pastel `--card-bg`, ink chip tag, italic-serif title, mono meta footer. Cards invert to ink-on-paper on hover.

### 7. Footer
Butter→paper gradient, top hairline. Big italic `— see you around.` mark, mono contact lines right-aligned. Bottom strip ends `BUILT WITH CLAUDE CODE IN 3 MINUTES.`

---

## Design Tokens

### Colors (shared with index/resume)
| Token | Value |
|---|---|
| `--paper` | `#f1f1ec` |
| `--ink` | `#0e0e10` |
| `--ink-soft` | `#2a2a2e` |
| `--muted` | `#6b6b70` |
| `--pastel-mint` | `#c9e4d4` |
| `--pastel-lavender` | `#d9d2ee` |
| `--pastel-peach` | `#f5d6c6` |
| `--pastel-sky` | `#cfe0ee` |
| `--pastel-butter` | `#efe7c7` |
| `--pastel-rose` | `#ecd2d8` |
| `--accent-green` | `#2ec27e` |
| `--accent-blue` | `#3aa0ff` |

### Typography
- **Display**: Instrument Serif (Google Fonts), 400 + italic 400 — title, h2, h3, lede, drop cap, pull quote, stats numbers, end mark, author name, related-card title, footer mark
- **Body / UI**: JetBrains Mono (Google Fonts), 400/500/700 — paragraphs, labels, lists, code, all chrome
- Sizes use `clamp()` extensively

### Spacing & Rules
- **Hairline rule**: `1.5px solid var(--ink)` — load-bearing primitive
- **Reading measure**: `--measure: 68ch` for article body
- **Gutter**: 32px desktop, 16px ≤720px
- **Content max-width**: 1280px
- **No border-radius. No box-shadow** (except green offset on title punch tag and pulse-dot glow)

### Animations
- Reading progress: 0.08s linear width transition
- Pulse dot: 1.6s ease-in-out infinite (green ↔ blue)
- TOC active: 0.15s color transition
- Link hover: 0.15s background transition

### Responsive
- `≤1100px`: collapses to single-column body (TOC moves above article, aside below)
- `≤720px`: meta band 2-col, stats stack, related stack, author card 2-row

---

## Content Schema

For MDX/Content Collections, use this frontmatter shape:

```ts
type Post = {
  title: string;          // can include <span class="ital"> and <span class="punch">
  punchSuffix?: string;   // last phrase rendered as ink punch tag
  deck: string;           // italic Instrument Serif subtitle
  category: string;       // breadcrumb tail, e.g. "NOTES ON BUILDING"
  tag: string;            // chip text, e.g. "ESSAY · 12 MIN READ"
  publishedAt: string;    // ISO date
  author: string;
  filedUnder: string[];   // e.g. ["SEO", "AEO", "LLM"]
  readingTime: string;    // e.g. "~12 minutes"
  body: MDXContent;
};
```

Inline shortcodes/components needed:
- `<Lede>` — wraps the first paragraph for drop-cap treatment
- `<PullQuote cite="...">` — full-bleed quote block
- `<Callout variant="butter|mint|lavender" label="..." icon="i">` — pastel callout
- `<Stats>` + `<Stat num="..." label="..." color="...">` — 3-up stats row
- `<Figure label="FIG. 01" frameColor="sky" caption="...">` — placeholder figure
- `<Highlight color="mint|sky|peach">` — inline highlight span

---

## Implementation Notes

- **Reading progress** + **TOC active state** are the only JS on the page. Both are tiny passive scroll listeners — keep them inline or extract to one small client component
- **Counters** (`§ 01`, ordered list numbers, footnotes) are pure CSS via `counter-reset` / `counter-increment` — preserve them, don't recreate in JS
- **Article scroll-margin-top: 80px** is set on h2s so anchor links land below the sticky topbar
- **`text-wrap: balance`** on title and h2; **`text-wrap: pretty`** on body paragraphs and deck — required for the editorial feel
- **`box-decoration-break: clone`** on the punch tag is required for the green offset shadow to wrap cleanly across multiple lines
- Self-host the two Google Fonts in production with `font-display: swap`
- Drop the inline JS into a single client island in Astro/Next; keep the rest fully static

## Files in this bundle (`reference/`)
- `blog-post.html` — fully self-contained: HTML + CSS + tiny progress/TOC script
