// public/finals-week-study-schedule.html plans finals week with inline functions. These tests
// pull them out of the page so the rules the page explains are the rules the planner follows.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'finals-week-study-schedule.html'), 'utf8')
const fn = name => html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0]
const names = ['dayNumber', 'isoFromDay', 'gapWeight', 'sessionWeight', 'splitUnits', 'planDay', 'buildPlan', 'planError']
// eslint-disable-next-line no-new-func
const { dayNumber, splitUnits, buildPlan, planError } = new Function(
  `${names.map(fn).join('')}; return { ${names.join(', ')} };`,
)()

const example = [
  { name: 'Organic Chemistry', date: '2026-12-08', readiness: 2 },
  { name: 'Calculus II', date: '2026-12-10', readiness: 1 },
  { name: 'Intro Psychology', date: '2026-12-11', readiness: 3 },
]
const sum = sessions => sessions.reduce((a, s) => a + s.hours, 0)

describe('finals week planner', () => {
  it('matches the example week printed on the page', () => {
    const plan = buildPlan(example, '2026-12-05', 6)
    const row = i => plan.days[i].sessions.map(s => `${s.name} ${s.hours}`).join(', ')
    expect(row(0)).toBe('Organic Chemistry 3, Calculus II 2.5, Intro Psychology 0.5')
    expect(row(2)).toBe('Organic Chemistry 4, Calculus II 1.5, Intro Psychology 0.5')
    expect(row(4)).toBe('Calculus II 5.5, Intro Psychology 0.5')
    expect(row(5)).toBe('Intro Psychology 3')
    expect(plan.days[6].sessions).toEqual([])
    expect(plan.totals.map(t => t.hours)).toEqual([10, 14.5, 5.5])
    expect(html).toContain('Organic Chemistry 4h (practice test), Calculus II 1.5h, Intro Psychology 0.5h')
    expect(html).toContain('14.5 hours for Calculus II, 10 for Organic Chemistry and 5.5 for Intro Psychology')
  })

  it('never schedules a course on or after its exam date', () => {
    const plan = buildPlan(example, '2026-12-05', 8)
    for (const day of plan.days) {
      for (const s of day.sessions) {
        const exam = example.find(f => f.name === s.name)
        expect(dayNumber(day.date)).toBeLessThan(dayNumber(exam.date))
      }
    }
  })

  it('makes the day before each final a practice session for that course', () => {
    for (const hours of [1, 3, 6, 10]) {
      const plan = buildPlan(example, '2026-12-05', hours)
      for (const f of example) {
        const before = plan.days.find(d => dayNumber(d.date) === dayNumber(f.date) - 1)
        const s = before.sessions.find(x => x.name === f.name)
        expect(s, `${f.name} at ${hours}h/day`).toBeDefined()
        expect(s.kind).toBe('practice')
        expect(s.hours).toBeGreaterThanOrEqual(Math.min(1, hours / (f.date === '2026-12-11' ? 2 : 1)))
      }
    }
  })

  it('gives two finals on the same day a practice session each', () => {
    const plan = buildPlan([
      { name: 'A', date: '2026-12-10', readiness: 3 },
      { name: 'B', date: '2026-12-10', readiness: 1 },
    ], '2026-12-07', 4)
    const eve = plan.days.find(d => d.date === '2026-12-09').sessions
    expect(eve.map(s => s.kind)).toEqual(['practice', 'practice'])
    expect(eve.every(s => s.hours >= 1)).toBe(true)
  })

  it('uses every planned hour, and half of them on exam days', () => {
    const plan = buildPlan(example, '2026-12-05', 7)
    for (const day of plan.days) {
      const open = example.some(f => dayNumber(f.date) > dayNumber(day.date))
      if (!open) continue
      expect(sum(day.sessions)).toBe(day.exams.length ? 3.5 : 7)
    }
  })

  it('weights by readiness gap: lost beats shaky beats solid on the same date', () => {
    const plan = buildPlan([
      { name: 'Solid', date: '2026-12-12', readiness: 3 },
      { name: 'Shaky', date: '2026-12-12', readiness: 2 },
      { name: 'Lost', date: '2026-12-12', readiness: 1 },
    ], '2026-12-05', 6)
    const t = Object.fromEntries(plan.totals.map(x => [x.name, x.hours]))
    expect(t.Lost).toBeGreaterThan(t.Shaky)
    expect(t.Shaky).toBeGreaterThan(t.Solid)
  })

  it('weights by how soon the exam is: the sooner final gets more on day one', () => {
    const plan = buildPlan([
      { name: 'Soon', date: '2026-12-08', readiness: 2 },
      { name: 'Later', date: '2026-12-14', readiness: 2 },
    ], '2026-12-05', 6)
    const [soon, later] = plan.days[0].sessions
    expect(soon.name).toBe('Soon')
    expect(soon.hours).toBeGreaterThan(later.hours)
  })

  it('ignores finals that are already over and keeps dates stable across DST', () => {
    const plan = buildPlan([
      { name: 'Done', date: '2026-03-01', readiness: 1 },
      { name: 'Next', date: '2026-03-10', readiness: 2 },
    ], '2026-03-06', 4)
    expect(plan.totals.map(t => t.name)).toEqual(['Next'])
    expect(plan.days.map(d => d.date)).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'])
  })

  it('splits half-hour units exactly', () => {
    expect(splitUnits(12, [2 / 3, 3 / 5, 1 / 6])).toEqual([6, 5, 1])
    expect(splitUnits(5, [1, 1])).toEqual([3, 2])
    expect(splitUnits(0, [1, 2])).toEqual([0, 0])
  })

  it('explains what to fix instead of planning bad input', () => {
    expect(planError(example, '2026-12-05', 6)).toBe('')
    expect(planError([], '2026-12-05', 6)).not.toBe('')
    expect(planError(example, '', 6)).not.toBe('')
    expect(planError(example, '2026-12-05', 0)).not.toBe('')
    expect(planError([{ name: 'A', date: '', readiness: 2 }], '2026-12-05', 6)).not.toBe('')
    expect(planError(example, '2026-12-20', 6)).not.toBe('')
    expect(planError([{ name: 'A', date: '2027-01-30', readiness: 2 }], '2026-12-05', 6)).not.toBe('')
    expect(planError([example[0], { ...example[1], name: 'organic chemistry' }], '2026-12-05', 6)).not.toBe('')
  })
})
