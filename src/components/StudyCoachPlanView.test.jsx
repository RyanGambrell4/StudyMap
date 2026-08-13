/**
 * Render smoke tests for all five plan states.
 *
 * This repo has been bitten before by JSX prop values that reference an
 * identifier missing from the component's destructuring: the build succeeds,
 * and every user hits an error boundary at render time. Server-rendering each
 * state catches exactly that, plus any crash from an empty or partial plan.
 *
 * These also assert the copy the export pins, so a stat that silently stops
 * rendering fails here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StudyCoachPlanView from './StudyCoachPlanView'
import { setSessionDone, flattenSessions, addDays, assignScheduledDates } from '../../lib/shared/coachPlan.js'

// Local calendar date, NOT the UTC one. `toISOString()` on a bare `new Date()`
// rolls over to tomorrow once local time passes 20:00 in EDT, while the
// component under test computes "behind schedule" against the LOCAL date. The
// two disagreed by a day every evening, so this test failed from about 8pm
// onwards and passed again the next morning. Anchoring to local noon is the
// same trick `addDays` already uses to stay timezone-stable.
const TODAY = (() => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
})()
const EXAM = addDays(TODAY, 18)
const TOPICS = ['Cell structure', 'Membrane transport', 'Glycolysis', 'Krebs cycle']
const course = { id: 'c1', name: 'Cell Biology', color: { dot: '#7C5CFA' } }

// The component reads window.matchMedia through useIsMobile.
beforeAll(() => {
  globalThis.window = globalThis.window ?? {}
  globalThis.window.matchMedia = (q) => ({
    matches: /max-width:\s*760px/.test(q) ? globalThis.__MOBILE__ === true : false,
    addEventListener() {}, removeEventListener() {},
  })
})
afterAll(() => { delete globalThis.__MOBILE__ })

function plan({ startOffset = 1, examDate = EXAM, weeks = 3, perWeek = 4, duration = 45 } = {}) {
  const p = {
    goal: 'Score at least 85 on the final.',
    examDate,
    weeklyFocus: Array.from({ length: weeks }, (_, w) => ({
      week: `Week ${w + 1} · Foundations`,
      startDate: addDays(TODAY, startOffset + w * 7),
      endDate: addDays(TODAY, startOffset + 6 + w * 7),
      theme: 'energy and metabolism',
      sessions: Array.from({ length: perWeek }, (_, s) => {
        const i = w * perWeek + s
        const topic = TOPICS[i % TOPICS.length]
        return {
          id: `cs-w${w + 1}-s${s + 1}`,
          sessionLabel: `Session ${s + 1}`,
          focusArea: topic,
          goal: `Recall ${topic} without notes.`,
          keyTopics: [topic],
          studyMethod: 'Active recall',
          sessionType: 'New content',
          duration,
          done: false,
          doneAt: null,
          provenance: topic === 'Glycolysis'
            ? { kind: 'struggle', id: 'struggle:glycolysis', label: 'Glycolysis' }
            : { kind: 'topic', id: `topic:${topic.toLowerCase().replace(/ /g, '-')}`, label: topic },
        }
      }),
    })),
  }
  assignScheduledDates(p, { today: addDays(TODAY, startOffset - 1), examDate })
  return p
}

const render = (props) => renderToStaticMarkup(
  <StudyCoachPlanView course={course} courseIdx={0} {...props} />
)

function completeN(p, n) {
  let out = p
  flattenSessions(p).slice(0, n).forEach(f => { out = setSessionDone(out, f.session.id, true) })
  return out
}

describe('renders every state without crashing', () => {
  it('3a fresh, not pushed', () => {
    const html = render({ plan: plan(), pushed: false })
    expect(html).toContain('Study Coach')
    expect(html).toContain('Up next')
    expect(html).toContain('Start session')
    expect(html).toContain('Push to Schedule')
    expect(html).toContain('0 of 12')
    expect(html).toContain('9.0')              // hours remaining, 12 x 45 min
    expect(html).toContain('Exam in')
    expect(html).toContain('This plan emphasizes')
    expect(html).not.toContain('behind schedule')
    expect(html).not.toContain('On your schedule')
  })

  it('3b mid-plan, pushed', () => {
    const html = render({ plan: completeN(plan(), 5), pushed: true })
    expect(html).toContain('5 of 12')
    expect(html).toContain('5.25')             // 7 x 45 min remaining
    expect(html).toContain('On your schedule')
    expect(html).toContain('Update')
    expect(html).not.toContain('Push to Schedule')
    expect(html).toContain('Complete')         // week 1 rolled up
  })

  it('3c behind: amber block, catch up, three segments', () => {
    // Dates started 10 days ago, nothing done since the first four.
    const p = completeN(plan({ startOffset: -9 }), 4)
    const html = render({ plan: p, pushed: true })
    // Exact counts are pinned to the spec example in coachPlan.test.js; here we
    // only care that the amber state renders and pluralises.
    expect(html).toMatch(/\d+ sessions? behind schedule/)
    expect(html).toContain('Catch up')
    expect(html).toContain('By today the plan expected')
    expect(html).toContain('Still scheduled')
    expect(html).toContain('#D97706')          // behind segment colour
    expect(html).toContain('Start session')    // still the page primary
  })

  it('3d complete', () => {
    const html = render({ plan: completeN(plan(), 12), pushed: true })
    expect(html).toContain('Plan complete')
    expect(html).toContain('All 12 sessions done')
    expect(html).toContain('Start final review')
    expect(html).toContain('Hours studied')
    expect(html).toContain('Done')
    expect(html).toContain('12 of 12')
    expect(html).toContain('See where you stand in Grade Hub')
    expect(html).not.toContain('Catch up')
    expect(html).not.toContain('Update')       // no Update link when complete
  })

  it('3e mobile fresh', () => {
    globalThis.__MOBILE__ = true
    const html = render({ plan: plan(), pushed: false })
    expect(html).toContain('Study Coach')
    expect(html).toContain('Emphasizes')       // strip collapses to text line
    expect(html).toContain('Hours left')       // shortened stat label
    expect(html).toContain('Start session')
    expect(html).toContain('Refine inputs')
    globalThis.__MOBILE__ = false
  })
})

describe('no exam date', () => {
  it('hides the behind state, catch up and the exam stat, and asks for the date', () => {
    const p = completeN(plan({ startOffset: -9, examDate: null }), 1)
    p.examDate = null
    const html = render({ plan: p, pushed: false })
    expect(html).toContain('Add your exam date in')
    expect(html).not.toContain('behind schedule')
    expect(html).not.toContain('Catch up')
    expect(html).not.toContain('Exam in')
  })
})

describe('provenance drives the markers', () => {
  it('shows the struggle provenance line on the hero when the next session is one', () => {
    const p = completeN(plan(), 2) // session 3 is Glycolysis
    const html = render({ plan: p, pushed: false })
    expect(html).toContain('From your Struggle Tracker · Glycolysis')
  })

  it('shows the topic provenance line otherwise', () => {
    const html = render({ plan: plan(), pushed: false })
    expect(html).toContain('From your topics · Cell structure')
  })

  it('renders no struggle marker or tracker link when nothing has struggle provenance', () => {
    const p = plan()
    flattenSessions(p).forEach(f => {
      f.session.provenance = { kind: 'topic', id: 'topic:x', label: 'Cell structure' }
    })
    const html = render({ plan: p, pushed: false })
    expect(html).not.toContain('added from your')
    expect(html).not.toContain('Struggle Tracker')
  })
})

describe('degenerate plans do not crash', () => {
  it('a plan with no sessions', () => {
    expect(() => render({ plan: { weeklyFocus: [], examDate: EXAM } })).not.toThrow()
  })
  it('a plan with missing optional fields', () => {
    const bare = { weeklyFocus: [{ sessions: [{ id: 'a', focusArea: 'X', duration: 30 }] }] }
    expect(() => render({ plan: bare })).not.toThrow()
  })
})
