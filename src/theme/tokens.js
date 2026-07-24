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
