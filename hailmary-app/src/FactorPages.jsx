import { useMemo } from 'react'
import { FACTORS, CATEGORY_LABELS, factorsForCategory } from './factors'
import './About.css'
import './Factors.css'

const CATEGORY_ORDER = ['pass_yds', 'pass_td', 'rush_yds', 'rec_yds', 'rec', 'atd']

function FactorHero({ onBack, eyebrow, title, blurb }) {
  return (
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
        <h1>{eyebrow}<em>{title}</em></h1>
        {blurb && <p>{blurb}</p>}
      </div>
    </header>
  )
}

export function FactorsIndex({ onBack, onPick }) {
  return (
    <main className="app-shell about-shell">
      <FactorHero
        onBack={onBack}
        eyebrow="The "
        title="factors"
        blurb="Every pick is the sum of a handful of transparent factors. Here&rsquo;s what each one measures, why it matters, and which prop categories use it. Click any factor for the full explanation."
      />
      {CATEGORY_ORDER.map((cat) => {
        const factors = factorsForCategory(cat)
        if (!factors.length) return null
        return (
          <section className="doc-section" key={cat}>
            <h2>{CATEGORY_LABELS[cat]}</h2>
            <div className="factor-card-grid">
              {factors.map((f) => (
                <button key={`${cat}-${f.id}`} className="factor-card" onClick={() => onPick(f.id)}>
                  <span className="factor-card-col">
                    {f.column}{f.proxy && <sup className="proxy-mark">~</sup>}
                  </span>
                  <span className="factor-card-name">{f.name}</span>
                  <span className="factor-card-desc">{f.description}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </main>
  )
}

// Today's picks ranked by a single factor's raw value (highest first),
// deduped by player and excluding defaulted (neutral) values.
function leadersForFactor(payload, factor) {
  if (!payload?.categories || !factor) return []
  const seen = new Map()
  for (const cat of factor.categories) {
    const block = payload.categories[cat]
    if (!block?.picks) continue
    for (const p of block.picks) {
      const pf = (p.factors || []).find((x) => x.id === factor.id)
      if (!pf || pf.neutral) continue
      const prev = seen.get(p.playerId)
      if (!prev || pf.value > prev.value) {
        seen.set(p.playerId, {
          playerId: p.playerId,
          name: p.playerName,
          team: p.team,
          value: pf.value,
          display: pf.display,
        })
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.value - a.value)
}

export function FactorPage({ factorId, payload, onBack, onIndex }) {
  const factor = FACTORS[factorId]
  const leaders = useMemo(() => leadersForFactor(payload, factor), [payload, factor])

  if (!factor) {
    return (
      <main className="app-shell about-shell">
        <FactorHero onBack={onBack} eyebrow="Unknown " title="factor" />
        <section className="doc-section">
          <p>No factor called &ldquo;{factorId}&rdquo; exists. <button className="link-inline" onClick={onIndex}>See all factors →</button></p>
        </section>
      </main>
    )
  }

  const dirLabel = factor.direction === 'higher-better' ? 'Higher is better' : 'Lower is better'
  const top = leaders.slice(0, 8)

  return (
    <main className="app-shell about-shell">
      <FactorHero
        onBack={onBack}
        eyebrow=""
        title={factor.name}
        blurb={factor.description}
      />

      <section className="doc-section">
        <div className="factor-meta-row">
          <span className="factor-meta-pill">{dirLabel}</span>
          {factor.proxy && <span className="factor-meta-pill proxy">Approximated value</span>}
          <span className="factor-meta-cats">
            Used in: {factor.categories.map((c) => CATEGORY_LABELS[c]).join(', ')}
          </span>
        </div>
        {factor.longExplanation.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        <p className="factor-index-link">
          <button className="link-inline" onClick={onIndex}>← All factors</button>
        </p>
      </section>

      <section className="doc-section">
        <h2>Today&rsquo;s leaders</h2>
        {top.length > 0 ? (
          <table className="weights-table factor-leaders">
            <thead>
              <tr><th>Player</th><th>Team</th><th>{factor.column}</th></tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name}</td>
                  <td>{row.team}</td>
                  <td className="lead-val">{row.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-note">
            No ranked picks on today&rsquo;s slate carry a measured value for this factor yet
            &mdash; check back once today&rsquo;s board has loaded.
          </p>
        )}
      </section>
    </main>
  )
}
