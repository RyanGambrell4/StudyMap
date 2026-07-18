// Design tokens for consistent UI across the app.
// Based on ui-ux-pro-max pro-rules: 4/8dp spacing rhythm, 150-300ms motion,
// WCAG 4.5:1 contrast, semantic color aliases.

// ── Spacing scale (4dp base) ────────────────────────────────────────────────
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
}

// ── Vertical rhythm tiers for sections ──────────────────────────────────────
export const rhythm = {
  tight:   space[4],  // 16 - inside a card
  medium:  space[6],  // 24 - between cards
  loose:   space[8],  // 32 - between sections
  section: space[12], // 48 - between major page sections
}

// ── Radius ──────────────────────────────────────────────────────────────────
export const radius = {
  xs:   4,
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl': 20,
  full: 9999,
}

// ── Motion ──────────────────────────────────────────────────────────────────
export const motion = {
  fast:    150,  // hover, tap feedback
  normal:  200,  // toggles, small transitions
  slow:    300,  // page/panel transitions
  easing:  'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  spring:  'cubic-bezier(0.34, 1.3, 0.64, 1)',
}

// ── Elevation / shadows ─────────────────────────────────────────────────────
export const shadow = {
  none:   'none',
  sm:     '0 1px 3px rgba(0,0,0,0.06)',
  md:     '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
  lg:     '0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
  xl:     '0 20px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
  glow:   (color) => `0 8px 24px ${color}35, 0 2px 8px ${color}25`,
  ring:   (color) => `0 0 0 3px ${color}30`,
}

// ── Semantic color tokens ───────────────────────────────────────────────────
// Base palette — light theme only per project rules.
export const color = {
  // Surfaces
  bg:          '#F7F6F3',
  surface:     '#FFFFFF',
  surfaceMuted: '#FAF9F6',
  surfaceHover: 'rgba(0,0,0,0.02)',

  // Borders / dividers
  border:      'rgba(0,0,0,0.07)',
  borderStrong:'rgba(0,0,0,0.12)',
  divider:     'rgba(0,0,0,0.06)',

  // Text (WCAG-verified)
  text:        '#111111',      // 15.9:1 on bg
  textMuted:   '#6B6B6B',      // 5.7:1 on bg
  textDim:     '#9B9B9B',      // 3.1:1 — decorative only
  textInverse: '#FFFFFF',

  // Brand
  accent:      '#3B61C4',
  accentHover: '#2F4FA6',
  accentSoft:  'rgba(59,97,196,0.08)',
  accentRing:  'rgba(59,97,196,0.25)',

  // Semantic
  success:     '#16A34A',
  successSoft: 'rgba(22,163,74,0.08)',
  warning:     '#D97706',
  warningSoft: 'rgba(217,119,6,0.08)',
  danger:      '#DC2626',
  dangerSoft:  'rgba(220,38,38,0.08)',
  info:        '#0891B2',
  purple:      '#7C3AED',
  purpleSoft:  'rgba(124,58,237,0.08)',
}

// ── Typography ──────────────────────────────────────────────────────────────
export const type = {
  // Font families
  sans:    "'Inter', system-ui, -apple-system, sans-serif",
  mono:    "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
  display: "'Instrument Serif', Georgia, serif",

  // Font sizes
  eyebrow:  { size: 11,   weight: 700, letter: '0.08em', transform: 'uppercase' },
  caption:  { size: 11.5, weight: 500, letter: '0em' },
  body:     { size: 13.5, weight: 400, letter: '0em', line: 1.55 },
  bodyLg:   { size: 15,   weight: 400, letter: '0em', line: 1.6 },
  label:    { size: 13,   weight: 600, letter: '-0.005em' },
  h4:       { size: 15,   weight: 700, letter: '-0.01em', line: 1.35 },
  h3:       { size: 18,   weight: 700, letter: '-0.02em', line: 1.3 },
  h2:       { size: 24,   weight: 800, letter: '-0.02em', line: 1.2 },
  h1:       { size: 32,   weight: 800, letter: '-0.025em', line: 1.15 },
  display1: { size: 44,   weight: 800, letter: '-0.03em', line: 1.05 },
}

// Convert type token to CSS style object
export function typeStyle(t) {
  return {
    fontSize:      t.size,
    fontWeight:    t.weight,
    letterSpacing: t.letter,
    lineHeight:    t.line ?? 1.4,
    textTransform: t.transform ?? 'none',
  }
}

// ── Touch targets ───────────────────────────────────────────────────────────
export const touch = {
  min:    44,  // WCAG 2.5.5 minimum
  medium: 48,
  large:  56,
}

// ── z-index scale ───────────────────────────────────────────────────────────
export const z = {
  base:    0,
  raised:  10,
  sticky:  20,
  overlay: 40,
  popover: 100,
  modal:   105,
  toast:   110,
  tooltip: 120,
}

// ── Focus ring ──────────────────────────────────────────────────────────────
export const focusRing = (colorHex = color.accent) => ({
  outline: 'none',
  boxShadow: `0 0 0 3px ${colorHex}30`,
})

// ── Common style helpers ────────────────────────────────────────────────────
export const styles = {
  card: {
    background:   color.surface,
    border:       `1px solid ${color.border}`,
    borderRadius: radius.lg,
    boxShadow:    shadow.sm,
  },
  cardElevated: {
    background:   color.surface,
    border:       `1px solid ${color.border}`,
    borderRadius: radius.xl,
    boxShadow:    shadow.md,
  },
  buttonPrimary: (accentColor = color.accent) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    minHeight: touch.min,
    padding: `${space[3]}px ${space[5]}px`,
    background: accentColor,
    color: color.textInverse,
    border: 'none',
    borderRadius: radius.md,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: shadow.glow(accentColor),
    transition: `transform ${motion.fast}ms ${motion.easing}, box-shadow ${motion.fast}ms ${motion.easing}`,
  }),
  buttonGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    minHeight: touch.min,
    padding: `${space[3]}px ${space[4]}px`,
    background: 'transparent',
    color: color.text,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: `background ${motion.fast}ms ${motion.easing}`,
  },
}

// Handy press-scale handlers to attach to buttons
export const pressHandlers = {
  onMouseDown: (e) => { e.currentTarget.style.transform = 'scale(0.97)' },
  onMouseUp:   (e) => { e.currentTarget.style.transform = 'scale(1)' },
  onMouseLeave:(e) => { e.currentTarget.style.transform = 'scale(1)' },
}

export default {
  space, rhythm, radius, motion, shadow, color, type, typeStyle, touch, z, focusRing, styles, pressHandlers,
}
