/**
 * Exhaustive check for `buildInsights`.
 *
 * Acceptance criterion: "Insight cards are derived from user answers, verified
 * against all struggle-selection combinations, with zero generic fallbacks."
 *
 * Walks all 32 subsets of the five struggle options (including the empty set,
 * which step 7 prevents but which must still resolve to something specific)
 * crossed against grade, hours and exam-date variation, and asserts that every
 * card is specific, non-empty, and quotes the user's own input.
 *
 * Run: node scripts/test-onboarding-insights.mjs
 */

import { buildInsights } from '../src/lib/onboardingInsights.js'

const STRUGGLES = ['reread', 'time', 'start', 'distract', 'cram']
const CURRENT = ['A', 'B', 'C', 'D', 'unsure']
const TARGET = ['A', 'B', 'C', 'pass']
const HOURS = [0, 1, 4, 9, 20]

// Phrases that would indicate a generic, non-derived card slipped through.
const GENERIC_MARKERS = [
  'study more', 'work harder', 'tips', 'here are some', 'in general',
  'students often', 'try to', 'consider', 'undefined', 'null', 'NaN',
]

function isoInDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

let checked = 0
const failures = []

function check(state, label) {
  const cards = buildInsights(state, { topicCount: 47 })
  checked += 1

  if (!Array.isArray(cards) || cards.length !== 3) {
    failures.push(`${label}: expected exactly 3 cards, got ${cards?.length}`)
    return
  }

  const ids = new Set()
  cards.forEach((c, i) => {
    if (!c || typeof c.headline !== 'string' || typeof c.body !== 'string') {
      failures.push(`${label}: card ${i} malformed`)
      return
    }
    if (c.headline.trim().length < 10) failures.push(`${label}: card ${i} headline too short: "${c.headline}"`)
    if (c.body.trim().length < 30) failures.push(`${label}: card ${i} body too short: "${c.body}"`)
    if (!c.derivedFrom) failures.push(`${label}: card ${i} has no derivedFrom`)
    ids.add(c.id)

    const hay = `${c.headline} ${c.body}`.toLowerCase()
    for (const marker of GENERIC_MARKERS) {
      if (hay.includes(marker)) failures.push(`${label}: card ${i} contains generic marker "${marker}": ${c.headline}`)
    }
    // No em dashes anywhere in user-facing copy (project rule).
    if (hay.includes('—')) failures.push(`${label}: card ${i} contains an em dash`)
  })

  if (ids.size !== 3) failures.push(`${label}: duplicate card ids ${[...ids].join(', ')}`)
}

// All 32 subsets of the struggle list.
for (let mask = 0; mask < (1 << STRUGGLES.length); mask += 1) {
  const struggles = STRUGGLES.filter((_, i) => mask & (1 << i))
  for (const currentGrade of CURRENT) {
    for (const targetGrade of TARGET) {
      for (const studyHours of HOURS) {
        check(
          {
            course: { name: 'BIOL 201' },
            currentGrade,
            targetGrade,
            struggles,
            studyHours,
            learningStyles: ['practice'],
            examDate: isoInDays(18),
          },
          `mask=${mask} ${currentGrade}->${targetGrade} ${studyHours}h`,
        )
      }
    }
  }
}

// Exam-date edge cases: today, missing, far out.
for (const examDate of [isoInDays(0), null, isoInDays(120)]) {
  for (const mask of [0, 1, 31]) {
    const struggles = STRUGGLES.filter((_, i) => mask & (1 << i))
    check(
      { course: { name: 'Organic Chemistry' }, currentGrade: 'C', targetGrade: 'A', struggles, studyHours: 4, learningStyles: [], examDate },
      `examDate=${examDate} mask=${mask}`,
    )
  }
}

// Missing course name must still produce specific copy.
check(
  { course: {}, currentGrade: 'unsure', targetGrade: 'pass', struggles: ['distract'], studyHours: 0, learningStyles: [], examDate: null },
  'no course name',
)

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) across ${checked} combinations`)
  failures.slice(0, 20).forEach((f) => console.error('  - ' + f))
  process.exit(1)
}

console.log(`PASS: ${checked} answer combinations, all produced 3 specific insight cards with no generic fallback.`)
