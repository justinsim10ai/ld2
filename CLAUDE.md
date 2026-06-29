# weregoingplaces — project guide for Claude

Monorepo for **weregoingplaces.xyz** and its sports-prop subdomains, all deployed on
**Cloudflare** (Workers + static assets via `wrangler`). GitHub: `justinsim10ai/ld2`.
Branches: `main` (canonical) and feature branches like `heatcheck-nba`.

## Layout
- **`site/`** — the apex site (static HTML: `index.html`, `resume.html`, `writing/`, `llms.txt`,
  `robots.txt`, sitemaps). Deployed by the **root `wrangler.toml`** (`name = "weregoingplaces"`,
  `[assets] directory = "./site"`) to `weregoingplaces.xyz` + `www.`.
- **`linedrive-app/`** → linedrive.weregoingplaces.xyz (MLB prop projections)
- **`hailmary-app/`** → hailmary.weregoingplaces.xyz (NFL prop projections)
  Each app is **Vite (frontend) + a Cloudflare Worker** (`worker/`, `wrangler.toml`).
- _Not on `main` yet:_ a `heatcheck-app/` (heatcheck.weregoingplaces.xyz, NBA fork of LineDrive)
  lives only on the unmerged **`heatcheck-nba`** feature branch — it does not exist in this tree.
- `templates/`, `design_handoff_personal_website/` — supporting assets.
- `.github/workflows/` — scheduled data jobs (`nfl-stats.yml`, `savant.yml`).

## Run / build / deploy (per app)
From inside an app dir (`linedrive-app/`, `hailmary-app/`):
```bash
npm install
npm run dev            # Vite dev server
npm run worker:dev     # local Cloudflare Worker
npm run build          # production build
npm run deploy         # build + wrangler deploy (publishes the worker)
```
Apex site: deploy from repo root with `wrangler deploy` (publishes `./site`).

## Secrets & conventions
- **Never commit secrets.** Worker secrets are set with `wrangler secret put <NAME>` (e.g.
  `ADMIN_KEY`, `ODDS_API_KEY`, `RESEND_API_KEY`); local dev uses `.dev.vars` / `.env*`. All of
  these are gitignored — keep it that way. `wrangler.toml` holds config only (no secret values).
- `node_modules/`, `dist/`, `.wrangler/` are gitignored.
- Match the existing style of each app; don't add heavy dependencies casually.
- **Do not commit, push, or deploy unless explicitly asked.**
