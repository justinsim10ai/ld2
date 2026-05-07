# Handoff: Justin Snider — Personal Site + Resume

## Overview
A two-page personal site for Justin Snider, brutalist / raw aesthetic — monospace + serif typography, hard edges, hairline rules, cool-neutral paper background with pastel accents. Live URLs:

- `weregoingplaces.xyz/` → **`Personal Website.html`** (index — hero, nav, infinite-scroll project grid)
- `weregoingplaces.xyz/justin-snider-resume` → **`justin-snider-resume.html`** (resume page — anchor-nav, highlight grid, role timeline, skills, contact)

Both pages share a sticky topbar with a **green→blue pulsing status indicator** in the top-right. Both are static, no framework, no analytics, no cookies.

## About the Design Files
The files in `reference/` are **design references created in HTML** — working prototypes showing intended look and behavior, not production code to copy as-is. The task is to **recreate this design in your target codebase's environment** (Next.js + React, Astro, etc.) using its established patterns.

The index page uses inline JSX via Babel + `<script type="text/babel">` purely for live-design ergonomics. **Do not ship Babel-in-the-browser.** Translate the JSX into a proper component tree.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are settled. Recreate pixel-perfectly. The Tweaks panel on the index page is a designer-only affordance — **strip it from production**. Keep the chosen defaults: `hover=overlay`, `palette=cool pastel`, `headline=HI! I'm JUSTIN.`

---

## Pages

### Page 1 — Index (`Personal Website.html`)

**Sections, top to bottom:**

1. **Sticky Topbar** — left: `JUSTIN ⁄ PERSONAL INDEX ⁄ EST. 2026`. Right: `BOSTON · 52°F` + `AVAILABLE FOR WORK` with the pulsing dot.
2. **Hero** — eyebrow `FILE 001 — INDEX.HTML`, big serif `HI! I'm JUSTIN.` (JUSTIN as a paper-on-ink punch tag), lede paragraph, stat list right-aligned (`⌗ 12 PROJECTS`, `⌗ ENDLESS SCROLL`, `⌗ NO COOKIES`).
3. **Nav row** — 4 links: RESUME, LINKEDIN, ALL PROJECTS, CONTACT. Hover flips to ink/paper, arrow translates `(2px, -2px)`.
4. **Section heading** — `⁂ SELECTED WORK ⁂ 2019 — PRESENT` / `The things I've made.`
5. **Card grid** — 1, 2, 1, 2 staggered rows. Each card: pastel background, diagonal-stripe placeholder texture, top-left ink chip (tag), top-right number, bottom-left/right corner labels (type + year). On hover: image desaturates + scales 1.02, big serif title overlay + paragraph + CTA fade up.
6. **Loader + IntersectionObserver** — appends another copy of all 12 projects when sentinel is in view (cap 5 pages in the demo; replace with real pagination).
7. **Footer** — `— see you around.` mark + contact lines + bottom strip.

### Page 2 — Resume (`justin-snider-resume.html`)

**Sections:**

1. **Sticky Topbar** — `← JUSTIN ⁄ INDEX` back-link, `FILE 002 — RESUME.HTML`, `BOSTON · 52°F`, `UPDATED MAY 2026` with pulsing dot.
2. **Hero** — soft sky/peach radial gradient wash. Eyebrow, then `Justin Snider, SEO/AEO LEAD.` (last line as punch tag with green offset shadow + `box-decoration-break: clone`). 3-up meta band: SUMMARY / BASED (`Boston, MA · Remote since 2016`) / REACH (click-to-reveal email + phone).
3. **Anchor nav row** — 5 links: SUMMARY, EXPERIENCE, SKILLS, OUTSIDE, PRINT (`window.print()`).
4. **Summary block** — block-head left rail (label, big serif `The summary.`, mono meta). Body: 2 large Instrument Serif paragraphs with mint/sky highlight spans, then a 4-up bulleted list (`16 years an SEO ⁄ AEO ⁄ ASO`, `Fintech ⁄ Prediction Markets`, `Crypto ⁄ Web3`, `AI Native`) with pastel dot bullets, then a 3-up stats row in mint/sky/peach (`~50%`, `2M+`, `24`).
5. **Experience block** — full-width inner. Block head spans full width with right-aligned meta. Then a 6-card pastel **highlights grid** (Sectors, Operating Mode, Agency Roots, Built From Zero, Global Reach, Now). Below that, a **2-column role timeline** with 7 roles — pastel `--hl-color` per row, when/loc rail, italic-serif title, mono company line, mono bullet list with `→` markers and `.hl` pastel highlight spans on key results.
6. **Skills block** — bordered grid: 4 rows (AIO·GEO, Search, Tools, Education) with pastel category cells and mono chip lists.
7. **Outside block** — tag row of pastel-bordered chips, ending with the inverted ink-bg `currently building sports simulation games in Claude Code →` tag.
8. **Footer** — butter→paper gradient. `— let's talk.` mark, click-to-reveal contact list. Bottom strip ends `BUILT WITH CLAUDE CODE IN 3 MINUTES.`

---

## Shared System

### Top-bar status indicator (both pages)
9×9px square that pulses between **`#2ec27e` (green)** and **`#3aa0ff` (blue)** on a 1.6s ease-in-out infinite loop, with a soft glow ring (`box-shadow: 0 0 0 2px / 0 0 0 4px` rgba versions). CSS:

```css
.topbar .blink::after {
  content: "";
  width: 9px; height: 9px;
  background: #2ec27e;
  box-shadow: 0 0 0 2px rgba(46,194,126,0.18);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { background: #2ec27e; box-shadow: 0 0 0 2px rgba(46,194,126,0.18); }
  50%      { background: #3aa0ff; box-shadow: 0 0 0 4px rgba(58,160,255,0.22); }
}
```

### Click-to-reveal contact (resume)
Email and phone are split across `data-*` attributes (`data-user`, `data-domain`, `data-p1/p2/p3`) and assembled in JS only on click. Plain-text strings never appear in the rendered HTML, so naive scrapers can't grab them. On click, the chip becomes a real `mailto:` / `tel:` link.

```html
<span class="reveal" data-type="email" data-user="justin.snider" data-domain="email.com">
  [click to reveal email]<span class="hint">↵</span>
</span>
```

The reveal handler is a single delegated `click` listener at the end of the page. Reproduce it (or use your framework's equivalent) — don't render concatenated strings into source.

---

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| `--paper` | `#f1f1ec` | Page background |
| `--ink` | `#0e0e10` | All text, all rules |
| `--ink-soft` | `#2a2a2e` | Lede paragraphs, footer meta |
| `--muted` | `#6b6b70` | Secondary labels, copyright |
| `--pastel-mint` | `#c9e4d4` | Card wash, highlight |
| `--pastel-lavender` | `#d9d2ee` | Card wash, highlight |
| `--pastel-peach` | `#f5d6c6` | Card wash, highlight |
| `--pastel-sky` | `#cfe0ee` | Card wash, highlight |
| `--pastel-butter` | `#efe7c7` | Card wash, highlight |
| `--pastel-rose` | `#ecd2d8` | Card wash, highlight |
| `--accent-green` | `#2ec27e` | Pulse indicator, punch-tag offset shadow |
| `--accent-blue` | `#3aa0ff` | Pulse indicator |

### Typography
- **Display**: Instrument Serif (Google Fonts), weight 400, italic 400. Hero h1, section h2, card overlay h3, footer mark, role titles, summary paragraphs, stats numbers.
- **Body / UI / labels**: JetBrains Mono (Google Fonts), weights 400/500/700. Everything else.
- Sizes use `clamp()` extensively — see `<style>` block in each file.

### Spacing & Rules
- **Hairline rule**: `1.5px solid var(--ink)` is the load-bearing primitive. Don't substitute weights.
- **Gutter**: 32px desktop, 16px ≤720px (resume breakpoint at 860px for layout collapse).
- **Content max-width**: 1440px (index), 1280px (resume).
- **No border-radius. No box-shadow** (except the green offset shadow on the resume punch tag and the pulse-dot glow ring).
- **Selection**: `::selection { background: ink; color: paper; }`.

### Animations
- Hover image transforms: `cubic-bezier(.2, .7, .2, 1)` over 0.5–0.6s.
- Hover text reveals: same easing, 0.4–0.55s, 0–100ms stagger.
- Nav hover: 0.15s ease.
- Loader sweep (`@keyframes scan`): translateX -100%→100%, 1.4s linear infinite.
- Status pulse (`@keyframes pulse`): 1.6s ease-in-out infinite, color + glow size cycle.

### Responsive
- Single breakpoint per page (720px on index, 860px on resume). Below: 2-up rows collapse to one column, nav wraps, multi-column blocks stack.

---

## State / Data

For the index, project data should come from a typed source. Schema:

```ts
type Project = {
  tag: string;          // top-left chip
  title: string;        // big serif title
  titleItalic: string;  // italic subtitle line
  blurb: string;        // hover paragraph
  cta: string;          // CTA label
  color: string;        // CSS var, e.g. "var(--pastel-mint)"
  type: string;         // bottom-left foot label
  year: string;         // bottom-right foot label
  href?: string;
  image?: string;
};
```

The current 12 entries in `cards.jsx` are partial fact + partial placeholder — replace with real content.

The resume is fully content-driven by the HTML — no data layer needed unless you want to extract jobs/highlights into a CMS later.

---

## Assets
- **Fonts**: Instrument Serif + JetBrains Mono via Google Fonts. Self-host in production.
- **Images**: NONE. Cards use CSS-generated stripe placeholders; replace with real images as `<img>` (`loading="lazy"`).
- **Icons**: All unicode glyphs typed inline (`↗`, `⁄`, `⁂`, `⌗`, `→`, `✕`, `—`, `↵`). Keep them.

---

## Files in this bundle (`reference/`)
- `Personal Website.html` — index page shell, all CSS, semantic markup.
- `cards.jsx` — `PROJECTS` data array, `<Card>`, `<Grid>`, IntersectionObserver, Tweaks panel wiring.
- `tweaks-panel.jsx` — designer-only panel + helpers. **Strip from production.**
- `justin-snider-resume.html` — resume page, fully self-contained (HTML + CSS + tiny reveal script).

## Implementation Suggestion
1. Spin up Next.js (App Router) or Astro — both nail the static + minimal-JS target.
2. Set the resume page route to `/justin-snider-resume`. Index at `/`.
3. Move the shared `<style>` blocks to a single `globals.css`. Move project data to a typed `projects.ts` or MDX collection.
4. Build `<Topbar>`, `<Card>`, `<Row>`, `<Grid>`, `<JobRow>`, `<HighlightCard>` as components.
5. Replace the JS infinite-scroll loop with real pagination or render all projects (no SEO reason to chunk if <60).
6. Drop the Tweaks panel.
7. Self-host fonts; `font-display: swap`.
8. Keep contact masking — render `data-*` attributes, attach the reveal handler client-side.
