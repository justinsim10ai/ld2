import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from './factors'
import './About.css'
import './Backtest.css'

const CATEGORY_ORDER = ['pass_yds', 'pass_td', 'rush_yds', 'rec_yds', 'rec', 'atd']

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const money = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`)
const roiStr = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`)

function Stat({ label, value, tone }) {
  return (
    <div className={`bt-stat ${tone ?? ''}`}>
      <span className="bt-stat-value">{value}</span>
      <span className="bt-stat-label">{label}</span>
    </div>
  )
}

const COLUMNS = [
  { key: 'category', label: 'Category', numeric: false },
  { key: 'picks', label: 'Picks', numeric: true },
  { key: 'hitRate', label: 'Hit rate', numeric: true },
  { key: 'marketImpliedHitRate', label: 'Market implied', numeric: true },
  { key: 'roi', label: 'ROI', numeric: true },
  { key: 'profit', label: 'Profit', numeric: true },
]

export default function Backtest({ onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState({ key: 'roi', dir: 'desc' })

  const onSort = (col) => setSort((prev) => {
    if (prev.key === col.key) return { key: col.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
    return { key: col.key, dir: col.numeric ? 'desc' : 'asc' } // numbers default high→low
  })

  useEffect(() => {
    let live = true
    fetch('/api/backtest/mlb')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (live) { setData(d); setLoading(false) } })
      .catch((e) => { if (live) { setError(String(e)); setLoading(false) } })
    return () => { live = false }
  }, [])

  const o = data?.overall
  const toneOf = (v) => (v == null ? '' : v >= 0 ? 'pos' : 'neg')

  return (
    <main className="app-shell about-shell">
      <header className="hero-panel about-hero">
        <div className="hero-top">
          <div className="hero-brand">
            <span className="brand-mark" aria-hidden="true">🏈</span>
            <div className="hero-brand-text">
              <span className="tag">HailMary</span>
              <span className="sub">Find Your Edge</span>
            </div>
          </div>
          <button className="button secondary" onClick={onBack}>← Today&rsquo;s board</button>
        </div>
        <div className="hero-copy">
          <h1>The <em>track record</em>.</h1>
          <p>
            How LineDrive&rsquo;s top picks have actually performed against the market, settled
            against real game results. Hit rate is wins over finalized picks; ROI is profit on a flat
            <strong> $10 stake</strong> per pick (only picks that had OG odds count toward ROI). No
            cherry-picking &mdash; every ranked pick is graded.
          </p>
        </div>
      </header>

      {loading && <section className="doc-section"><p>Loading results…</p></section>}
      {error && <section className="doc-section"><p>Couldn&rsquo;t load backtest: {error}</p></section>}

      {data && !data.dateCount && (
        <section className="doc-section">
          <p className="muted-note">No settled results yet. Picks are graded the morning after each
            slate, so the track record fills in once games have been played and settled.</p>
        </section>
      )}

      {data && data.dateCount > 0 && (
        <>
          <section className="doc-section">
            <h2>Overall</h2>
            <div className="bt-stat-row">
              <Stat label="Picks graded" value={o.picks} />
              <Stat label="Hit rate" value={pct(o.hitRate)} />
              <Stat label="ROI (flat $10)" value={roiStr(o.roi)} tone={toneOf(o.roi)} />
              <Stat label="Net profit" value={money(o.profit)} tone={toneOf(o.profit)} />
            </div>
            <p className="muted-note">
              {data.dateCount} slate{data.dateCount === 1 ? '' : 's'}
              {data.dateRange ? `, ${data.dateRange.start} → ${data.dateRange.end}` : ''}.
              Model hit rate vs. the market&rsquo;s implied{' '}
              {o.marketImpliedHitRate != null ? pct(o.marketImpliedHitRate) : '—'}.
            </p>
          </section>

          <section className="doc-section">
            <h2>By category</h2>
            <table className="weights-table bt-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`bt-th ${col.numeric ? 'bt-th-num' : ''} ${sort.key === col.key ? 'bt-th-active' : ''}`}
                      onClick={() => onSort(col)}
                    >
                      {col.label}
                      <span className="bt-arrow">{sort.key === col.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER
                  .map((c) => (data.byCategory[c] ? { c, label: CATEGORY_LABELS[c] ?? c, ...data.byCategory[c] } : null))
                  .filter(Boolean)
                  .sort((a, b) => {
                    if (sort.key === 'category') {
                      return sort.dir === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label)
                    }
                    const av = a[sort.key], bv = b[sort.key]
                    if (av == null && bv == null) return 0
                    if (av == null) return 1 // nulls always last
                    if (bv == null) return -1
                    return sort.dir === 'desc' ? bv - av : av - bv
                  })
                  .map((s) => (
                    <tr key={s.c}>
                      <td>{s.label}</td>
                      <td>{s.picks}</td>
                      <td>{pct(s.hitRate)}</td>
                      <td className="bt-muted">{pct(s.marketImpliedHitRate)}</td>
                      <td className={`bt-${toneOf(s.roi)}`}>{roiStr(s.roi)}</td>
                      <td className={`bt-${toneOf(s.profit)}`}>{money(s.profit)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="muted-note">
              &ldquo;Market implied&rdquo; is the average win probability the OG line assigned to our
              picks. When our hit rate beats it, the model is finding edges the market missed.
            </p>
          </section>
        </>
      )}
    </main>
  )
}
