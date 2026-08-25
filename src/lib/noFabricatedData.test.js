/**
 * A new account must end up with exactly what it created, and nothing else.
 *
 * The defect this locks down shipped to production behind CourseRequiredGate,
 * which every account with zero courses is funnelled through. Onboarding step 2
 * rendered a badge reading "AI built your plan", a week of sessions, and three
 * courses with green "Ready" pills, all under the heading "Your study plan is
 * ready." No AI had run, no schedule existed, and the course names came from a
 * hardcoded array keyed on school type:
 *
 *   uni: ['Intro Psychology', 'Calculus II', 'Organic Chemistry']
 *
 * A student who typed a real course got theirs plus two invented ones. The very
 * next screen then asked them to add their first course, because
 * handleOnboardingComplete calls setCourses([]).
 *
 * These tests assert on the two things that actually matter:
 *   1. no fabricated STRING is reachable from the module at all, so the array
 *      cannot quietly come back, and
 *   2. nothing is WRITTEN that the student did not supply, which is the part
 *      that would otherwise turn a cosmetic lie into phantom rows.
 *
 * Read alongside supabaseErrorSwallow.test.js: same idea, a defect class pinned
 * by a test rather than trusted to stay fixed.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (p) => readFileSync(p, 'utf8')

/**
 * Source with comments removed.
 *
 * Needed because the fix documents the old fabricated copy in a comment, in
 * order to explain why it went. A test that greps raw source would fire on its
 * own explanation and push the next person to delete the reasoning to get green.
 */
const readCode = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')

// Names that only ever appeared as invented course data. Deliberately not
// generic words: a student may legitimately create a course called "Calculus
// II", and this must not fire on a placeholder= attribute or a marketing page.
const FABRICATED_COURSE_NAMES = [
  'Intro Psychology',
  'AP English Literature',
  'Practice Sections',
  'Concept Review',
  'Timed Drills',
]

// Surfaces a signed-in student sees as their own data. Blurred, non-interactive
// ghost previews behind an empty or locked state are excluded on purpose and
// listed in ALLOWED_GHOST_PREVIEWS below.
const USER_DATA_SURFACES = [
  'src/components/Onboarding.jsx',
  'src/components/CourseRequiredGate.jsx',
]

describe('onboarding does not invent course data', () => {
  it('has no hardcoded course-name list', () => {
    const src = readCode('src/components/Onboarding.jsx')
    for (const name of FABRICATED_COURSE_NAMES) {
      expect(src, `Onboarding.jsx must not contain the invented course name "${name}"`).not.toContain(name)
    }
  })

  it('does not claim an AI built anything, or that a plan exists, before one does', () => {
    const src = readCode('src/components/Onboarding.jsx').toLowerCase()
    // Onboarding runs before any generation, so each of these is a claim about
    // work that has not happened. "ready to build" is fine and deliberately not
    // matched: it is the future tense, and it is true.
    const claims = [
      /ai built your plan/,
      /your study plan is ready(?!\s+to\s+build)/,
      /opening your full plan/,
      /\bready\b[^\n]{0,40}<\/div>\s*$/m,   // a bare "Ready" pill on a data row
    ]
    for (const claim of claims) {
      expect(src, `Onboarding.jsx must not assert ${claim} before anything is generated`).not.toMatch(claim)
    }
  })

  it('does not attribute invented copy to an AI Study Coach', () => {
    // The old step 2 rendered a template string under an "AI Study Coach"
    // label. If a coach quote returns it must come from a real generation.
    const src = readCode('src/components/Onboarding.jsx')
    expect(src).not.toContain('AI Study Coach')
  })

  it('persists only the answers the student actually gave', () => {
    const src = readCode('src/components/Onboarding.jsx')
    const match = src.match(/const profileData = \{([^}]*)\}/)
    expect(match, 'profileData literal not found; update this test if it was renamed').toBeTruthy()
    const keys = match[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean)
    // Every key here is either collected by a control on screen or explicitly
    // null. Adding one means adding the control that asks for it.
    expect(keys.sort()).toEqual(
      ['courseName', 'emailDigest', 'examDate', 'learningStyle', 'preferredTime', 'schoolType', 'yearLevel'].sort()
    )
  })

  it('does not record a consent the flow never asks for', () => {
    // There is no digest checkbox in this flow. Until there is, the honest
    // value is false. See the comment on profileData for why this is not
    // simply "restore the checkbox".
    const src = readCode('src/components/Onboarding.jsx')
    expect(src).toMatch(/emailDigest:\s*false/)
    expect(src, 'emailDigest must not default to true while no control asks for it').not.toMatch(/emailDigest:\s*true/)
  })
})

describe('the first-course gate writes only what was typed', () => {
  it('does not invent a target grade', () => {
    // targetGrade is not cosmetic. generateSchedule multiplies study time by
    // GRADE_MULTIPLIERS.A = 1.6 against a ?? 1.0 fallback, so defaulting to 'A'
    // silently schedules 60 percent more work than the student asked for.
    const src = readCode('src/components/CourseRequiredGate.jsx')
    expect(src, "CourseRequiredGate must not write targetGrade; the form never asks").not.toMatch(/targetGrade:\s*'/)
  })

  it('does not invent a difficulty', () => {
    const src = readCode('src/components/CourseRequiredGate.jsx')
    expect(src, "CourseRequiredGate must not write difficulty; the form never asks").not.toMatch(/difficulty:\s*'/)
  })

  it('sends exactly the fields the form collects, plus id and colour', () => {
    const src = readCode('src/components/CourseRequiredGate.jsx')
    const call = src.match(/onAddCourse\?\.\(\{([\s\S]*?)\n\s*\}\)/)
    expect(call, 'onAddCourse call not found; update this test if it was refactored').toBeTruthy()
    const keys = call[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .map(l => l.split(':')[0].replace(/,$/, '').trim())
      .filter(Boolean)
    // name and examDate are typed by the student. code is '' because this short
    // form has no code field. id and color are ours to assign.
    expect(keys.sort()).toEqual(['code', 'color', 'examDate', 'id', 'name'].sort())
  })
})

describe('no user-facing surface presents invented data as the student\'s own', () => {
  // Blurred, pointer-events:none previews behind an empty or locked state are a
  // legitimate way to show what a feature looks like. They are excluded by
  // name, with the reason, so adding a new one is a deliberate act.
  const ALLOWED_GHOST_PREVIEWS = {
    'src/components/StudyCoachView.jsx':
      'fakeWeeks, rendered at blur(3px) opacity 0.45 pointerEvents none behind the zero-courses empty state',
    'src/components/GradeHubView.jsx':
      'fakeRows, rendered at blur(4px) opacity 0.4 pointerEvents none behind LockedState',
  }

  it.each(USER_DATA_SURFACES)('%s contains no invented course names', (file) => {
    const src = readCode(file)
    for (const name of FABRICATED_COURSE_NAMES) {
      expect(src, `${file} must not contain "${name}"`).not.toContain(name)
    }
  })

  it('every ghost preview is still blurred and non-interactive', () => {
    // If one of these is ever un-blurred it stops being an illustration and
    // starts being a claim, which is exactly how the onboarding defect read.
    for (const [file, why] of Object.entries(ALLOWED_GHOST_PREVIEWS)) {
      const src = read(file)
      expect(src, `${file} is allow-listed as a ghost preview (${why}) but no longer blurs`).toMatch(/filter:\s*'blur\(/)
      expect(src, `${file} ghost preview must stay non-interactive`).toMatch(/pointerEvents:\s*'none'/)
    }
  })
})
