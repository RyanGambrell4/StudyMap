import { describe, it, expect } from 'vitest'
import { normalizeItems, buildUserPrompt, parseContent, MAX_ITEMS } from './sessionContent.js'

const item = (key, n = 3) => ({
  key, type: 'Practice problems', topic: 'Elasticity', assessment: 'Midterm', minutes: 45,
  steps: Array.from({ length: n }, (_, i) => ({ name: `Step ${i + 1}`, minutes: 15 })),
})

describe('sessionContent', () => {
  it('drops unusable items and caps the batch', () => {
    expect(normalizeItems(null)).toBeNull()
    expect(normalizeItems([{ key: 'a', type: 'x', steps: [] }])).toBeNull()
    const many = normalizeItems(Array.from({ length: 30 }, (_, i) => item(`k${i}`)))
    expect(many).toHaveLength(MAX_ITEMS)
  })

  it('puts the assessment name and steps in the prompt', () => {
    const p = buildUserPrompt('Econ', normalizeItems([item('practiceproblems|elasticity||midterm')]))
    expect(p).toContain('"assessment":"Midterm"')
    expect(p).toContain('Step 1 (15 min)')
    expect(p).toContain('Course: Econ')
  })

  it('keeps only asked-for keys and drops step lists of the wrong length', () => {
    const items = normalizeItems([item('a'), item('b')])
    const text = JSON.stringify({ sessions: [
      { key: 'a', goal: 'Solve 9 problems — without notes', steps: ['one', 'two', 'three'] },
      { key: 'b', goal: 'Second', steps: ['only one'] },
      { key: 'zzz', goal: 'Not asked for', steps: [] },
    ] })
    const out = parseContent('Here you go: ' + text, items)
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
    expect(out.a.goal).toBe('Solve 9 problems, without notes')
    expect(out.a.steps).toHaveLength(3)
    expect(out.b.steps).toBeNull()
  })

  it('passes the student\'s material, format and misses to the prompt', () => {
    const items = normalizeItems([{ ...item('k'), material: 'Week 5 slides.pdf', format: 'multipleChoice', missed: 4 },
                                  { ...item('j'), format: 'bogus' }])
    const p = buildUserPrompt('Econ', items)
    expect(p).toContain('"material":"Week 5 slides.pdf"')
    expect(p).toContain('"format":"multipleChoice"')
    expect(p).toContain('"missed":4')
    expect(items[1].format).toBeNull()
  })

  it('returns nothing for text that is not JSON', () => {
    expect(parseContent('sorry', normalizeItems([item('a')]))).toEqual({})
  })
})
