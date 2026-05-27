import { useEffect, useMemo, useState, useCallback } from 'react'
import About from './About'
import './App.css'

const CATEGORY_ORDER = ['hr', 'hit', 'k', 'tb', 'rbi', 'outs', 'game']
const CATEGORY_LABELS = {
  hr: 'Home Run',
  hit: 'Hits',
  k: 'Strikeouts',
  tb: 'Total Bases',
  rbi: 'Total RBIs',
  outs: 'Total Outs',
  game: 'Game Total',
}
const CATEGORY_SHORT = {
  hr: 'HR',
  hit: 'HITS',
  k: 'K',
  tb: 'TB',
  rbi: 'RBI',
  outs: 'OUTS',
  game: 'GAME',
}
const CATEGORY_ACCENT = {
  hr: 'home-run',
  hit: 'get-hit',
  k: 'strikeout',
  tb: 'total-bases',
  rbi: 'total-rbis',
  outs: 'total-outs',
  game: 'game-total',
}

function todayUtcIso() {
  return new Date().toISOString().slice(0, 10)
}
function isoOffset(baseIso, days) {
  const d = new Date(`${baseIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function dayLabel(iso) {
  const todayIso = todayUtcIso()
  if (iso === todayIso) return 'Today'
  if (iso === isoOffset(todayIso, 1)) return 'Tomorrow'
  if (iso === isoOffset(todayIso, -1)) return 'Yesterday'
  // Past 2 and future 2 use weekday; further uses month/day
  const within3Past = [-2, -3].some((o) => iso === isoOffset(todayIso, o))
  const future2 = iso === isoOffset(todayIso, 2)
  if (within3Past || future2) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' })
  }
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function shortDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function parseSlug(pathname) {
  const m = pathname.match(/^\/r\/([a-z]+)-(\d{4}-\d{2}-\d{2})\/?$/)
  if (!m) return null
  return { league: m[1], date: m[2] }
}

function isAboutPath(pathname) {
  return /^\/about\/?$/.test(pathname)
}

function imgUrl(payload, filename) {
  const date = payload.date
  const league = payload.league ?? 'mlb'
  if (!filename) return ''
  return `/img/r/${league}/${date}/${filename}`
}

function downloadUrl(payload, filename, downloadName) {
  const u = imgUrl(payload, filename)
  if (!u) return null
  return `${u}?download=${encodeURIComponent(downloadName)}`
}

function dlName(category, dateIso, suffix = '') {
  const m = dateIso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return `${category}${suffix ? `-${suffix}` : ''}.png`
  const stem = `${category}-${m[2]}${m[3]}${suffix ? `-${suffix}` : ''}`
  return `${stem}.png`
}

async function pngBlobToJpegBlob(pngBlob, { quality = 0.92, background = '#07081D' } = {}) {
  // Convert PNG → JPEG via canvas. JPEG doesn't support transparency, so we
  // paint the OG midnight color underneath any alpha channel.
  const bitmap = await createImageBitmap(pngBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('canvas.toBlob returned null'))
      resolve(b)
    }, 'image/jpeg', quality)
  })
}

async function downloadAsBlob(srcUrl, suggestedName, { format = 'png' } = {}) {
  // Fetch the PNG bytes directly, verify it really is an image, then trigger a
  // browser download from a Blob URL. This sidesteps environments where an
  // <a download> anchor might resolve to the SPA shell (cache, redirect, etc.)
  // and surfaces a real error instead of silently saving a 1KB HTML file.
  if (!srcUrl) {
    alert('Image not yet rendered for this category.')
    return
  }
  try {
    const res = await fetch(srcUrl, { credentials: 'include' })
    if (!res.ok) {
      alert(`Download failed: HTTP ${res.status}`)
      return
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) {
      const text = await res.text()
      alert(`Server returned ${ct || 'non-image'} (${text.slice(0, 80)}). Try a hard refresh (Cmd+Shift+R).`)
      return
    }
    let blob = await res.blob()
    if (format === 'jpeg') {
      try {
        blob = await pngBlobToJpegBlob(blob)
      } catch (err) {
        alert(`JPEG conversion failed (${err.message || err}). Saving PNG instead.`)
      }
    }
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (err) {
    alert(`Download failed: ${err.message || err}`)
  }
}

function DownloadButton({ payload, filename, baseName }) {
  // 1080×1350 JPEG works for both Instagram (4:5 portrait native) and X/Twitter,
  // so there's no need for a platform picker. One button, one file.
  if (!filename) {
    return <div className="download-row"><span className="download-disabled">Not rendered</span></div>
  }
  const name = `${baseName}.jpg`
  const handleClick = (e) => {
    e.preventDefault()
    downloadAsBlob(downloadUrl(payload, filename, name), name, { format: 'jpeg' })
  }
  return (
    <div className="download-row">
      <button type="button" className="button primary" onClick={handleClick}>
        Download JPEG
      </button>
    </div>
  )
}

function updateForTitle(dateIso) {
  if (!dateIso) return ''
  const todayIso = todayUtcIso()
  if (dateIso < todayIso) return `Re-settle ${dateIso} and re-render result cards`
  if (dateIso === todayIso) return `Re-run today's pipeline and re-render highlights`
  return `Re-run leaderboards for ${dateIso}`
}

function formatMarket(pct, american, mode) {
  if (pct === null || pct === undefined) return '—'
  const pctStr = `${Math.round(pct * 100)}%`
  if (mode === 'american' && american !== null && american !== undefined) {
    return american > 0 ? `+${american}` : String(american)
  }
  return pctStr
}

function App() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('hr')
  const [archiveDates, setArchiveDates] = useState([])
  const [aboutOpen, setAboutOpen] = useState(false)
  const [oddsMode, setOddsMode] = useState(() => {
    try { return localStorage.getItem('linedrive:oddsMode') === 'american' ? 'american' : 'pct' } catch { return 'pct' }
  })
  const setOddsModeAndPersist = useCallback((m) => {
    setOddsMode(m)
    try { localStorage.setItem('linedrive:oddsMode', m) } catch { /* ignore */ }
  }, [])
  const [viewMode, setViewMode] = useState('picks')
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem('linedrive:adminKey') || '' } catch { return '' }
  })
  const [updateState, setUpdateState] = useState({ status: 'idle', message: '' }) // idle | running | error
  const [path, setPath] = useState(() => window.location.pathname)
  const slug = useMemo(() => parseSlug(path), [path])
  const showAbout = useMemo(() => isAboutPath(path), [path])

  const loadPayload = useCallback(async (s) => {
    setLoading(true)
    setError(null)
    try {
      const apiUrl = s
        ? `/api/r/${s.league}/${s.date}`
        : `/api/today`
      const res = await fetch(apiUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPayload(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPayload(slug) }, [slug, loadPayload])

  useEffect(() => {
    fetch('/api/index/mlb')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setArchiveDates(d?.dates ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((nextSlug) => {
    const nextPath = nextSlug ? `/r/${nextSlug.league}-${nextSlug.date}` : '/'
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }, [])

  const goAbout = useCallback(() => {
    window.history.pushState({}, '', '/about')
    setPath('/about')
  }, [])

  const goHome = useCallback(() => {
    window.history.pushState({}, '', '/')
    setPath('/')
  }, [])

  const promptAdminKey = useCallback(() => {
    const k = window.prompt('Admin key:')
    if (!k) return
    try { localStorage.setItem('linedrive:adminKey', k) } catch { /* ignore */ }
    setAdminKey(k)
  }, [])

  const clearAdminKey = useCallback(() => {
    try { localStorage.removeItem('linedrive:adminKey') } catch { /* ignore */ }
    setAdminKey('')
  }, [])

  const handleUpdate = useCallback(async () => {
    if (!adminKey || updateState.status === 'running') return
    const dateIso = payload?.date
    if (!dateIso) return
    const todayIso = todayUtcIso()
    const isPast = dateIso < todayIso
    const isToday = dateIso === todayIso
    setUpdateState({ status: 'running', message: isPast ? 'Settling…' : 'Refreshing…' })
    const k = encodeURIComponent(adminKey)
    try {
      if (isPast) {
        const res = await fetch(`/admin/settle?key=${k}&date=${dateIso}`)
        if (res.status === 403) { clearAdminKey(); throw new Error('bad admin key') }
        if (!res.ok) throw new Error(`settle HTTP ${res.status}`)
      } else {
        const scope = isToday ? 'full' : 'leaderboards-only'
        const r1 = await fetch(`/admin/run?key=${k}&date=${dateIso}&scope=${scope}`)
        if (r1.status === 403) { clearAdminKey(); throw new Error('bad admin key') }
        if (!r1.ok) throw new Error(`run HTTP ${r1.status}`)
        if (scope === 'full') {
          setUpdateState({ status: 'running', message: 'Rendering highlights…' })
          const r2 = await fetch(`/admin/render-highlights?key=${k}&date=${dateIso}`)
          if (!r2.ok) throw new Error(`render HTTP ${r2.status}`)
        }
      }
      await loadPayload(slug)
      setUpdateState({ status: 'idle', message: '' })
    } catch (err) {
      setUpdateState({ status: 'error', message: String(err.message || err) })
      setTimeout(() => setUpdateState({ status: 'idle', message: '' }), 5000)
    }
  }, [adminKey, updateState.status, payload?.date, slug, loadPayload, clearAdminKey])

  useEffect(() => {
    if (showAbout) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [showAbout])

  if (showAbout) {
    return <About onBack={goHome} />
  }

  const block = useMemo(() => payload?.categories?.[activeCategory] ?? null, [payload, activeCategory])

  const isArchive = !!slug
  const currentDate = payload?.date ?? ''
  const datesAvailable = useMemo(() => {
    const set = new Set(archiveDates)
    if (currentDate) set.add(currentDate)
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [archiveDates, currentDate])
  // The named-day strip covers D-3 .. D+2; the "← Older" pill jumps to the most
  // recent archive that's older than the leftmost strip date, so it always
  // represents "go beyond what's already visible".
  const stripFloor = isoOffset(todayUtcIso(), -3)
  const olderDate = useMemo(() => datesAvailable.find((d) => d < stripFloor) ?? null, [datesAvailable, stripFloor])

  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div className="hero-top">
          <div className="hero-brand">
            <img src="/brand/OG-LOGO-FLAME.svg" alt="OG" />
            <div className="hero-brand-text">
              <span className="tag">LineDrive</span>
              <span className="sub">Find Your Edge</span>
            </div>
          </div>
          <div className="hero-top-actions">
            <div className="odds-toggle" role="group" aria-label="Odds format">
              <button
                className={`odds-pill ${oddsMode === 'pct' ? 'active' : ''}`}
                onClick={() => setOddsModeAndPersist('pct')}
                title="Show OG market as implied probability (%)"
              >%</button>
              <button
                className={`odds-pill ${oddsMode === 'american' ? 'active' : ''}`}
                onClick={() => setOddsModeAndPersist('american')}
                title="Show OG market as American odds (-110, +260, …)"
              >American</button>
            </div>
            {adminKey ? (
              <div className="admin-controls">
                <button
                  className={`button primary admin-update ${updateState.status === 'running' ? 'busy' : ''}`}
                  onClick={handleUpdate}
                  disabled={updateState.status === 'running' || !payload?.date}
                  title={updateForTitle(payload?.date)}
                >
                  {updateState.status === 'running' ? updateState.message : 'Update'}
                </button>
                <button
                  className="admin-link"
                  onClick={clearAdminKey}
                  title="Clear admin key"
                  aria-label="Clear admin key"
                >×</button>
              </div>
            ) : (
              <button
                className="admin-link"
                onClick={promptAdminKey}
                title="Set admin key"
                aria-label="Set admin key"
              >⋯</button>
            )}
            <button className="button secondary" onClick={goAbout}>About</button>
            <span className="eyebrow">Daily · MLB</span>
          </div>
        </div>
        <div className="hero-copy">
          <h1>Daily MLB props, ranked. <em>Three days ahead.</em></h1>
          <p>
            Seven ranked categories &mdash; Home Run, Hit, Total Bases, Total RBIs, Strikeouts,
            Total Outs, Game Total &mdash; rendered as shareable cards. Built from MLB Stats API
            expected metrics, ballpark factors, park weather, and OG.com markets.
          </p>
          {payload && (
            <div className="meta-row">
              <span>{payload.date}{isArchive ? ' · archive' : ''}</span>
              <span>{payload.gameCount} games</span>
              {payload.notes?.map((n, i) => (
                <span key={i} className="meta-note">{n}</span>
              ))}
              {updateState.status === 'error' && (
                <span className="meta-note meta-error">Update failed: {updateState.message}</span>
              )}
            </div>
          )}
        </div>
      </header>

      <details className="about-panel" open={aboutOpen} onToggle={(e) => setAboutOpen(e.target.open)}>
        <summary>About this board</summary>
        <div className="about-content">
          <p>
            LineDrive ranks the top MLB players (and games) across seven prop categories &mdash;
            every day, three days ahead. Picks are produced by a heuristic model from public
            data with no hand selection. The <strong>Market</strong> column shows OG.com&rsquo;s
            implied probability when priced.
          </p>
          <p>
            <a href="/about" onClick={(e) => { e.preventDefault(); goAbout(); }}>
              Read the full methodology →
            </a>
          </p>
          <p className="about-sources">
            <strong>Sources:</strong> MLB Stats API (statsapi.mlb.com) &middot;
            api.weather.gov &middot; FanGraphs ballpark factors &middot; OG.com markets
            (scraped) &middot; runs daily on Cloudflare Workers.
          </p>
        </div>
      </details>

      <nav className="date-strip">
        {[-3, -2, -1, 0, 1, 2].map((offset) => {
          const targetIso = isoOffset(todayUtcIso(), offset)
          const isActive = currentDate === targetIso
          // Past-day pills only navigate if there's an archive payload for that date.
          const isPast = offset < 0
          const hasArchive = datesAvailable.includes(targetIso)
          const disabled = isPast && !hasArchive
          return (
            <button
              key={targetIso}
              className={`date-pill ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
              disabled={disabled}
              onClick={() => navigate(offset === 0 ? null : { league: 'mlb', date: targetIso })}
              title={disabled ? 'No archive for this date' : ''}
            >
              <span className="date-pill-label">{dayLabel(targetIso)}</span>
              <span className="date-pill-sub">{shortDate(targetIso)}</span>
            </button>
          )
        })}
        {olderDate && (
          <button
            className="date-pill secondary"
            onClick={() => navigate({ league: 'mlb', date: olderDate })}
            title="Older archive"
          >
            <span className="date-pill-label">← Older</span>
            <span className="date-pill-sub">{shortDate(olderDate)}</span>
          </button>
        )}
      </nav>

      {loading && <section className="status">Loading the board&hellip;</section>}
      {error && (
        <section className="status error">
          Failed to load: {error}
        </section>
      )}

      {payload && (
        <>
          <nav className="tab-row">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                className={`tab ${activeCategory === cat ? 'active' : ''} ${CATEGORY_ACCENT[cat]}`}
                onClick={() => setActiveCategory(cat)}
              >
                <span className="tab-chip">{CATEGORY_SHORT[cat]}</span>
                <span className="tab-label">{CATEGORY_LABELS[cat]}</span>
                <span className="tab-count">
                  {payload.categories[cat]?.picks?.length ?? 0}
                </span>
              </button>
            ))}
          </nav>

          {block && (
            <>
              {(() => {
                const settledHl = block.highlightSettledImages ?? []
                const hasSettled = settledHl.length > 0 || !!block.leaderboardSettledImage
                const showResults = hasSettled && viewMode === 'results'
                const leaderboardFile = showResults && block.leaderboardSettledImage
                  ? block.leaderboardSettledImage
                  : (oddsMode === 'american' && block.leaderboardImageAmerican)
                    ? block.leaderboardImageAmerican
                    : block.leaderboardImage
                const highlightFiles = showResults ? settledHl : (block.highlightImages ?? [])
                const variantSuffix = showResults ? '-result' : ''
                const variantLabel = showResults ? 'Results' : 'Projections'
                return (
                  <>
                    {hasSettled && (
                      <div className="view-toggle-row">
                        <div className="view-toggle" role="group" aria-label="Card view">
                          <button
                            className={`view-pill ${viewMode === 'picks' ? 'active' : ''}`}
                            onClick={() => setViewMode('picks')}
                            title="Show pre-game projection cards"
                          >Projections</button>
                          <button
                            className={`view-pill ${viewMode === 'results' ? 'active' : ''}`}
                            onClick={() => setViewMode('results')}
                            title="Show settled cards with results + $10 payout"
                          >Results</button>
                        </div>
                      </div>
                    )}
              <section className="board-and-highlights">
                <div className="board-col">
                  {leaderboardFile ? (
                    <a
                      className="board-image-link"
                      href={downloadUrl(payload, leaderboardFile, dlName(activeCategory, payload.date, variantSuffix.replace(/^-/, '')))}
                      download={dlName(activeCategory, payload.date, variantSuffix.replace(/^-/, ''))}
                    >
                      <img
                        src={imgUrl(payload, leaderboardFile)}
                        alt={`${CATEGORY_LABELS[activeCategory]} leaderboard (${variantLabel})`}
                        className="leaderboard-image"
                      />
                    </a>
                  ) : (
                    <div className="image-placeholder">
                      Leaderboard not rendered for this category.
                    </div>
                  )}
                  <DownloadButton
                    payload={payload}
                    filename={leaderboardFile}
                    baseName={dlName(activeCategory, payload.date, variantSuffix.replace(/^-/, '')).replace(/\.png$/, '')}
                  />
                </div>

                <div className="highlight-col">
                  {(() => {
                    const images = highlightFiles
                    return (
                      <>
                        {images.length > 0 ? (
                          <div className="highlights-2x2">
                            {images.slice(0, 4).map((filename, i) => {
                              const suffix = `top${i + 1}${variantSuffix}`
                              const baseName = dlName(activeCategory, payload.date, suffix).replace(/\.png$/, '')
                              const jpgName = `${baseName}.jpg`
                              const onClick = (e) => {
                                e.preventDefault()
                                downloadAsBlob(downloadUrl(payload, filename, jpgName), jpgName, { format: 'jpeg' })
                              }
                              return (
                                <div key={filename} className="highlight-card-mini">
                                  <a href={downloadUrl(payload, filename, jpgName)} onClick={onClick}>
                                    <img
                                      src={imgUrl(payload, filename)}
                                      alt={`${CATEGORY_LABELS[activeCategory]} #${i + 1}${showResults ? ' (settled)' : ''}`}
                                    />
                                  </a>
                                  <a
                                    className="highlight-mini-download"
                                    href={downloadUrl(payload, filename, jpgName)}
                                    onClick={onClick}
                                    title={`Download ${jpgName}`}
                                  >
                                    <span className="highlight-mini-rank">#{i + 1}</span>
                                    <span className="highlight-mini-name">Download JPEG</span>
                                  </a>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="highlight-empty">
                            <p>No highlight cards have been rendered yet for this category. They&rsquo;ll appear after today&rsquo;s render phase runs (or after you click Update).</p>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </section>
                  </>
                )
              })()}

              <section className="full-table-section">
                <h3>Full ranking · {CATEGORY_LABELS[activeCategory]}</h3>
                <div className="ranked-table">
                  <div className="ranked-table-legend">
                    <strong>Score</strong>{' '}
                    {activeCategory === 'k' && '= expected strikeouts. Higher means more K&rsquo;s.'}
                    {activeCategory === 'outs' && '= expected outs recorded. Higher means a longer outing.'}
                    {activeCategory === 'game' && '= expected total runs. Higher means more scoring.'}
                    {!['k', 'outs', 'game'].includes(activeCategory) &&
                      <>= z-scored composite signal. <span className="legend-mono">0</span> is league average, <span className="legend-mono">+1</span> ≈ one standard deviation above. Higher = stronger pick.</>}
                  </div>
                  {activeCategory === 'game' ? (
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Matchup</th>
                          <th>Venue</th>
                          <th>Expected runs</th>
                          <th>Market O/U</th>
                          <th>Signals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.picks.map((p) => (
                          <tr key={`${p.playerId}-${p.rank}`}>
                            <td className="rank">{p.rank}</td>
                            <td className="player">{p.playerName}</td>
                            <td>{p.matchup}</td>
                            <td className="score">{p.scoreLabel}</td>
                            <td>{p.marketLine ?? '—'}</td>
                            <td className="signals">
                              {p.signals?.length ? p.signals.join(' · ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Player</th>
                          <th>Team</th>
                          <th>Matchup</th>
                          <th>Score</th>
                          <th>Market</th>
                          <th>Signals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.picks.map((p) => {
                          return (
                            <tr key={`${p.playerId}-${p.rank}`}>
                              <td className="rank">{p.rank}</td>
                              <td className="player">
                                {p.playerName}
                                {p.lineupProjected && (
                                  <span className="proj-tag" title="Lineup not yet posted">proj</span>
                                )}
                              </td>
                              <td>{p.team}</td>
                              <td>{p.matchup}</td>
                              <td className="score">{p.scoreLabel}</td>
                                <td>{formatMarket(p.marketPct, p.marketOddsAmerican, oddsMode)}</td>
                              <td className="signals">
                                {p.signals?.length ? p.signals.join(' · ') : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          )}

          {payload.renderScope === 'full' && payload.games?.some((g) => g.cardImage) && (
            <section className="game-cards-section">
              <h3>Per-game cards</h3>
              <p className="game-cards-sub">
                One 1080×1080 card per game on today&rsquo;s slate &mdash; mapped 1:1 to the OG.com
                market page when available.
              </p>
              <div className="game-cards-grid">
                {payload.games.filter((g) => g.cardImage).map((g) => {
                  const name = dlName('game', payload.date, `${g.awayAbbrev}-${g.homeAbbrev}`.toLowerCase())
                  return (
                    <div key={g.gamePk} className="game-card">
                      <a href={downloadUrl(payload, g.cardImage, name)}>
                        <img src={imgUrl(payload, g.cardImage)} alt={`${g.awayAbbrev} @ ${g.homeAbbrev}`} />
                      </a>
                      <div className="game-card-meta">
                        <div className="game-card-title">{g.awayAbbrev} @ {g.homeAbbrev}</div>
                        <div className="game-card-sub">
                          {g.modelTotalRuns > 0 && `Model ${g.modelTotalRuns.toFixed(1)} R`}
                          {g.marketLine !== null && ` · OG O/U ${g.marketLine}`}
                        </div>
                        <div className="game-card-actions">
                          <a className="button secondary" href={downloadUrl(payload, g.cardImage, name)}>
                            Download
                          </a>
                          {g.ogUrl && (
                            <a className="button secondary" href={g.ogUrl} target="_blank" rel="noreferrer">
                              OG market ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

export default App
