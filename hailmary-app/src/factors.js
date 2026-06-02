// Frontend mirror of worker/factors.ts, keyed by the same `id` strings (the
// worker↔frontend contract). Adds prose: a one-line `description` and a
// `longExplanation` (paragraphs) for the per-factor explainer pages. Each pick
// carries a pre-formatted `display` per factor, so the table reads that
// directly; `format` here is only for the factor pages' "today's leaders".

const yds = (v) => `${Math.round(v)} yd`
const one = (v) => v.toFixed(1)
const two = (v) => v.toFixed(2)
const pctShare = (v) => `${Math.round(v * 100)}%`

export const FACTORS = {
  // ---- passing ----
  passYds: {
    id: 'passYds', column: 'Pass Y/G', name: 'Passing Yards / Game',
    categories: ['pass_yds', 'pass_td'], direction: 'higher-better', keyColumn: true, format: yds,
    description: 'How many passing yards the QB averages per game — the core volume signal.',
    longExplanation: [
      'A quarterback’s passing yards per game over the sample season. It blends arm volume and efficiency into the single best baseline for a passing-yards projection.',
      'We z-score it against a starter baseline (~218 yd/game). High-volume passers in pass-heavy offenses sit well above; game managers below. Higher is better.',
    ],
  },
  passAtt: {
    id: 'passAtt', column: 'Att/G', name: 'Pass Attempts / Game',
    categories: ['pass_yds'], direction: 'higher-better', format: one,
    description: 'Pass attempts per game — pure passing volume / pace.',
    longExplanation: [
      'Attempts per game capture how often a team throws — a function of offensive scheme, pace, and game scripts that force passing.',
      'More attempts means more yardage opportunity, so it’s a secondary volume input to the passing-yards model. Higher is better.',
    ],
  },
  passAirYds: {
    id: 'passAirYds', column: 'Air Y/G', name: 'Passing Air Yards / Game',
    categories: ['pass_yds'], direction: 'higher-better', format: yds,
    description: 'Yards the ball travels in the air per game — downfield aggression.',
    longExplanation: [
      'Air yards measure how far passes travel before the catch. A QB who throws deep accumulates yardage in chunks and has a higher ceiling.',
      'It’s a lighter input that rewards aggressive, vertical passing offenses. Higher is better.',
    ],
  },
  passTd: {
    id: 'passTd', column: 'Pass TD/G', name: 'Passing TDs / Game',
    categories: ['pass_td'], direction: 'higher-better', keyColumn: true, format: two,
    description: 'Passing touchdowns per game — the anchor of the passing-TD model.',
    longExplanation: [
      'Touchdown passes per game. It’s noisier than yardage (TDs are rarer events), so the model pairs it with the implied team total and the opponent’s TDs-allowed.',
      'Higher is better.',
    ],
  },
  oppPassDef: {
    id: 'oppPassDef', column: 'Opp Pass D', name: 'Opponent Pass Yards Allowed / Game',
    categories: ['pass_yds', 'rec_yds'], direction: 'higher-better', keyColumn: true, format: yds,
    description: 'How many pass yards the opposing defense gives up per game. More = softer matchup.',
    longExplanation: [
      'The opposing defense’s passing yards allowed per game, aggregated from every passer they’ve faced. A high number is a soft secondary — good news for the QB and his receivers.',
      'It’s the matchup core of the passing-yards and receiving-yards models. Higher (more allowed) is better for the player.',
    ],
  },
  oppPassTdDef: {
    id: 'oppPassTdDef', column: 'Opp PaTD', name: 'Opponent Pass TDs Allowed / Game',
    categories: ['pass_td'], direction: 'higher-better', keyColumn: true, format: two,
    description: 'Passing TDs the opposing defense allows per game. More = easier TD matchup.',
    longExplanation: [
      'How many touchdown passes the opposing defense surrenders per game. Defenses that bend in the red zone inflate a QB’s TD ceiling.',
      'Higher (more allowed) is better for the passer.',
    ],
  },
  // ---- rushing ----
  rushYds: {
    id: 'rushYds', column: 'Rush Y/G', name: 'Rushing Yards / Game',
    categories: ['rush_yds'], direction: 'higher-better', keyColumn: true, format: yds,
    description: 'Rushing yards per game — the lead signal for a rush-yards projection.',
    longExplanation: [
      'A back’s rushing yards per game. It captures both talent and role; lead backs in run-first offenses dominate here.',
      'Z-scored against a ~48 yd/game baseline. Higher is better.',
    ],
  },
  carries: {
    id: 'carries', column: 'Carries/G', name: 'Carries / Game',
    categories: ['rush_yds'], direction: 'higher-better', keyColumn: true, format: one,
    description: 'Carries per game — workload / opportunity, the stickiest rushing signal.',
    longExplanation: [
      'Carries per game is the most stable predictor of rushing production: volume is earned and tends to persist. A workhorse back (16+ carries) has a far higher floor than a committee back.',
      'Higher is better.',
    ],
  },
  oppRushDef: {
    id: 'oppRushDef', column: 'Opp Run D', name: 'Opponent Rush Yards Allowed / Game',
    categories: ['rush_yds'], direction: 'higher-better', keyColumn: true, format: yds,
    description: 'Rush yards the opposing defense allows per game. More = softer run matchup.',
    longExplanation: [
      'The opposing defense’s rushing yards allowed per game. Soft run fronts let backs eat; stout ones cap them.',
      'Higher (more allowed) is better for the runner.',
    ],
  },
  gameScript: {
    id: 'gameScript', column: 'Spread', name: 'Game Script (Favored By)',
    categories: ['rush_yds'], direction: 'higher-better', format: (v) => `${v.toFixed(0)}`,
    description: 'How favored the player’s team is — favorites run more to close games out.',
    longExplanation: [
      'Game script is derived from the point spread: a favored team tends to lead late and lean on the run to bleed clock, boosting its backs’ carries and yardage. Underdogs abandon the run.',
      'A positive value means the player’s team is favored by that many points. Higher (bigger favorite) is better for rushing.',
    ],
  },
  // ---- receiving ----
  recYds: {
    id: 'recYds', column: 'Rec Y/G', name: 'Receiving Yards / Game',
    categories: ['rec_yds'], direction: 'higher-better', keyColumn: true, format: yds,
    description: 'Receiving yards per game — the lead signal for a receiving-yards projection.',
    longExplanation: [
      'A pass-catcher’s receiving yards per game, blending volume, role, and big-play ability.',
      'Z-scored against a ~42 yd/game starter baseline. Higher is better.',
    ],
  },
  receptions: {
    id: 'receptions', column: 'Rec/G', name: 'Receptions / Game',
    categories: ['rec'], direction: 'higher-better', keyColumn: true, format: one,
    description: 'Catches per game — the anchor of the receptions model.',
    longExplanation: [
      'Receptions per game. PPR-style volume that, like carries for backs, is largely role-driven and stable.',
      'Higher is better.',
    ],
  },
  targets: {
    id: 'targets', column: 'Tgts/G', name: 'Targets / Game',
    categories: ['rec'], direction: 'higher-better', keyColumn: true, format: one,
    description: 'Targets per game — opportunity, the leading indicator of receptions.',
    longExplanation: [
      'Targets per game is the opportunity behind receptions; it stabilizes faster than catches and predicts future production better.',
      'Higher is better.',
    ],
  },
  targetShare: {
    id: 'targetShare', column: 'Tgt%', name: 'Target Share',
    categories: ['rec_yds', 'rec'], direction: 'higher-better', keyColumn: true, format: pctShare,
    description: 'Share of the team’s targets the player commands — role and trust.',
    longExplanation: [
      'The percentage of his team’s total targets a receiver earns. A 25%+ share marks a clear No. 1 option who gets fed regardless of game flow.',
      'It’s a core input to both receiving models. Higher is better.',
    ],
  },
  airYardsShare: {
    id: 'airYardsShare', column: 'AY%', name: 'Air Yards Share',
    categories: ['rec_yds'], direction: 'higher-better', format: pctShare,
    description: 'Share of the team’s downfield air yards — big-play role.',
    longExplanation: [
      'The share of his team’s total air yards a receiver accounts for — how much of the downfield passing game runs through him. High air-yards share means a high yardage ceiling.',
      'Higher is better.',
    ],
  },
  wopr: {
    id: 'wopr', column: 'WOPR', name: 'Weighted Opportunity Rating',
    categories: ['rec_yds', 'rec'], direction: 'higher-better', format: two,
    description: 'A blend of target share and air-yards share — overall receiving opportunity.',
    longExplanation: [
      'WOPR (Weighted Opportunity Rating) combines target share and air-yards share into one number that captures a receiver’s total opportunity. It’s one of the best single predictors of receiving output.',
      'Higher is better.',
    ],
  },
  oppRecDef: {
    id: 'oppRecDef', column: 'Opp Rec', name: 'Opponent Receptions Allowed / Game',
    categories: ['rec'], direction: 'higher-better', format: one,
    description: 'Catches the opposing defense allows per game. More = easier reception matchup.',
    longExplanation: [
      'How many receptions the opposing defense gives up per game — softer coverage means more catches available.',
      'Higher (more allowed) is better for the receiver.',
    ],
  },
  // ---- anytime TD ----
  anytimeTd: {
    id: 'anytimeTd', column: 'TD/G', name: 'Anytime TDs / Game',
    categories: ['atd'], direction: 'higher-better', keyColumn: true, format: two,
    description: 'Rushing + receiving TDs per game — the anchor of the anytime-TD model.',
    longExplanation: [
      'Combined rushing and receiving touchdowns per game. TDs are volatile week to week, so the model leans on this rate plus team scoring environment and matchup.',
      'Higher is better.',
    ],
  },
  oppTdDef: {
    id: 'oppTdDef', column: 'Opp TD D', name: 'Opponent TDs Allowed / Game',
    categories: ['atd'], direction: 'higher-better', keyColumn: true, format: two,
    description: 'Total TDs (pass + rush) the opposing defense allows per game.',
    longExplanation: [
      'The opposing defense’s total touchdowns allowed per game. Defenses that surrender the end zone lift every skill player’s scoring odds.',
      'Higher (more allowed) is better.',
    ],
  },
  volume: {
    id: 'volume', column: 'Touches', name: 'Touches + Targets / Game',
    categories: ['atd'], direction: 'higher-better', format: one,
    description: 'Carries plus targets per game — total scoring opportunity.',
    longExplanation: [
      'Carries plus targets is the player’s total touch/target opportunity — and touchdowns follow opportunity, especially near the goal line.',
      'Higher is better.',
    ],
  },
  involvement: {
    id: 'involvement', column: 'Yds/G', name: 'Total Yards / Game',
    categories: ['atd'], direction: 'higher-better', format: yds,
    description: 'Rushing + receiving yards per game — overall offensive involvement.',
    longExplanation: [
      'Total yards from scrimmage per game. Players who move the ball a lot are on the field in scoring situations and convert more often.',
      'Higher is better.',
    ],
  },
  // ---- shared game environment ----
  impliedTotal: {
    id: 'impliedTotal', column: 'Tm Total', name: 'Implied Team Total',
    categories: ['pass_yds', 'pass_td', 'rush_yds', 'rec_yds', 'atd'], direction: 'higher-better', keyColumn: true, format: one,
    description: 'Points the player’s team is expected to score, from the betting spread + total.',
    longExplanation: [
      'The implied team total is derived from the game’s point spread and total: it’s how many points Vegas expects the player’s team to score. More team points means more yards, more TDs, more of everything for that team’s skill players.',
      'It’s the single best "game environment" signal and feeds nearly every player model. Higher is better.',
    ],
  },
}

export const CATEGORY_LABELS = {
  pass_yds: 'Passing Yards',
  pass_td: 'Passing TDs',
  rush_yds: 'Rushing Yards',
  rec_yds: 'Receiving Yards',
  rec: 'Receptions',
  atd: 'Anytime TD',
}

export function factorsForCategory(category) {
  return Object.values(FACTORS).filter((f) => f.categories.includes(category))
}
