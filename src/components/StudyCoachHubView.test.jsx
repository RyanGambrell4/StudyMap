/**
 * Render smoke tests for the hub and intake step 1.
 *
 * Server-rendering each designed state catches the JSX-prop-scope crashes this
 * repo has shipped before (build succeeds, every user hits an error boundary),
 * and pins the copy the export specifies.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StudyCoachHubView from './StudyCoachHubView'
import StudyCoachIntakeStep from './StudyCoachIntakeStep'
import { toHubEntry } from '../utils/coachHub'
import { addDays } from '../../lib/shared/coachPlan.js'

const TODAY = '2026-11-25'

beforeAll(() => {
  globalThis.window = globalThis.window ?? {}
  globalThis.window.matchMedia = () => ({
    matches: globalThis.__MOBILE__ === true,
    addEventListener() {}, removeEventListener() {},
  })
})

function saved({ total, done, examDate }) {
  return {
    plan: {
      examDate,
      weeklyFocus: [{
        sessions: Array.from({ length: total }, (_, i) => ({
          id: `s${i}`, focusArea: `T${i}`, duration: 45, done: i < done,
        })),
      }],
    },
    formData: {},
  }
}

const course = (name, dot) => ({ id: name, name, color: { dot } })

const entries = (specs) => specs.map((s, i) =>
  toHubEntry(course(s.name, s.dot ?? '#3452D9'), i, s.noPlan ? null : saved(s))
)

const renderHub = (list) => renderToStaticMarkup(
  <StudyCoachHubView
    entries={list}
    today={TODAY}
    onOpenPlan={() => {}}
    onBuildPlan={() => {}}
    onNewPlan={() => {}}
  />
)

describe('hub: the four designed states', () => {
  it('Normal', () => {
    const html = renderHub(entries([
      { name: 'Cell Biology', total: 12, done: 7, examDate: addDays(TODAY, 12) },
      { name: 'Organic Chemistry', total: 9, done: 2, examDate: addDays(TODAY, 19) },
      { name: 'Intro to Psyc', noPlan: true },
    ]))
    expect(html).toContain('Study Coach')
    expect(html).toContain('One plan per course, built only from what you tell me.')
    expect(html).toContain('New plan')
    expect(html).toContain('UP NEXT')
    expect(html).toContain('Cell Biology')
    expect(html).toContain('>12<')                    // hero numeral
    expect(html).toContain('days until Exam Day')
    expect(html).toContain('7 of 12 sessions done')
    expect(html).toContain('Open plan')
    expect(html).toContain('ALL COURSES')
    expect(html).toContain('Exam Day in 19 days')
    expect(html).toContain('No plan yet')
    expect(html).toContain('Build plan')
    // The deleted furniture stays deleted.
    expect(html).not.toContain('Plans Ready')
    expect(html).not.toContain('Study Hours')
    expect(html).not.toContain('Plan ready')
    expect(html).not.toMatch(/confidence/i)
  })

  it('Deadline passed: never a negative number', () => {
    const html = renderHub(entries([
      { name: 'Cell Biology', total: 12, done: 7, examDate: addDays(TODAY, 12) },
      { name: 'Linear Algebra', total: 4, done: 1, examDate: addDays(TODAY, -81) },
    ]))
    expect(html).toContain('Exam passed')
    expect(html).not.toContain('-81')
    expect(html).not.toMatch(/>-\d+d?</)
  })

  it('First time', () => {
    const html = renderHub(entries([
      { name: 'Cell Biology', noPlan: true },
      { name: 'Linear Algebra', noPlan: true },
    ]))
    expect(html).toContain('GET STARTED')
    expect(html).toContain('Build your first plan.')
    expect(html).toContain('nothing invented')
    expect(html).toContain('Build a plan')
    expect(html).toContain('YOUR COURSES')
    expect(html).not.toContain('UP NEXT')
    expect(html).not.toContain('sessions done')
  })

  it('All caught up', () => {
    const html = renderHub(entries([
      { name: 'Cell Biology', total: 12, done: 12, examDate: addDays(TODAY, 5) },
      { name: 'Organic Chemistry', total: 9, done: 6, examDate: addDays(TODAY, 6) },
    ]))
    expect(html).toContain("All 12 sessions done. You&#x27;re ready.")
    expect(html).toContain('Review plan')
    expect(html).toContain('#1a9e5c')                 // green done treatment
    expect(html).toContain('>5<')
    expect(html).not.toContain('Open plan')
  })

  it('renders exactly one primary button per state', () => {
    for (const list of [
      entries([{ name: 'A', total: 4, done: 1, examDate: addDays(TODAY, 5) }]),
      entries([{ name: 'A', noPlan: true }]),
      entries([{ name: 'A', total: 4, done: 4, examDate: addDays(TODAY, 5) }]),
    ]) {
      const html = renderHub(list)
      // The solid blue fill is the primary treatment; the New plan button is
      // outlined and the row actions are text links.
      const solid = (html.match(/<button[^>]*>/g) ?? [])
        .filter(tag => tag.includes('background:#3452D9'))
      expect(solid).toHaveLength(1)
    }
  })

  it('does not crash with no courses at all', () => {
    expect(() => renderHub([])).not.toThrow()
  })
})

// ── Intake ───────────────────────────────────────────────────────────────────

const courses = [{ id: 'c1', name: 'Cell Biology', color: { dot: '#1a9e5c' } }]

const renderIntake = (form) => renderToStaticMarkup(
  <StudyCoachIntakeStep
    form={form}
    setForm={() => {}}
    courses={courses}
    cachedStruggles={[]}
    onSaveStruggles={null}
    onMaterialFile={() => {}}
    onNext={() => {}}
  />
)

const blankForm = {
  courseIdx: -1, goal: '', topics: [], strengths: '', struggles: '',
  dates: [], materials: [], daysPerWeek: null, sessionLen: null,
  includeWeekends: false, style: [],
}

describe('intake step 1', () => {
  it('Blank state: the three cards, and a disabled footer naming what is missing', () => {
    const html = renderIntake(blankForm)
    expect(html).toContain('Tell me about the course')
    expect(html).toContain('Step 1 of 3')
    expect(html).toContain('The course and the goal.')
    expect(html).toContain('What to study')
    expect(html).toContain("What&#x27;s on the exam.")
    expect(html).toContain('When to study')
    expect(html).toContain('Dates and rhythm.')
    expect(html).toContain('Pick a course and describe your goal to continue')
    expect(html).toContain("The plan uses only what&#x27;s on this page.")
    expect(html).toContain('Review my input')
    expect(html).toContain('disabled=""')
  })

  it('Filled state: green counts per card and a green footer summary', () => {
    const html = renderIntake({
      ...blankForm,
      courseIdx: 0,
      goal: 'Score an 85 or higher on the final.',
      topics: ['Cell membrane structure', 'Cellular respiration', 'DNA replication'],
      struggles: 'Glycolysis, Krebs cycle',
      dates: [{ label: 'Exam Day', date: '2026-12-12' }],
      daysPerWeek: 4, sessionLen: 45,
    })
    expect(html).toContain('Course and goal set')
    expect(html).toContain('3 topics, 2 struggle areas')
    expect(html).toContain('1 deadline, 4 days a week, 45 min sessions')
    expect(html).toContain('Working with 3 topics, 2 struggle areas, and 1 deadline')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('Dec 12, 2026')
  })

  it('carries the designed field accents', () => {
    const html = renderIntake(blankForm)
    expect(html).toContain('What feels solid')
    expect(html).toContain('border-left:3px solid #1a9e5c')     // solid, green
    expect(html).toContain("What you&#x27;re struggling with")
    expect(html).toContain('border-left:3px solid #D97706')      // struggling, amber
    expect(html).toContain('1.5px dashed #3452D9')               // dropzone
    expect(html).toContain('#F7F9FE')                            // dropzone tint
  })

  it('keeps every control from the Phase 1 contract', () => {
    const html = renderIntake({ ...blankForm, courseIdx: 0 })
    expect(html).toContain('Which course is this plan for?')     // courseIdx
    expect(html).toContain('What does a win look like?')         // goal
    expect(html).toContain('Topics your professor emphasizes')   // topics
    expect(html).toContain('What feels solid')                   // strengths
    expect(html).toContain('struggling with')                    // struggles
    expect(html).toContain('Upcoming deadlines')                 // dates
    expect(html).toContain('Course materials')                   // materials
    expect(html).toContain('Study days per week')                // daysPerWeek
    expect(html).toContain('Session length')                     // sessionLen
    expect(html).toContain('Weekend sessions')                   // includeWeekends
    expect(html).toContain('How you learn best')                 // style
  })

  it('has no sidebar and no confidence score', () => {
    const html = renderIntake(blankForm)
    expect(html).not.toMatch(/confidence/i)
    expect(html).not.toContain('What I&#x27;m working with')
    expect(html).not.toContain('Only plans from what you tell me')
  })

  it('the step indicator marks step 1 current and the rest muted, with no pills', () => {
    const html = renderIntake(blankForm)
    expect(html).toContain('Confirm and refine')
    expect(html).toContain('Your study plan')
    expect(html).toContain('#9a9ba1')          // muted future steps
    expect(html).not.toContain('border-radius:999px;background:#EFF1F4')
  })

  it('topic chips render in the designed light blue', () => {
    const html = renderIntake({ ...blankForm, courseIdx: 0, topics: ['Glycolysis'] })
    expect(html).toContain('#EEF1FD')
    expect(html).toContain('Glycolysis')
  })

  it('does not crash with no courses', () => {
    expect(() => renderToStaticMarkup(
      <StudyCoachIntakeStep form={blankForm} setForm={() => {}} courses={[]} onNext={() => {}} />
    )).not.toThrow()
  })
})
