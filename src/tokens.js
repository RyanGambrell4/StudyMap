// StudyEdge AI design tokens.
//
// Single source of truth for color, spacing, typography, and shadow values
// used across the app shell (everything inside the authenticated product).
//
// Migration status: components currently inline the canonical hex values via
// per-file `const D = { ... }` palettes. The values in those palettes mirror
// `T` below. The intent is that new code imports from this file and old code
// migrates one view at a time during scoped refactors. Do not mass-replace.
//
// Light theme is the only theme. The landing page (`src/components/LandingPage.jsx`)
// is the one intentional exception and uses the separate `LANDING_DARK`
// namespace below. The share card modal in `OutputView.jsx` is also
// intentionally dark for the screenshot aesthetic and is not tokenized.

export const T = {
  // Surfaces
  bg:           '#F7F6F3',
  bgCard:       '#FFFFFF',
  bgEl:         '#F0EFEC',

  // Borders
  border:       'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.12)',

  // Text
  text:         '#111111',
  muted:        '#6B6B6B',
  dim:          '#9B9B9B',

  // Brand
  accent:       '#3B61C4',
  accentGlow:   'rgba(59,97,196,0.2)',
  accentSoft:   'rgba(59,97,196,0.08)',
  onAccent:     '#FFFFFF',   // text/icon color for surfaces filled with `accent`

  // Status
  mint:         '#16A34A',   // success / on-track
  orange:       '#E8531A',   // warning / streak (legacy accent in some palettes)
  amber:        '#D97706',   // caution
  pink:         '#DC2626',   // error / negative
  pinkSoft:     'rgba(220,38,38,0.10)',   // subtle red-tinted surface (urgent chip bg)
  sky:          '#2563EB',   // info

  // Overlay (behind modals)
  overlay:      'rgba(16,20,28,0.45)',

  // Per-course palette (used as fallbacks when a course doesn't carry its own
  // `color.dot`). Six entries to cycle through.
  course: ['#3B82F6', '#6366F1', '#059669', '#D97706', '#EC4899', '#0891B2'],

  // Spacing radius
  radius: {
    sm:   8,
    md:   12,
    lg:   14,
    xl:   20,
    full: 9999,
  },

  // Shadows
  shadow: {
    card:  '0 1px 3px rgba(0,0,0,0.06)',
    modal: '0 16px 48px rgba(0,0,0,0.12)',
    float: '0 8px 32px rgba(0,0,0,0.10)',
  },

  // Typography presets
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: '#9B9B9B',
  },
}

// Landing page only. Do not import into the app shell.
// Mirrors the values inlined inside `src/components/LandingPage.jsx`.
export const LANDING_DARK = {
  bg:           '#060614',
  text:         '#FFFFFF',
  textMuted:    'rgba(255,255,255,0.75)',
  textDim:      'rgba(255,255,255,0.6)',
  border:       'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.2)',
  glass:        'rgba(255,255,255,0.08)',
  accent:       '#3B61C4',
}
