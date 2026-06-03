import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import About from './About'
import { FactorsIndex, FactorPage } from './FactorPages'
import Backtest from './Backtest'
import { FACTORS, factorsForCategory } from './factors'
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

function parseFactorPath(pathname) {
  if (/^\/factors\/?$/.test(pathname)) return { index: true }
  const m = pathname.match(/^\/factors\/([a-zA-Z0-9]+)\/?$/)
  if (!m) return null
  return { id: m[1] }
}

function isBacktestPath(pathname) {
  return /^\/backtest\/?$/.test(pathname)
}

function imgUrl(payload, filename) {
  const date = payload.date
  const league = payload.league ?? 'mlb'
  if (!filename) return ''
  // Images are served with a 1h CDN cache under stable filenames, so re-renders
  // (e.g. once OG odds get priced) wouldn't show. Cache-bust on generatedAtIso
  // so each pipeline run forces a fresh fetch.
  const v = payload.generatedAtIso ? `?v=${encodeURIComponent(payload.generatedAtIso)}` : ''
  return `/img/r/${league}/${date}/${filename}${v}`
}

function downloadUrl(payload, filename, downloadName) {
  const u = imgUrl(payload, filename)
  if (!u) return null
  const sep = u.includes('?') ? '&' : '?'
  return `${u}${sep}download=${encodeURIComponent(downloadName)}`
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

function tweetIntentUrl({ text, url }) {
  const params = new URLSearchParams()
  // Combine text + url into one query param so X doesn't render an empty preview.
  const combined = url ? `${text} ${url}` : text
  if (combined) params.set('text', combined)
  return `https://twitter.com/intent/tweet?${params.toString()}`
}

function shareLink(payload) {
  const date = payload?.date
  const league = payload?.league ?? 'mlb'
  if (!date) return 'https://linedrive.weregoingplaces.xyz'
  return `https://linedrive.weregoingplaces.xyz/r/${league}-${date}`
}

function composeShareText({ kind, payload, pick, game, category }) {
  // Tool is internal — share text is image-driven; no URL back to the app.
  const url = null
  void payload
  if (category === 'game' && (pick || game)) {
    const matchup = pick ? pick.playerName : `${game.awayAbbrev} @ ${game.homeAbbrev}`
    const model = pick ? pick.score : game?.modelTotalRuns
    const line = pick ? pick.marketOverLine : game?.marketLine
    let detail = ''
    if (typeof model === 'number' && typeof line === 'number') {
      const delta = model - line
      const side = delta >= 0 ? 'OVER' : 'UNDER'
      const sign = delta >= 0 ? '+' : '−'
      detail = ` — model ${model.toFixed(1)} R vs @OG_com O/U ${line} → ${side} ${sign}${Math.abs(delta).toFixed(1)} R`
    }
    return { text: `📈 ${matchup}${detail}.`, url }
  }
  if (kind === 'leaderboard') {
    const label = CATEGORY_LABELS[category] || ''
    return {
      text: `Tonight's ${label} leaderboard — model rankings via @OG_com.`,
      url,
    }
  }
  if (kind === 'pick' && pick) {
    const catLabel = CATEGORY_LABELS[category] || category
    const odds = pick.marketOddsAmerican
    const oddsStr = odds == null ? '' : ` (@OG_com ${odds > 0 ? `+${odds}` : odds})`
    return {
      text: `🔥 ${pick.playerName} (${pick.team}) — model #${pick.rank} for ${catLabel}${oddsStr}.`,
      url,
    }
  }
  return { text: `LineDrive — daily MLB props ranked, odds via @OG_com.`, url }
}

function canShareFiles() {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    const probe = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

async function shareImageViaSystem({ srcUrl, jpgName, text, title }) {
  if (!srcUrl) return
  try {
    const res = await fetch(srcUrl, { credentials: 'include' })
    if (!res.ok) { alert(`Share failed: HTTP ${res.status}`); return }
    let blob = await res.blob()
    if (blob.type === 'image/png') {
      try { blob = await pngBlobToJpegBlob(blob) } catch { /* keep PNG */ }
    }
    const file = new File([blob], jpgName, { type: blob.type || 'image/jpeg' })
    await navigator.share({ files: [file], text, title })
  } catch (err) {
    if (err?.name === 'AbortError') return
    alert(`Share failed: ${err?.message || err}`)
  }
}

function TwitterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.766l-5.297-6.918L4.8 22H1.54l8.02-9.166L1 2h6.91l4.788 6.33L18.244 2zm-1.187 18h1.876L7.05 4H5.05l12.007 16z"/>
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function TweetButton({ text, url, compact = false }) {
  const href = tweetIntentUrl({ text, url })
  if (compact) {
    return (
      <a className="mini-icon-btn" href={href} target="_blank" rel="noopener noreferrer" title="Tweet this card">
        <TwitterIcon />
      </a>
    )
  }
  return (
    <a className="button secondary" href={href} target="_blank" rel="noopener noreferrer" title="Tweet this card">
      Tweet
    </a>
  )
}

function ShareButton({ srcUrl, jpgName, text, title, compact = false }) {
  const [supported, setSupported] = useState(false)
  useEffect(() => { setSupported(canShareFiles()) }, [])
  if (!supported) return null
  const handle = (e) => {
    e.preventDefault()
    shareImageViaSystem({ srcUrl, jpgName, text, title })
  }
  if (compact) {
    return (
      <button type="button" className="mini-icon-btn" onClick={handle} title="Share via system sheet (Instagram, Threads, Messages…)">
        <ShareIcon />
      </button>
    )
  }
  return (
    <button type="button" className="button secondary" onClick={handle} title="Share via system sheet (Instagram, Threads, Messages…)">
      Share
    </button>
  )
}

function ShareRow({ payload, filename, baseName, context }) {
  if (!filename) {
    return <div className="download-row"><span className="download-disabled">Not rendered</span></div>
  }
  const jpgName = `${baseName}.jpg`
  const srcUrl = downloadUrl(payload, filename, jpgName)
  const { text, url } = composeShareText({ ...context, payload })
  const handleDownload = (e) => {
    e.preventDefault()
    downloadAsBlob(srcUrl, jpgName, { format: 'jpeg' })
  }
  return (
    <div className="download-row">
      <button type="button" className="button primary" onClick={handleDownload}>
        Download JPEG
      </button>
      <TweetButton text={text} url={url} />
      <ShareButton srcUrl={srcUrl} jpgName={jpgName} text={text} title="LineDrive" />
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

function pickKey(p) {
  return `${p.playerId}-${p.rank}`
}

function formatEdge(edge) {
  if (edge == null) return '—'
  if (edge > 0) return `▲${edge}`
  if (edge < 0) return `▼${-edge}`
  return '—'
}

// Probabilistic edge (calibrated model prob − market implied), in percentage points.
function formatProbEdge(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)} pts`
}

// A holistic data-confidence read for a pick, derived from existing flags.
// Returns { level: 'high'|'med'|'low', reasons }. High = full data; lower when
// the matchup is unconfirmed or factors are leaning on league-average fallbacks.
function pickConfidence(p) {
  const reasons = []
  const neutralCount = (p.factors ?? []).filter((f) => f.neutral).length
  if (p.dataQuality && p.dataQuality.pitcherConfirmed === false) reasons.push('Opposing starter not confirmed')
  if (p.lineupProjected) reasons.push('Lineup not yet posted')
  if (neutralCount > 0) reasons.push(`${neutralCount} factor${neutralCount === 1 ? '' : 's'} using a league-average fallback`)
  let level = 'high'
  if (p.dataQuality && p.dataQuality.pitcherConfirmed === false) level = 'low'
  else if (p.lineupProjected || neutralCount >= 2) level = 'med'
  return { level, reasons }
}

// Registry-driven ranking table: one column per scoring factor for the active
// category. Headers link to the factor's explainer page; rows expand to a full
// breakdown; an "edge vs market" sort surfaces picks the model rates higher
// than the betting market does. Falls back to a legacy table for archived
// payloads generated before structured factors existed.
function FactorTable({ block, category, oddsMode, goFactor }) {
  const [sortMode, setSortMode] = useState('score')
  const [expanded, setExpanded] = useState(() => new Set())
  const cols = useMemo(() => factorsForCategory(category), [category])
  const hasFactors = useMemo(() => block.picks.some((p) => p.factors?.length), [block.picks])

  // Three views over the same picks:
  // - "score": the model's own ranking (default).
  // - "edge": ordinal — within the market-priced subset, how many spots higher
  //   the model ranks a pick than the market does. Surfaces undervalued names.
  // - "blend": consensus — picks both the model and the market rate highly,
  //   from a 50/50 mix of normalized model score and market-implied probability.
  const rows = useMemo(() => {
    const picks = block.picks
    const scores = picks.map((p) => p.score)
    const min = Math.min(...scores), max = Math.max(...scores)
    const span = (max - min) || 1
    const priced = picks.filter((p) => p.marketPct != null)
    const modelRank = new Map(priced.map((p, i) => [pickKey(p), i + 1])) // priced preserves score order
    const byMarket = [...priced].sort((a, b) => b.marketPct - a.marketPct)
    const marketRank = new Map(byMarket.map((p, i) => [pickKey(p), i + 1]))
    const arr = picks.map((p) => {
      const k = pickKey(p)
      const rankEdge = modelRank.has(k) ? marketRank.get(k) - modelRank.get(k) : null
      // True probabilistic edge once calibrated: our hit prob − market implied.
      const probEdge = (p.modelProb != null && p.marketPct != null) ? p.modelProb - p.marketPct : null
      const modelNorm = (p.score - min) / span
      const blend = p.marketPct != null ? 0.5 * modelNorm + 0.5 * p.marketPct : 0.5 * modelNorm
      return { p, edge: probEdge ?? null, rankEdge, probEdge, blend }
    })
    // Sort by true edge when any pick has it, else fall back to ordinal rank edge.
    const anyProbEdge = arr.some((x) => x.probEdge != null)
    if (sortMode === 'edge') arr.sort((a, b) => ((anyProbEdge ? (b.probEdge ?? -Infinity) - (a.probEdge ?? -Infinity) : (b.rankEdge ?? -Infinity) - (a.rankEdge ?? -Infinity))))
    else if (sortMode === 'blend') arr.sort((a, b) => b.blend - a.blend)
    return arr
  }, [block.picks, sortMode])

  const anyMarket = useMemo(() => block.picks.some((p) => p.marketPct != null), [block.picks])

  if (!hasFactors) return <LegacyRankTable block={block} oddsMode={oddsMode} />

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div className="ranked-table factor-table">
      <div className="ranked-table-legend">
        <span>
          <strong>Factors</strong> — each column is a scoring input; click a header to learn what it means.
          A <span className="legend-mono">~</span> marks an approximated value. Tap a row for the full breakdown.
        </span>
        {anyMarket && (
          <span className="sort-toggle" role="group" aria-label="Sort mode">
            <button
              className={sortMode === 'score' ? 'active' : ''}
              onClick={() => setSortMode('score')}
            >Model score</button>
            <button
              className={sortMode === 'edge' ? 'active' : ''}
              onClick={() => setSortMode('edge')}
              title="Spots the model ranks a pick above the market"
            >Edge vs market</button>
            <button
              className={sortMode === 'blend' ? 'active' : ''}
              onClick={() => setSortMode('blend')}
              title="Consensus: a 50/50 blend of model score and market"
            >Blend</button>
          </span>
        )}
      </div>
      <div className="factor-table-scroll">
        <table>
          <thead>
            <tr>
              <th className="sticky-col col-rank">#</th>
              <th className="sticky-col col-player">Player</th>
              {cols.map((f) => (
                <th key={f.id} className={f.keyColumn ? 'key-col' : 'extra-col'}>
                  <button className="factor-link" onClick={() => goFactor(f.id)} title={f.description}>
                    {f.column}{f.proxy && <sup className="proxy-mark">~</sup>}
                  </button>
                </th>
              ))}
              <th className="col-model" title="Calibrated hit probability from settled results">Model %</th>
              <th className="col-score">{sortMode === 'edge' ? 'Edge' : 'Score'}</th>
              <th className="col-market">Market</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, probEdge, rankEdge }) => {
              const key = pickKey(p)
              const fmap = Object.fromEntries((p.factors ?? []).map((x) => [x.id, x]))
              const isOpen = expanded.has(key)
              const spTbd = p.dataQuality && p.dataQuality.pitcherConfirmed === false
              return (
                <Fragment key={key}>
                  <tr className={`factor-row ${isOpen ? 'open' : ''}`} onClick={() => toggle(key)}>
                    <td className="rank sticky-col col-rank">{p.rank}</td>
                    <td className="player sticky-col col-player">
                      {(() => {
                        const c = pickConfidence(p)
                        const title = c.level === 'high'
                          ? 'High confidence — full data'
                          : `${c.level === 'low' ? 'Low' : 'Medium'} confidence — ${c.reasons.join('; ')}`
                        return <span className={`conf-dot conf-${c.level}`} title={title} aria-label={title}>●</span>
                      })()}
                      <span className="player-name">{p.playerName}</span>
                      {p.lineupProjected && <span className="proj-tag" title="Lineup not yet posted">proj</span>}
                      {spTbd && <span className="proj-tag sp-tbd" title="Opposing starter not confirmed — pitcher factors use league average">SP TBD</span>}
                      <span className="row-meta">{[p.team, p.matchup].filter(Boolean).join(' · ')}</span>
                    </td>
                    {cols.map((f) => {
                      const pf = fmap[f.id]
                      const cls = [
                        f.keyColumn ? 'key-col' : 'extra-col',
                        pf?.neutral ? 'neutral-cell' : '',
                        pf?.proxy ? 'proxy-cell' : '',
                      ].filter(Boolean).join(' ')
                      return <td key={f.id} className={cls}>{pf ? pf.display : '—'}</td>
                    })}
                    <td className="col-model">{p.modelProb != null ? `${Math.round(p.modelProb * 100)}%` : '—'}</td>
                    <td className="score">{sortMode === 'edge' ? (probEdge != null ? formatProbEdge(probEdge) : formatEdge(rankEdge)) : p.scoreLabel}</td>
                    <td className="col-market">{formatMarket(p.marketPct, p.marketOddsAmerican, oddsMode)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="factor-detail-row">
                      <td colSpan={cols.length + 5}>
                        <div className="factor-detail">
                          {(p.factors ?? []).map((pf) => {
                            const def = FACTORS[pf.id]
                            return (
                              <button
                                key={pf.id}
                                className="factor-detail-item"
                                onClick={(e) => { e.stopPropagation(); goFactor(pf.id) }}
                              >
                                <span className="fd-name">{def?.name ?? pf.id}{pf.proxy && ' (approx)'}</span>
                                <span className={`fd-val ${pf.neutral ? 'neutral' : ''}`}>
                                  {pf.display}{pf.neutral && ' · n/a'}
                                </span>
                              </button>
                            )
                          })}
                          {p.signals?.length > 0 && (
                            <div className="fd-signals">{p.signals.join(' · ')}</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Legacy table for archived payloads predating structured factors.
function LegacyRankTable({ block, oddsMode }) {
  return (
    <div className="ranked-table">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Player</th><th>Team</th><th>Matchup</th><th>Score</th><th>Market</th><th>Signals</th>
          </tr>
        </thead>
        <tbody>
          {block.picks.map((p) => (
            <tr key={pickKey(p)}>
              <td className="rank">{p.rank}</td>
              <td className="player">
                {p.playerName}
                {p.lineupProjected && <span className="proj-tag" title="Lineup not yet posted">proj</span>}
              </td>
              <td>{p.team}</td>
              <td>{p.matchup}</td>
              <td className="score">{p.scoreLabel}</td>
              <td>{formatMarket(p.marketPct, p.marketOddsAmerican, oddsMode)}</td>
              <td className="signals">{p.signals?.length ? p.signals.join(' · ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
  const factorRoute = useMemo(() => parseFactorPath(path), [path])
  const showBacktest = useMemo(() => isBacktestPath(path), [path])

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

  const goFactor = useCallback((id) => {
    const nextPath = id ? `/factors/${id}` : '/factors'
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const goFactorsIndex = useCallback(() => goFactor(null), [goFactor])

  const goBacktest = useCallback(() => {
    window.history.pushState({}, '', '/backtest')
    setPath('/backtest')
    window.scrollTo({ top: 0, behavior: 'instant' })
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

  // Standalone routes (rendered after all hooks to satisfy rules-of-hooks).
  if (showAbout) {
    return <About onBack={goHome} />
  }
  if (showBacktest) {
    return <Backtest onBack={goHome} />
  }
  if (factorRoute?.index) {
    return <FactorsIndex onBack={goHome} onPick={goFactor} />
  }
  if (factorRoute?.id) {
    return (
      <FactorPage
        factorId={factorRoute.id}
        payload={payload}
        onBack={goHome}
        onIndex={goFactorsIndex}
      />
    )
  }

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
            <button className="button secondary" onClick={goBacktest}>Track record</button>
            <button className="button secondary" onClick={goFactorsIndex}>Factors</button>
            <button className="button secondary" onClick={goAbout}>About</button>
            <span className="eyebrow">Daily · MLB</span>
          </div>
        </div>
        <div className="hero-copy">
          <h1>Daily MLB props, ranked.</h1>
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
            LineDrive ranks the top MLB players (and games) across seven prop categories
            every day. Picks are produced by a heuristic model from public data with no hand
            selection. The <strong>Market</strong> column shows OG.com&rsquo;s implied
            probability when priced.
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
              onClick={() => navigate({ league: 'mlb', date: targetIso })}
              title={disabled ? 'No archive for this date' : ''}
            >
              <span className="date-pill-label">{dayLabel(targetIso)}</span>
              <span className="date-pill-sub">{shortDate(targetIso)}</span>
            </button>
          )
        })}
        {(() => {
          const b = block
          const hasSettled = !!(b?.highlightSettledImages?.length || b?.leaderboardSettledImage)
          if (!hasSettled) return null
          return (
            <div className="view-toggle date-strip-toggle" role="group" aria-label="Card view">
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
          )
        })()}
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
              <section className="board-and-highlights">
                <div className="board-col">
                  {leaderboardFile ? (
                    <img
                      src={imgUrl(payload, leaderboardFile)}
                      alt={`${CATEGORY_LABELS[activeCategory]} leaderboard (${variantLabel})`}
                      className="leaderboard-image"
                    />
                  ) : (
                    <div className="image-placeholder">
                      Leaderboard not rendered for this category.
                    </div>
                  )}
                  <ShareRow
                    payload={payload}
                    filename={leaderboardFile}
                    baseName={dlName(activeCategory, payload.date, variantSuffix.replace(/^-/, '')).replace(/\.png$/, '')}
                    context={{ kind: 'leaderboard', category: activeCategory }}
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
                              const srcUrl = downloadUrl(payload, filename, jpgName)
                              const { text: miniText, url: miniUrl } = composeShareText({
                                kind: 'pick',
                                payload,
                                category: activeCategory,
                              })
                              const onDownload = (e) => {
                                e.preventDefault()
                                downloadAsBlob(srcUrl, jpgName, { format: 'jpeg' })
                              }
                              return (
                                <div key={filename} className="highlight-card-mini">
                                  <img
                                    src={imgUrl(payload, filename)}
                                    alt={`${CATEGORY_LABELS[activeCategory]} #${i + 1}${showResults ? ' (settled)' : ''}`}
                                  />
                                  <div className="highlight-mini-actions">
                                    <span className="highlight-mini-rank">#{i + 1}</span>
                                    <button
                                      type="button"
                                      className="mini-icon-btn"
                                      onClick={onDownload}
                                      title={`Download ${jpgName}`}
                                      aria-label="Download JPEG"
                                    >
                                      <DownloadIcon />
                                    </button>
                                    <TweetButton text={miniText} url={miniUrl} compact />
                                    <ShareButton srcUrl={srcUrl} jpgName={jpgName} text={miniText} title="LineDrive" compact />
                                  </div>
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
                {activeCategory === 'game' ? (
                  <div className="ranked-table">
                    <div className="ranked-table-legend">
                      <strong>Score</strong> = expected total runs. Higher means more scoring.
                    </div>
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
                  </div>
                ) : (
                  <FactorTable
                    block={block}
                    category={activeCategory}
                    oddsMode={oddsMode}
                    goFactor={goFactor}
                  />
                )}
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
                  const srcUrl = downloadUrl(payload, g.cardImage, name)
                  const { text: gText, url: gUrl } = composeShareText({
                    kind: 'game',
                    payload,
                    game: g,
                    category: 'game',
                  })
                  const onDownload = (e) => {
                    e.preventDefault()
                    downloadAsBlob(srcUrl, name, { format: 'jpeg' })
                  }
                  return (
                    <div key={g.gamePk} className="game-card">
                      <img src={imgUrl(payload, g.cardImage)} alt={`${g.awayAbbrev} @ ${g.homeAbbrev}`} />
                      <div className="game-card-meta">
                        <div className="game-card-title">{g.awayAbbrev} @ {g.homeAbbrev}</div>
                        <div className="game-card-sub">
                          {g.modelTotalRuns > 0 && `Model ${g.modelTotalRuns.toFixed(1)} R`}
                          {g.marketLine !== null && ` · OG O/U ${g.marketLine}`}
                        </div>
                        <div className="game-card-actions">
                          <button type="button" className="button secondary" onClick={onDownload}>
                            Download
                          </button>
                          <TweetButton text={gText} url={gUrl} />
                          <ShareButton srcUrl={srcUrl} jpgName={name} text={gText} title="LineDrive" />
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
