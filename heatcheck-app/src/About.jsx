import './About.css'

function About({ onBack }) {
  return (
    <main className="app-shell about-shell">
      <header className="hero-panel about-hero">
        <div className="hero-top">
          <div className="hero-brand">
            <img src="/brand/OG-LOGO-FLAME.svg" alt="OG" />
            <div className="hero-brand-text">
              <span className="tag">LineDrive</span>
              <span className="sub">Find Your Edge</span>
            </div>
          </div>
          <button className="button secondary" onClick={onBack}>← Today&rsquo;s board</button>
        </div>
        <div className="hero-copy">
          <h1>How <em>LineDrive</em> ranks the slate.</h1>
          <p>
            LineDrive produces top-N MLB player prop rankings each day for Home Run, Get a Hit,
            and Pitcher Strikeouts. The picks come from a transparent heuristic model built on
            public data sources &mdash; no hand selection, no opaque feature engineering, no
            paid signals.
          </p>
        </div>
      </header>

      <section className="doc-section">
        <h2>The pipeline</h2>
        <p>
          A single Cloudflare Worker is responsible for everything &mdash; data fetch, scoring,
          image rendering, and persistence. It runs once daily on a cron trigger at
          <code> 15:00 UTC</code> (11am ET during DST). End-to-end runtime is roughly 4&ndash;6
          seconds per slate.
        </p>
        <ol className="doc-steps">
          <li>Pull today&rsquo;s schedule from MLB Stats API.</li>
          <li>For each game: probable pitcher, posted lineup, park location.</li>
          <li>For each batter and pitcher in the slate: season + 30-day stat hydrate (single call, batched 25 players per request).</li>
          <li>Pull expected statistics (xBA, xSLG, xwOBA) and advanced rates (ISO, HR/PA, K/PA) from MLB Stats API for every player.</li>
          <li>Pull current park weather forecast from api.weather.gov, picking the hourly period nearest first pitch.</li>
          <li>Score every batter for HR and Hit; every probable pitcher for K total.</li>
          <li>Rank top 10&ndash;15 per category.</li>
          <li>Render social PNGs via Satori + resvg-wasm using Funnel Display / Funnel Sans and the OG palette.</li>
          <li>Write JSON to Cloudflare KV (90-day TTL) and PNGs to R2 (no expiry).</li>
        </ol>
      </section>

      <section className="doc-section">
        <h2>Data sources</h2>
        <div className="source-grid">
          <article className="source-card">
            <h3>MLB Stats API <span className="tag-pill">official, free</span></h3>
            <p>statsapi.mlb.com &mdash; the authoritative source for MLB live data.</p>
            <ul>
              <li><strong>Schedule</strong>: <code>/api/v1/schedule</code> with <code>hydrate=lineups,probablePitcher,venue,team</code> &mdash; today&rsquo;s 15 games, projected pitchers, venue IDs.</li>
              <li><strong>Boxscore</strong>: <code>/api/v1/game/&#123;gamePk&#125;/boxscore</code> &mdash; confirmed lineups (when posted, usually 2&ndash;4 hours before first pitch).</li>
              <li><strong>Active roster</strong>: <code>/api/v1/teams/&#123;teamId&#125;/roster</code> &mdash; fallback when no lineup posted.</li>
              <li>
                <strong>Player profiles</strong>: <code>/api/v1/people</code> with
                <code> hydrate=stats(group=[hitting,pitching],type=[season,seasonAdvanced,expectedStatistics,lastXGames])</code>
                &mdash; one batched request per chunk of 25 players, gives us all needed stats in a single call.
              </li>
              <li><strong>Team season hitting</strong>: <code>/api/v1/teams/stats</code> &mdash; for opponent K%-vs-league baseline.</li>
            </ul>
          </article>

          <article className="source-card">
            <h3>api.weather.gov (NWS) <span className="tag-pill">official, free</span></h3>
            <p>U.S. National Weather Service forecast API. No API key required, no rate limit at our volume.</p>
            <ul>
              <li><code>/points/&#123;lat&#125;,&#123;lon&#125;</code> &rarr; gridpoint forecast URL.</li>
              <li>Hourly forecast period closest to first-pitch local time.</li>
              <li>Extracts wind speed (mph), wind direction (compass &rarr; degrees), temperature (°F), short forecast.</li>
              <li>Domed parks are skipped &mdash; weather is ignored entirely for indoor venues.</li>
            </ul>
          </article>

          <article className="source-card">
            <h3>Static park factors <span className="tag-pill">FanGraphs-sourced</span></h3>
            <p>One-time committed table at <code>worker/parks.ts</code>.</p>
            <ul>
              <li><strong>HR factor</strong>: rolling 3-year FanGraphs Park Factors (100 = neutral).</li>
              <li><strong>K factor</strong>: approximated; most parks 100 ±2.</li>
              <li><strong>Center-field bearing</strong>: compass degrees from home plate toward CF. Used to compute wind &ldquo;carry&rdquo; (dot product of wind direction with CF axis).</li>
              <li><strong>isDome</strong>: indoor / retractable-roof parks &mdash; weather ignored.</li>
              <li><strong>Lat/Lon</strong>: stadium coordinates for the weather lookup.</li>
            </ul>
          </article>

          <article className="source-card og-pending">
            <h3>OG.com market % <span className="tag-pill">planned</span></h3>
            <p>
              OG.com prediction-market percentages will be displayed alongside the model score
              on highlight cards. Endpoint shape pending. Stubbed at
              <code> worker/sources/ogMarkets.ts</code> &mdash; once we have docs, scoring stays
              the same; the market % surfaces as a side-by-side comparison so model edge is
              visible.
            </p>
          </article>
        </div>
      </section>

      <section className="doc-section">
        <h2>Scoring math</h2>
        <p>
          Each category has a small linear model with documented weights. All weights live in
          one constants block at the top of <code>worker/scoring.ts</code> and are tunable
          without redeploying anything else.
        </p>

        <h3 className="cat-h3">Home Run</h3>
        <p>Weighted sum of z-scores against league baselines, plus park and wind components.</p>
        <table className="weights-table">
          <thead><tr><th>Component</th><th>Weight</th><th>Baseline</th></tr></thead>
          <tbody>
            <tr><td>ISO z-score</td><td>0.30</td><td>0.155</td></tr>
            <tr><td>xSLG z-score</td><td>0.15</td><td>0.395</td></tr>
            <tr><td>Pitcher HR/9 z-score</td><td>0.20</td><td>1.20</td></tr>
            <tr><td>Park HR factor</td><td>0.18</td><td>100</td></tr>
            <tr><td>Wind carry (cos · mph/8)</td><td>0.08</td><td>0</td></tr>
            <tr><td>HR last 30d bucket</td><td>0.05</td><td>—</td></tr>
            <tr><td>Handedness platoon split</td><td>0.04</td><td>0</td></tr>
          </tbody>
        </table>
        <p className="code-line">
          <code>wind_carry = cos(angle_between(wind_downwind_dir, park_cf_bearing)) × (wind_mph / 8)</code>
        </p>

        <h3 className="cat-h3">Get a Hit</h3>
        <table className="weights-table">
          <thead><tr><th>Component</th><th>Weight</th><th>Baseline</th></tr></thead>
          <tbody>
            <tr><td>xBA z-score</td><td>0.30</td><td>0.245</td></tr>
            <tr><td>BA last 30d z-score</td><td>0.20</td><td>0.245</td></tr>
            <tr><td>Pitcher xBA-against z-score</td><td>0.20</td><td>0.245</td></tr>
            <tr><td>Lineup slot bonus</td><td>0.12</td><td>1.0 if 1&ndash;3, 0.3 if 4&ndash;6, &minus;0.5 otherwise</td></tr>
            <tr><td>Handedness split</td><td>0.10</td><td>0.5 if opposite-hand, &minus;0.3 if same, 0 if switch</td></tr>
            <tr><td>Park (small)</td><td>0.08</td><td>100</td></tr>
          </tbody>
        </table>

        <h3 className="cat-h3">Pitcher Strikeouts</h3>
        <p>Outputs an expected K count directly (no z-scoring), then ranks by it.</p>
        <p className="code-line">
          <code>expected_K = (K/9 last 30) × expected_IP × (opponent_K_pct / league_K_pct) × (park_K_factor / 100)</code>
        </p>
        <ul>
          <li><strong>K/9</strong>: pitcher&rsquo;s last-30-day K/9 if available, else season K/9.</li>
          <li><strong>Expected IP</strong>: derived from season IP per start, clamped to [4.0, 6.5].</li>
          <li><strong>Opponent K-rate</strong>: opposing team&rsquo;s season strikeouts ÷ plate appearances, divided by the league average across all 30 teams.</li>
          <li><strong>Park K factor</strong>: typically very close to 1.0; small parks like Petco bump it slightly.</li>
        </ul>
      </section>

      <section className="doc-section">
        <h2>Lineup handling</h2>
        <p>
          MLB lineups are typically posted 2&ndash;4 hours before first pitch. Our 11am ET crawl
          catches some but not all. When a lineup isn&rsquo;t posted, we fall back to the
          team&rsquo;s active roster and use its top 9 by season plate appearances as a
          projected lineup. Picks generated this way are tagged with a
          <span className="proj-tag-doc">proj</span> badge in the ranked table.
        </p>
        <p>
          A planned second crawl at ~2pm ET will re-score games whose lineups have since posted,
          removing the projected tag for the majority of the slate.
        </p>
      </section>

      <section className="doc-section">
        <h2>What we don&rsquo;t do</h2>
        <ul className="caveats">
          <li>No hand-picking. Every output is the model.</li>
          <li>No betting odds (yet). OG.com market % surfaces alongside the model when wired, never folded into the model itself in V1.</li>
          <li>No backtesting yet. The 90-day archive is the foundation for measuring hit rate against actual outcomes &mdash; that page is on the roadmap.</li>
          <li>No live in-game updates. Output is a once-per-day artifact.</li>
        </ul>
      </section>

      <section className="doc-section">
        <h2>Stack &amp; infrastructure</h2>
        <ul className="stack-list">
          <li><strong>Frontend</strong>: React 19, Vite 8, Funnel Sans + Funnel Display.</li>
          <li><strong>Compute</strong>: Cloudflare Workers (Paid plan, $5/mo) &mdash; cron handler + HTTP handler.</li>
          <li><strong>Storage</strong>: KV for daily JSON payloads (90-day TTL), R2 for rendered PNGs (no expiry).</li>
          <li><strong>Image rendering</strong>: <code>satori</code> for SVG layout, <code>@resvg/resvg-wasm</code> for PNG rasterization &mdash; everything runs inside the Worker, no external service.</li>
          <li><strong>Auth</strong>: Cloudflare Access (email whitelist, one-time PIN), free tier.</li>
        </ul>
      </section>
    </main>
  )
}

export default About
