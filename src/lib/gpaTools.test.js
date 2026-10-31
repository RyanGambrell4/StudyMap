// The GPA tools in public/ do their math in inline functions. These tests pull them out
// of the pages so the published worked examples stay correct.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const page = name => fs.readFileSync(path.join(__dirname, '..', '..', 'public', name), 'utf8')
const extract = (html, names) => {
  const body = names.map(n => html.match(new RegExp(`function ${n}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0]).join('')
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return { ${names.join(', ')} };`)()
}

describe('GPA raise calculator', () => {
  const html = page('gpa-raise-calculator.html')
  const { coursesNeeded, gpaAfter } = extract(html, ['coursesNeeded', 'gpaAfter'])

  it('gives the worked-example answers shown on the page', () => {
    expect(coursesNeeded(2.5, 30, 3.0, 3, 4.0)).toBe(5)
    expect(coursesNeeded(2.5, 60, 3.0, 3, 4.0)).toBe(10)
    expect(coursesNeeded(3.2, 30, 3.5, 3, 4.0)).toBe(6)
    expect(coursesNeeded(3.2, 60, 3.5, 3, 4.0)).toBe(12)
    expect(coursesNeeded(3.2, 90, 3.5, 3, 4.0)).toBe(18)
    expect(gpaAfter(2.5, 30, 15, 4.0)).toBeCloseTo(3.0, 10)
  })

  it('the course count it returns is the smallest that reaches the target', () => {
    for (const [G, C, T, g] of [[2.8, 45, 3.2, 4.0], [3.1, 75, 3.4, 3.7], [2.2, 20, 2.9, 3.3]]) {
      const n = coursesNeeded(G, C, T, 3, g)
      expect(gpaAfter(G, C, n * 3, g)).toBeGreaterThanOrEqual(T - 1e-9)
      expect(gpaAfter(G, C, (n - 1) * 3, g)).toBeLessThan(T)
    }
  })

  it('handles already-there and impossible targets', () => {
    expect(coursesNeeded(3.6, 60, 3.5, 3, 4.0)).toBe(0)
    expect(coursesNeeded(3.0, 60, 3.5, 3, 3.3)).toBe(Infinity)
    expect(coursesNeeded(3.9, 60, 4.0, 3, 4.0)).toBe(Infinity)
  })
})

describe('weighted to unweighted converter', () => {
  const html = page('weighted-gpa-calculator.html')
  const { unweightedFromWeighted } = extract(html, ['unweightedFromWeighted'])

  it('matches the worked example on the page (4.20, 4 of 12 AP, +1.0 -> 3.87)', () => {
    expect(unweightedFromWeighted(4.2, 4, 12, 1).toFixed(2)).toBe('3.87')
    expect(html).toContain('= 3.87 unweighted')
  })

  it('inverts the weighting for equal-credit courses', () => {
    // 3 equal-credit courses: A in an AP class (+1.0), B and A- in regular classes
    const unweighted = (4 + 3 + 3.7) / 3
    const weighted = unweighted + 1 / 3
    expect(unweightedFromWeighted(weighted, 1, 3, 1)).toBeCloseTo(unweighted, 10)
  })
})
