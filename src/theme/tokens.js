// StudyEdge V2 design tokens — the official design system.
// See CLAUDE.md ("Design System") for the rules that go with these values.
// Everything visual should read from this file; do not hard-code hexes elsewhere.

export const T = {
  bg:        '#F7F8FA',
  card:      '#FFFFFF',
  border:    'rgba(0,0,0,0.07)',
  text:      '#1C1B18',
  muted:     '#5C5952',
  dim:       '#6E6B64',
  blue:      '#3452D9',
  blueHov:   '#2A43B8',
  blueBg:    'rgba(52,82,217,0.08)',
  red:       '#D64545',
  redBg:     'rgba(214,69,69,0.08)',
  redHov:    '#B93A3A',
  amber:     '#8A6A2E',
  amberBg:   'rgba(232,177,74,0.18)',
  neutral:   '#696E78',
  neutralBg: '#EFF1F4',
  green:     '#10A56E',
  greenBg:   'rgba(16,165,110,0.10)',
}

export const SERIF = "'Source Serif 4', Georgia, serif"
export const SANS  = "'Inter', system-ui, sans-serif"

export const COURSE_COLORS = [
  { dot: '#8B5CF6', halo: 'rgba(139,92,246,0.15)' },
  { dot: '#10A56E', halo: 'rgba(16,165,110,0.15)' },
  { dot: '#3B62E8', halo: 'rgba(59,98,232,0.15)' },
  { dot: '#F59E0B', halo: 'rgba(245,158,11,0.15)' },
  { dot: '#EC4899', halo: 'rgba(236,72,153,0.15)' },
  { dot: '#0891B2', halo: 'rgba(8,145,178,0.15)' },
]

export const courseColor = (idx) => COURSE_COLORS[idx % COURSE_COLORS.length]

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 }
export const SPACE  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }

// ── Grade Hub ─────────────────────────────────────────────────────────────────
// Values transcribed from the approved design export in design/grade-hub/
// (canvas turn 2 + "Grade Hub Spec"). Scoped to the Grade Hub so it can carry
// its own typographic system without redefining V2 for the rest of the app.
//
// The rule that governs this palette: color always encodes data, never
// decorates. Every hex below means something specific.
export const GRADE_HUB = {
  // Surfaces
  pageBg:     '#f5f6f8',
  card:       '#ffffff',
  cardBorder: '#e7e8ec',
  cardShadow: '0 1px 3px rgba(28,27,24,.05)',
  rowRule:    '#f0f1f4',  // table row rules, card footer rule
  chipBorder: '#e3e4e8',  // chip borders, dividers inside chips
  ctrlBorder: '#d9dbe1',  // target control border, dashed editable underline

  // Data colors — the four cushion-bar segments
  earned:  '#3452D9',  // points banked
  lost:    '#C9CAD1',  // points gone forever
  needed:  '#B9C5F0',  // still needed / still possible
  cushion: '#B9DFC9',  // headroom above the target cutoff

  // Data colors — status
  green:       '#1a9e5c',  // graded dot, Strong Finish accent + chart
  dotUngraded: '#d3d4d9',  // not-yet-graded dot
  amber:       '#D97706',  // shortfall segment, impossible rule, Front-Loaded
  amberText:   '#b45309',  // impossible-state label, over-100 weight counter

  // Ink
  ink:       '#1C1B18',  // headings, numerals, primary text
  secondary: '#55565c',  // hero setup sentence, inactive nav
  body:      '#6f7075',  // body muted, legend text
  label:     '#8a8b90',  // uppercase section labels, inactive tabs
  colHeader: '#a0a1a6',  // table column headers
  emptyDash: '#c6c7cc',  // the "–" on ungraded rows

  // Action
  blue:      '#3452D9',
  blueHover: '#2a43b8',
}

// Newsreader carries every numeral and heading in the Grade Hub. Loaded once in
// app.html alongside Inter; do not add a second font link.
export const GH_SERIF = "'Newsreader', Georgia, serif"
