// what-gpa-do-you-need-for-<school> pages built by scripts/build-school-gpa-pages.py must match
// content/cds-gpa-2025.json, each school's own Common Data Set 2025-26.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')
const data = JSON.parse(fs.readFileSync(path.join(root, 'content', 'cds-gpa-2025.json'), 'utf8'))
const fmt = g => (Math.round(g * 100) !== Math.round(g * 10) * 10 ? g.toFixed(2) : g.toFixed(1))

describe.each(data.schools)('$name GPA page', s => {
  const slug = s.page || `what-gpa-do-you-need-for-${s.slug}`
  const html = fs.readFileSync(path.join(root, 'public', `${slug}.html`), 'utf8')

  it('cites its Common Data Set and states the admit rate from C1', () => {
    expect(html).toContain(s.url)
    expect(html).toContain(`${(Math.round(1000 * s.admitted / s.applied) / 10)}% of applicants`)
    expect(html).toContain(`${s.admitted.toLocaleString('en-US')} of ${s.applied.toLocaleString('en-US')}`)
  })

  it('states the C12 average, or says the school publishes none', () => {
    if (s.c12_gpa == null) expect(html).toContain('leaves the GPA section (C12) blank')
    else expect(html).toContain(`average high school GPA of <strong>${fmt(s.c12_gpa)}</strong>`)
  })

  it('has a title within 60 characters and no em dash', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)[1].length).toBeLessThanOrEqual(60)
    expect(html).not.toContain('—')
  })
})
