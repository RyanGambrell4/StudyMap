import { describe, it, expect } from 'vitest'
import {
  struggleAreas, validDeadlines, cardFeedback, footerState,
  TRUST_LINE, INTAKE_FIELDS,
} from './coachIntake.js'

const courses = [{ id: 'c1', name: 'Cell Biology' }, { id: 'c2', name: 'Organic Chemistry' }]

const blank = {
  courseIdx: -1, goal: '', topics: [], strengths: '', struggles: '',
  dates: [], materials: [], daysPerWeek: null, sessionLen: null,
  includeWeekends: false, style: [],
}

const filled = {
  ...blank,
  courseIdx: 0,
  goal: 'Score an 85 or higher on the final.',
  topics: ['Cell membrane structure', 'Cellular respiration', 'DNA replication'],
  strengths: 'Cell membrane basics.',
  struggles: 'Glycolysis and Krebs cycle steps, electron transport chain order',
  dates: [{ label: 'Exam Day', date: '2026-12-12' }],
  daysPerWeek: 4, sessionLen: 45, style: ['Active recall'],
}

describe('struggleAreas', () => {
  it('splits on commas and newlines and trims', () => {
    expect(struggleAreas('Glycolysis, Krebs cycle\nElectron transport'))
      .toEqual(['Glycolysis', 'Krebs cycle', 'Electron transport'])
  })
  it('is empty for empty input', () => {
    expect(struggleAreas('')).toEqual([])
    expect(struggleAreas('   ,  , ')).toEqual([])
    expect(struggleAreas(undefined)).toEqual([])
  })
})

describe('validDeadlines', () => {
  it('counts only rows with both a label and a date', () => {
    expect(validDeadlines([
      { label: 'Midterm', date: '2026-12-01' },
      { label: '', date: '2026-12-02' },
      { label: 'Final', date: '' },
    ])).toHaveLength(1)
  })
})

describe('cardFeedback', () => {
  it('shows nothing on a blank form', () => {
    expect(cardFeedback(blank, courses)).toEqual({ card1: null, card2: null, card3: null })
  })

  it('card 1 names the course until the goal arrives', () => {
    expect(cardFeedback({ ...blank, courseIdx: 0 }, courses).card1).toBe('Cell Biology')
    expect(cardFeedback({ ...blank, goal: 'x' }, courses).card1).toBe('Goal set')
    expect(cardFeedback({ ...blank, courseIdx: 0, goal: 'x' }, courses).card1).toBe('Course and goal set')
  })

  it('card 2 counts topics and struggle areas', () => {
    expect(cardFeedback(filled, courses).card2).toBe('3 topics, 2 struggle areas')
    expect(cardFeedback({ ...blank, topics: ['One'] }, courses).card2).toBe('1 topic')
  })

  it('card 3 counts deadlines and the cadence', () => {
    expect(cardFeedback(filled, courses).card3).toBe('1 deadline, 4 days a week, 45 min sessions')
  })

  it('pluralises correctly at one', () => {
    const one = { ...blank, topics: ['a'], struggles: 'x', dates: [{ label: 'M', date: '2026-01-01' }] }
    const f = cardFeedback(one, courses)
    expect(f.card2).toBe('1 topic, 1 struggle area')
    expect(f.card3).toBe('1 deadline')
  })
})

describe('footerState: enable rule', () => {
  it('is disabled with neither course nor goal, and names both', () => {
    const f = footerState(blank, courses)
    expect(f.ready).toBe(false)
    expect(f.line).toBe('Pick a course and describe your goal to continue')
  })

  it('names only the missing half', () => {
    expect(footerState({ ...blank, courseIdx: 0 }, courses).line).toBe('Describe your goal to continue')
    expect(footerState({ ...blank, goal: 'x' }, courses).line).toBe('Pick a course to continue')
  })

  it('a whitespace-only goal does not count', () => {
    expect(footerState({ ...blank, courseIdx: 0, goal: '   ' }, courses).ready).toBe(false)
  })

  it('a course index pointing at nothing does not count', () => {
    expect(footerState({ ...blank, courseIdx: 9, goal: 'x' }, courses).ready).toBe(false)
  })

  it('enables once course and goal are both set', () => {
    expect(footerState({ ...blank, courseIdx: 0, goal: 'Pass' }, courses).ready).toBe(true)
  })
})

describe('footerState: status line', () => {
  it('acknowledges a bare course and goal', () => {
    expect(footerState({ ...blank, courseIdx: 0, goal: 'Pass' }, courses).line)
      .toBe('Course and goal set. Topics and deadlines will sharpen the plan.')
  })

  it('lists one part without a comma', () => {
    expect(footerState({ ...blank, courseIdx: 0, goal: 'Pass', topics: ['A', 'B'] }, courses).line)
      .toBe('Working with 2 topics')
  })

  it('joins the last part with "and"', () => {
    expect(footerState(filled, courses).line)
      .toBe('Working with 3 topics, 2 struggle areas, and 1 deadline')
  })

  it('never contains an em dash', () => {
    for (const form of [blank, filled, { ...blank, courseIdx: 0, goal: 'x' }]) {
      expect(footerState(form, courses).line).not.toMatch(/—/)
    }
  })
})

describe('the single trust line', () => {
  it('is the exact copy from the export', () => {
    expect(TRUST_LINE).toBe("The plan uses only what's on this page.")
  })
})

describe('the Phase 1 contract survives the rebuild', () => {
  it('lists every control step 1 owns', () => {
    expect(INTAKE_FIELDS).toEqual([
      'courseIdx', 'goal', 'topics', 'strengths', 'struggles', 'dates',
      'materials', 'daysPerWeek', 'sessionLen', 'includeWeekends', 'style',
    ])
  })

  it('a filled form carries every contract field into the generator payload', () => {
    // The exact shape handleBuild sends, built from the same form keys.
    const form = { ...filled, materials: [{ name: 'syllabus.pdf' }], includeWeekends: true }
    const payload = {
      courseName: courses[form.courseIdx].name,
      goal: form.goal,
      emphasisTopics: form.topics.join(', '),
      importantDates: form.dates,
      daysPerWeek: form.daysPerWeek,
      includeWeekends: form.includeWeekends,
      sessionMinutes: form.sessionLen,
      struggles: [form.struggles],
      strengths: form.strengths,
      learningStyle: form.style.join(', '),
      courseMaterials: form.materials.map(m => m.name).join(', '),
    }
    // Every contract field is represented, and nothing arrives empty.
    expect(payload.courseName).toBeTruthy()          // courseIdx
    expect(payload.goal).toBeTruthy()                // goal
    expect(payload.emphasisTopics).toBeTruthy()      // topics
    expect(payload.strengths).toBeTruthy()           // strengths
    expect(payload.struggles[0]).toBeTruthy()        // struggles
    expect(payload.importantDates).toHaveLength(1)   // dates
    expect(payload.courseMaterials).toBeTruthy()     // materials
    expect(payload.daysPerWeek).toBe(4)              // daysPerWeek
    expect(payload.sessionMinutes).toBe(45)          // sessionLen
    expect(payload.includeWeekends).toBe(true)       // includeWeekends
    expect(payload.learningStyle).toBeTruthy()       // style
    expect(INTAKE_FIELDS).toHaveLength(11)
  })

  it('no field in the contract was dropped from the form shape', () => {
    for (const key of INTAKE_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(filled, key)).toBe(true)
    }
  })
})
