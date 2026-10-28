import { describe, it, expect } from 'vitest'
import { shuffleQuestion, shuffleChoices } from './shuffleChoices.js'

// The model's habit: the right answer is always first.
const allA = (i) => ({
  question: `Q${i}`,
  options: ['A. right', 'B. wrong one', 'C. wrong two', 'D. wrong three'],
  answer: 'A. right',
  distractorTags: { 'B. wrong one': 'tag1', 'C. wrong two': 'tag2', 'D. wrong three': 'tag3' },
})

describe('shuffleChoices', () => {
  it('spreads correct answers across A to D over many questions', () => {
    const qs = shuffleChoices(Array.from({ length: 400 }, (_, i) => allA(i)))
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    for (const q of qs) counts[q.answer[0]]++
    // 100 each expected; allow wide but meaningful bounds.
    for (const k of Object.keys(counts)) {
      expect(counts[k]).toBeGreaterThan(60)
      expect(counts[k]).toBeLessThan(140)
    }
  })

  it('50 questions: no letter holds more than half the answers', () => {
    const qs = shuffleChoices(Array.from({ length: 50 }, (_, i) => allA(i)))
    const counts = {}
    for (const q of qs) counts[q.answer[0]] = (counts[q.answer[0]] || 0) + 1
    expect(Math.max(...Object.values(counts))).toBeLessThan(25)
    expect(Object.keys(counts).length).toBe(4)
  })

  it('keeps the answer correct and re-letters options in order', () => {
    const q = shuffleQuestion(allA(0), () => 0.99)
    expect(q.options.map(o => o.slice(0, 2))).toEqual(['A.', 'B.', 'C.', 'D.'])
    expect(q.answer.replace(/^[A-D]\.\s*/, '')).toBe('right')
    expect(q.options).toContain(q.answer)
  })

  it('moves distractor tags with their options', () => {
    const q = shuffleQuestion(allA(0))
    for (const [opt, tag] of Object.entries(q.distractorTags)) {
      const text = opt.replace(/^[A-D]\.\s*/, '')
      expect({ 'wrong one': 'tag1', 'wrong two': 'tag2', 'wrong three': 'tag3' }[text]).toBe(tag)
    }
  })

  it('handles plain options and letter-only answers', () => {
    const q = shuffleQuestion({ options: ['x', 'y', 'z', 'w'], answer: 'A' })
    expect(q.options).toContain('x')
    expect(q.answer).toBe('x')
  })

  it('leaves true/false and short answers alone', () => {
    const sa = { question: 'Explain', answer: 'Because' }
    expect(shuffleQuestion(sa)).toBe(sa)
  })
})
