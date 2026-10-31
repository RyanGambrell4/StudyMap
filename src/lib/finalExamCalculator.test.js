// public/final-exam-calculator.html does its math in inline functions. These tests pull
// them out of the page so the published formula, worked example and input checks stay right.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'final-exam-calculator.html'), 'utf8')
const fn = name => html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0]
// eslint-disable-next-line no-new-func
const { requiredFinal, courseGrade, inputError } = new Function(
  `${fn('requiredFinal')}${fn('courseGrade')}${fn('inputError')}; return { requiredFinal, courseGrade, inputError };`,
)()

describe('final exam calculator', () => {
  it('matches the worked example on the page (78%, final 30%, want 80% -> 84.7%)', () => {
    expect(requiredFinal(78, 30, 80).toFixed(1)).toBe('84.7')
    expect(html).toContain('84.7%')
  })

  it('round-trips: scoring the required final gives the target grade', () => {
    for (const [cur, w, target] of [[78, 30, 80], [91, 25, 93], [65, 50, 70], [88, 100, 90]]) {
      expect(courseGrade(cur, w, requiredFinal(cur, w, target))).toBeCloseTo(target, 10)
    }
  })

  it('reports targets above 100% as out of reach rather than clamping', () => {
    expect(requiredFinal(60, 20, 90)).toBeGreaterThan(100)
  })

  it('rejects missing fields and a 0% or over-100% weight', () => {
    expect(inputError(NaN, 30, 80)).not.toBe('')
    expect(inputError(78, 0, 80)).not.toBe('')
    expect(inputError(78, 120, 80)).not.toBe('')
    expect(inputError(78, 30, 80)).toBe('')
  })

  it('no longer uses blocking alert() dialogs', () => {
    expect(html).not.toMatch(/\balert\(/)
  })
})
