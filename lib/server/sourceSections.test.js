import { describe, it, expect } from 'vitest'
import { sectionize, renderSections } from './sourceSections.js'

describe('sectionize', () => {
  it('keeps all of a 3,000-word document, in order, in numbered sections', () => {
    const paras = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}. ` + 'word '.repeat(50))
    const text = paras.join('\n\n')
    const sections = sectionize(text)
    expect(sections.length).toBeGreaterThan(5)
    const joined = sections.join('\n\n')
    expect(joined).toContain('Paragraph 1.')
    expect(joined).toContain('Paragraph 60.')
    expect(sections.every(s => s.length <= 1900)).toBe(true)
    expect(renderSections(sections)).toMatch(/^\[Section 1\]\n/)
  })

  it('splits one very long paragraph', () => {
    const sections = sectionize('a '.repeat(3000))
    expect(sections.length).toBeGreaterThan(2)
  })

  it('returns nothing for empty text', () => {
    expect(sectionize('   ')).toEqual([])
  })
})
