// Selectable color themes. The default is a generic football palette; the rest
// are NFL team looks. Each `id` maps to a [data-theme="id"] block in index.css
// (the default lives in :root). Fonts are unchanged across all themes.
export const THEMES = [
  { id: 'generic', label: 'Football (default)' },
  { id: 'seahawks', label: 'Seattle Seahawks' },
  { id: 'chiefs', label: 'Kansas City Chiefs' },
  { id: 'eagles', label: 'Philadelphia Eagles' },
  { id: 'niners', label: 'San Francisco 49ers' },
  { id: 'ravens', label: 'Baltimore Ravens' },
]

export const DEFAULT_THEME = 'generic'

export function applyTheme(id) {
  const root = document.documentElement
  if (!id || id === 'generic') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
}
