// StudyEdge AI V2 design tokens: the official design system.
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

  // Data colors: the four cushion-bar segments
  earned:  '#3452D9',  // points banked
  lost:    '#C9CAD1',  // points gone forever
  needed:  '#B9C5F0',  // still needed / still possible
  cushion: '#B9DFC9',  // headroom above the target cutoff

  // Data colors: status
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

// ── Study Coach ───────────────────────────────────────────────────────────────
// Values transcribed from the approved design export in design/study-coach/
// (canvas turn 3 + "Study Coach Spec", section 3). The Study Coach shares the
// Grade Hub's design language, so every neutral and surface below is the same
// value GRADE_HUB already defines and is aliased rather than redefined; only
// the handful of colors specific to plan progress are new.
//
// Same governing rule as the Grade Hub: color encodes data, never decorates.
export const STUDY_COACH = {
  // Surfaces and neutrals, shared with the Grade Hub
  pageBg:     GRADE_HUB.pageBg,      // #f5f6f8
  card:       GRADE_HUB.card,
  cardBorder: GRADE_HUB.cardBorder,
  cardShadow: GRADE_HUB.cardShadow,
  rowRule:    GRADE_HUB.rowRule,     // inner row rules in the week accordion
  ink:        GRADE_HUB.ink,         // H1, session titles, numerals
  secondary:  GRADE_HUB.secondary,   // focus lines, amber body, pushed text
  body:       GRADE_HUB.body,        // row focus lines, bar legend
  label:      GRADE_HUB.label,       // eyebrows, meta, week summaries, carets
  faint:      GRADE_HUB.colHeader,   // provenance line, done-row meta (#a0a1a6)
  strike:     GRADE_HUB.emptyDash,   // done-row strikethrough (#c6c7cc)

  // Data colors: the progress bar and its states
  done:           '#3452D9',  // done segment, Start session, up-next numerals
  stillScheduled: '#B9C5F0',  // not-yet-due segment; whole track when done = 0
  behind:         '#D97706',  // behind segment, amber rule, struggle dots
  behindText:     '#b45309',  // amber block label, Catch up button text
  green:          '#1a9e5c',  // session done check, week Complete, pushed dot

  // Action
  blue:      GRADE_HUB.blue,
  blueHover: GRADE_HUB.blueHover,

  // The up-next row highlight inside the week accordion
  upNextBg: '#f8f9fb',
}

// The Study Coach sets its headings and numerals in the same serif as the
// Grade Hub. Alias rather than a second declaration so there is one name to
// change if the display face ever moves.
export const SC_SERIF = GH_SERIF

// ── Practice Exams ────────────────────────────────────────────────────────────
// Values transcribed from the approved design export in design/practice-exams/
// (states A, B and C). Every surface and neutral the export uses is a value
// GRADE_HUB already defines, so this block aliases rather than redefines; the
// redesign introduced no new hex.
//
// Same governing rule as the Grade Hub and the Study Coach: color encodes
// data. The three score colors below are the only place color is decided by a
// number, and their thresholds live in utils/practiceExams.js.
export const PRACTICE_EXAMS = {
  // Surfaces and neutrals
  pageBg:     GRADE_HUB.pageBg,      // #f5f6f8
  card:       GRADE_HUB.card,
  cardBorder: GRADE_HUB.cardBorder,  // #e7e8ec, also the chip and toggle rule
  cardShadow: GRADE_HUB.cardShadow,
  ink:        GRADE_HUB.ink,         // H1, chip labels, course names, mid scores
  secondary:  GRADE_HUB.secondary,   // eyebrow, subtext, source line, row meta
  label:      GRADE_HUB.label,       // fallback course dot when a course is gone

  // Data colors: the score bands
  green: GRADE_HUB.green,  // #1a9e5c, 85 and up
  amber: GRADE_HUB.amber,  // #D97706, below 70, and the no-material line

  // Action
  blue:      GRADE_HUB.blue,
  blueHover: GRADE_HUB.blueHover,
}

// Practice Exams sets its H1, its score numerals and the history card heading
// in the same serif as the Grade Hub and the Study Coach.
export const PE_SERIF = GH_SERIF

// ── Knowledge Map ─────────────────────────────────────────────────────────────
// Values transcribed from the approved design export in design/knowledge-map/
// (8 states, "1 Map Populated" through "8 Topic Detail"). The Knowledge Map
// shares the Grade Hub's design language, so every surface and neutral it has
// in common is aliased rather than redefined. Only the neutrals the export
// introduces are new values.
//
// Same governing rule as the Grade Hub and Study Coach: color encodes data,
// never decorates. The three status colors below are the whole vocabulary of
// this screen; nothing else on the page is allowed to be green or amber.
export const KNOWLEDGE_MAP = {
  // Surfaces and neutrals, shared with the Grade Hub
  pageBg:     GRADE_HUB.pageBg,      // #f5f6f8
  card:       GRADE_HUB.card,
  cardBorder: GRADE_HUB.cardBorder,  // #e7e8ec
  cardShadow: GRADE_HUB.cardShadow,
  rowRule:    GRADE_HUB.rowRule,     // #f0f1f4, topic row separators
  ink:        GRADE_HUB.ink,         // #1C1B18, H1, topic names, numerals
  secondary:  GRADE_HUB.secondary,   // #55565c, subtext, evidence lines, eyebrows

  // Status: the only three states a topic can be in
  solid:    GRADE_HUB.green,   // #1a9e5c
  shaky:    GRADE_HUB.amber,   // #D97706
  untested: GRADE_HUB.secondary, // #55565c, the word; the dot uses `hollow`

  // Neutrals the export introduces that the Grade Hub does not carry
  stale:       '#8a8b91',  // the "(a while ago)" suffix on an aged evidence line
  hollow:      '#b6b7bd',  // untested dot border, row chevron, sparkline stroke
  placeholder: '#9a9ba1',  // "Or type any topic" input placeholder
  disabled:    '#c9cbd4',  // primary button before a topic is chosen
  chipHover:   '#d5d7de',  // course chip border on hover
  tileHover:   '#c9cbd4',  // topic tile border on hover
  rowHover:    '#fafbfc',  // topic row background on hover
  selectedRow: '#f5f6f8',  // the row backing the open topic detail panel

  // Topic detail panel
  scrim:       'rgba(28,27,24,.24)',
  panelShadow: '-8px 0 28px rgba(28,27,24,.08)',

  // Action
  blue:      GRADE_HUB.blue,       // #3452D9
  blueHover: GRADE_HUB.blueHover,  // #2a43b8
}

// The Knowledge Map sets its headings, countdown, and score numerals in the
// same serif as the Grade Hub and Study Coach.
export const KM_SERIF = GH_SERIF

// Status thresholds and staleness, in one place because both the map and its
// tests read them. A topic is Solid at 80 and above, Shaky below, Untested
// with no scored evidence at all. Evidence keeps its status once it ages past
// STALE_DAYS but is marked stale in the UI.
export const KM_SOLID_AT = 80
export const KM_STALE_DAYS = 14
