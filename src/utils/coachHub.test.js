import { describe, it, expect } from 'vitest'
import {
  toHubEntry, selectHeroCourse, formatCountdown, sortCourseRows,
  rowProgress, buildHubModel, daysUntil, URGENT_DAYS,
} from './coachHub.js'
import { addDays } from '../../lib/shared/coachPlan.js'

const TODAY = '2026-11-25'

/** A stored plan envelope with `n` sessions, `done` of them complete. */
function saved({ total = 12, done = 0, examDate = null, duration = 45 } = {}) {
  if (total === 0) return null
  return {
    plan: {
      examDate,
      weeklyFocus: [{
        week: 'Week 1',
        sessions: Array.from({ length: total }, (_, i) => ({
          id: `s${i + 1}`, focusArea: `T${i}`, duration, done: i < done,
        })),
      }],
    },
    formData: {},
  }
}

const course = (name, dot = '#3452D9', id) => ({ id: id ?? name, name, color: { dot } })

const entry = (name, opts = {}, idx = 0) =>
  toHubEntry(course(name), idx, opts.noPlan ? null : saved(opts))

describe('toHubEntry', () => {
  it('reads done and total from the plan session flags, not any other store', () => {
    const e = entry('Cell Biology', { total: 12, done: 7, examDate: addDays(TODAY, 12) })
    expect(e.total).toBe(12)
    expect(e.done).toBe(7)
    expect(e.hasPlan).toBe(true)
  })

  it('falls back to the wizard dates when the plan has no examDate', () => {
    const s = saved({ total: 4, done: 1 })
    s.plan.examDate = null
    s.formData = { dates: [{ label: 'Midterm', date: addDays(TODAY, 9) }, { label: 'Final', date: addDays(TODAY, 40) }] }
    const e = toHubEntry(course('Organic Chemistry'), 1, s)
    expect(e.examDate).toBe(addDays(TODAY, 9))   // earliest wins
    expect(e.examLabel).toBe('Midterm')
  })

  it('handles a course with no plan', () => {
    const e = toHubEntry(course('Intro to Psyc'), 4, null)
    expect(e.hasPlan).toBe(false)
    expect(e.total).toBe(0)
    expect(e.examDate).toBe(null)
  })
})

describe('formatCountdown never emits a negative number', () => {
  it('renders "Exam passed" for a date in the past', () => {
    const e = entry('Linear Algebra', { total: 4, done: 1, examDate: addDays(TODAY, -81) })
    const out = formatCountdown(e, TODAY)
    expect(out.text).toBe('Exam passed')
    expect(out.passed).toBe(true)
    expect(out.urgent).toBe(false)
    expect(out.text).not.toMatch(/-/)
    expect(out.text).not.toMatch(/\d/)
  })

  it('never produces a minus sign for any past offset', () => {
    for (const offset of [-1, -2, -7, -30, -81, -365]) {
      const e = entry('X', { total: 2, done: 0, examDate: addDays(TODAY, offset) })
      expect(formatCountdown(e, TODAY).text).toBe('Exam passed')
    }
  })

  it('marks deadlines within 7 days urgent and further ones not', () => {
    const at = d => formatCountdown(entry('X', { total: 2, examDate: addDays(TODAY, d) }), TODAY)
    expect(at(6).urgent).toBe(true)
    expect(at(URGENT_DAYS).urgent).toBe(true)
    expect(at(8).urgent).toBe(false)
    expect(at(19).urgent).toBe(false)
  })

  it('uses the deadline label and pluralises', () => {
    const s = saved({ total: 9, done: 2 })
    s.plan.examDate = null
    s.formData = { dates: [{ label: 'Midterm', date: addDays(TODAY, 19) }] }
    const e = toHubEntry(course('Organic Chemistry'), 1, s)
    expect(formatCountdown(e, TODAY).text).toBe('Midterm in 19 days')

    const one = entry('Y', { total: 2, examDate: addDays(TODAY, 1) })
    expect(formatCountdown(one, TODAY).text).toBe('Exam Day in 1 day')
    const zero = entry('Z', { total: 2, examDate: TODAY })
    expect(formatCountdown(zero, TODAY).text).toBe('Exam Day today')
  })

  it('says "No deadline yet" when there is no date', () => {
    expect(formatCountdown(entry('Q', { total: 3 }), TODAY).text).toBe('No deadline yet')
    expect(formatCountdown(entry('Q', { noPlan: true }), TODAY).text).toBe('No deadline yet')
  })
})

describe('selectHeroCourse', () => {
  const build = (specs) => specs.map((s, i) => entry(s.name, s, i))

  it('picks the nearest future deadline among courses with plans', () => {
    const entries = build([
      { name: 'Organic Chemistry', total: 9, done: 2, examDate: addDays(TODAY, 19) },
      { name: 'Cell Biology', total: 12, done: 7, examDate: addDays(TODAY, 12) },
      { name: 'Linear Algebra', total: 4, done: 1, examDate: addDays(TODAY, 34) },
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('Cell Biology')
  })

  it('ignores courses without plans even when their deadline is nearer', () => {
    const entries = build([
      { name: 'No Plan Course', noPlan: true },
      { name: 'Cell Biology', total: 12, done: 7, examDate: addDays(TODAY, 12) },
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('Cell Biology')
  })

  it('ignores passed deadlines when a future one exists', () => {
    const entries = build([
      { name: 'Linear Algebra', total: 4, done: 1, examDate: addDays(TODAY, -81) },
      { name: 'Cell Biology', total: 12, done: 7, examDate: addDays(TODAY, 20) },
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('Cell Biology')
  })

  it('falls back to the plan with the most remaining sessions when no future deadline exists', () => {
    const entries = build([
      { name: 'Few Left', total: 4, done: 3 },                              // 1 remaining
      { name: 'Many Left', total: 12, done: 2 },                            // 10 remaining
      { name: 'Passed', total: 6, done: 1, examDate: addDays(TODAY, -5) },  // 5 remaining
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('Many Left')
  })

  it('returns null when nothing has a plan', () => {
    expect(selectHeroCourse(build([{ name: 'A', noPlan: true }, { name: 'B', noPlan: true }]), TODAY)).toBe(null)
    expect(selectHeroCourse([], TODAY)).toBe(null)
  })

  it('breaks ties stably on course order', () => {
    const entries = build([
      { name: 'First', total: 4, done: 0, examDate: addDays(TODAY, 10) },
      { name: 'Second', total: 4, done: 0, examDate: addDays(TODAY, 10) },
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('First')
  })

  it('a today deadline still counts as future', () => {
    const entries = build([
      { name: 'Today', total: 3, done: 0, examDate: TODAY },
      { name: 'Later', total: 3, done: 0, examDate: addDays(TODAY, 3) },
    ])
    expect(selectHeroCourse(entries, TODAY).name).toBe('Today')
  })
})

describe('sortCourseRows', () => {
  it('orders urgent first, then no deadline, then passed, then no plan', () => {
    const entries = [
      entry('NoPlan', { noPlan: true }, 0),
      entry('Passed', { total: 4, done: 1, examDate: addDays(TODAY, -10) }, 1),
      entry('Far', { total: 4, done: 1, examDate: addDays(TODAY, 30) }, 2),
      entry('NoDeadline', { total: 4, done: 1 }, 3),
      entry('Soon', { total: 4, done: 1, examDate: addDays(TODAY, 3) }, 4),
    ]
    expect(sortCourseRows(entries, TODAY).map(e => e.name))
      .toEqual(['Soon', 'Far', 'NoDeadline', 'Passed', 'NoPlan'])
  })

  it('passed deadlines always sort below every active course', () => {
    const entries = [
      entry('Passed', { total: 4, done: 1, examDate: addDays(TODAY, -1) }, 0),
      entry('Active', { total: 4, done: 1, examDate: addDays(TODAY, 200) }, 1),
    ]
    expect(sortCourseRows(entries, TODAY).map(e => e.name)).toEqual(['Active', 'Passed'])
  })

  it('courses without plans always sort last', () => {
    const entries = [
      entry('NoPlanA', { noPlan: true }, 0),
      entry('Passed', { total: 2, done: 0, examDate: addDays(TODAY, -3) }, 1),
      entry('NoPlanB', { noPlan: true }, 2),
    ]
    expect(sortCourseRows(entries, TODAY).map(e => e.name)).toEqual(['Passed', 'NoPlanA', 'NoPlanB'])
  })

  it('does not mutate the input', () => {
    const entries = [entry('B', { total: 2, examDate: addDays(TODAY, 9) }, 0), entry('A', { noPlan: true }, 1)]
    const before = entries.map(e => e.name)
    sortCourseRows(entries, TODAY)
    expect(entries.map(e => e.name)).toEqual(before)
  })
})

describe('rowProgress', () => {
  it('reads the canonical done flags', () => {
    expect(rowProgress(entry('X', { total: 12, done: 7 }))).toBe('7 of 12 sessions')
    expect(rowProgress(entry('X', { total: 3, done: 0 }))).toBe('0 of 3 sessions')
  })
  it('says "No plan yet" without a plan', () => {
    expect(rowProgress(entry('X', { noPlan: true }))).toBe('No plan yet')
  })
})

describe('buildHubModel: the four designed states', () => {
  it('Normal: hero is the nearest deadline, excluded from the list below', () => {
    const entries = [
      entry('Cell Biology', { total: 12, done: 7, examDate: addDays(TODAY, 12) }, 0),
      entry('Organic Chemistry', { total: 9, done: 2, examDate: addDays(TODAY, 19) }, 1),
      entry('Intro to Psyc', { noPlan: true }, 2),
    ]
    const m = buildHubModel(entries, TODAY)
    expect(m.state).toBe('normal')
    expect(m.hero.eyebrow).toBe('UP NEXT')
    expect(m.hero.title).toBe('Cell Biology')
    expect(m.hero.numeral).toBe('12')
    expect(m.hero.caption).toBe('days until Exam Day')
    expect(m.hero.progress).toBe('7 of 12 sessions done')
    expect(m.hero.pct).toBe(58)
    expect(m.hero.button).toBe('Open plan')
    expect(m.hero.urgentNumeral).toBe(false)
    expect(m.listEyebrow).toBe('ALL COURSES')
    expect(m.rows.map(r => r.name)).toEqual(['Organic Chemistry', 'Intro to Psyc'])
  })

  it('Deadline passed: the passed row drops below active, hero is unaffected', () => {
    const entries = [
      entry('Cell Biology', { total: 12, done: 7, examDate: addDays(TODAY, 12) }, 0),
      entry('Linear Algebra', { total: 4, done: 1, examDate: addDays(TODAY, -81) }, 1),
      entry('Organic Chemistry', { total: 9, done: 2, examDate: addDays(TODAY, 19) }, 2),
    ]
    const m = buildHubModel(entries, TODAY)
    expect(m.state).toBe('normal')
    expect(m.hero.title).toBe('Cell Biology')
    expect(m.rows.map(r => r.name)).toEqual(['Organic Chemistry', 'Linear Algebra'])
    expect(formatCountdown(m.rows[1], TODAY).text).toBe('Exam passed')
  })

  it('First time: no plans anywhere', () => {
    const entries = [entry('Cell Biology', { noPlan: true }, 0), entry('Linear Algebra', { noPlan: true }, 1)]
    const m = buildHubModel(entries, TODAY)
    expect(m.state).toBe('first-time')
    expect(m.hero.eyebrow).toBe('GET STARTED')
    expect(m.hero.title).toBe('Build your first plan.')
    expect(m.hero.button).toBe('Build a plan')
    expect(m.hero.numeral).toBe(null)
    expect(m.hero.progress).toBe(null)
    expect(m.listEyebrow).toBe('YOUR COURSES')
    expect(m.rows).toHaveLength(2)          // nothing is pulled out as hero
  })

  it('All caught up: every session done', () => {
    const entries = [
      entry('Cell Biology', { total: 12, done: 12, examDate: addDays(TODAY, 5) }, 0),
      entry('Organic Chemistry', { total: 9, done: 6, examDate: addDays(TODAY, 6) }, 1),
    ]
    const m = buildHubModel(entries, TODAY)
    expect(m.state).toBe('caught-up')
    expect(m.hero.title).toBe('Cell Biology')
    expect(m.hero.numeral).toBe('5')
    expect(m.hero.progress).toBe("All 12 sessions done. You're ready.")
    expect(m.hero.progressDone).toBe(true)
    expect(m.hero.pct).toBe(100)
    expect(m.hero.button).toBe('Review plan')
    expect(m.hero.urgentNumeral).toBe(true)  // 5 days is inside the amber window
  })

  it('a hero whose deadline has passed shows no numeral rather than a negative one', () => {
    const entries = [entry('Only', { total: 4, done: 1, examDate: addDays(TODAY, -12) }, 0)]
    const m = buildHubModel(entries, TODAY)
    expect(m.hero.numeral).toBe(null)
    expect(m.hero.caption).toBe(null)
    expect(m.hero.progress).toBe('1 of 4 sessions done')
  })

  it('no courses at all still renders the first time state', () => {
    const m = buildHubModel([], TODAY)
    expect(m.state).toBe('first-time')
    expect(m.rows).toEqual([])
  })

  it('every statistic in the model appears once, no stats bar totals', () => {
    const entries = [entry('A', { total: 12, done: 7, examDate: addDays(TODAY, 12) }, 0)]
    const m = buildHubModel(entries, TODAY)
    expect(m).not.toHaveProperty('totalHours')
    expect(m).not.toHaveProperty('plansReady')
    expect(m).not.toHaveProperty('confidence')
  })
})

describe('daysUntil', () => {
  it('is null without a date and exact otherwise', () => {
    expect(daysUntil(entry('X', { total: 2 }), TODAY)).toBe(null)
    expect(daysUntil(entry('X', { total: 2, examDate: addDays(TODAY, 12) }), TODAY)).toBe(12)
    expect(daysUntil(entry('X', { total: 2, examDate: addDays(TODAY, -3) }), TODAY)).toBe(-3)
  })
})
