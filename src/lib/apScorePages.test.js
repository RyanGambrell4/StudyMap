// public/is-a-3-on-ap-*-good.html are generated from content/ap-scores-2026.json by
// scripts/build-ap-score-pages.py. Fails if a page drifts from the College Board data.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')
const data = JSON.parse(fs.readFileSync(path.join(root, 'content', 'ap-scores-2026.json'), 'utf8'))

describe.each(data.subjects)('AP $name score page', s => {
  const html = fs.readFileSync(path.join(root, 'public', `is-a-3-on-ap-${s.slug}-good.html`), 'utf8')

  it('shows the College Board distribution for this subject', () => {
    const [p5, p4, p3, p2, p1] = s.pct
    expect(html).toContain(`5 ${p5}%, 4 ${p4}%, 3 ${p3}%, 2 ${p2}%, 1 ${p1}%`)
    expect(html).toContain(`${s.pass}% scored 3 or higher`)
    expect(html).toContain(data.sources.distributions)
  })

  it('states the published 2027 exam date', () => {
    const d = new Date(`${s.exam2027[0]}T12:00:00Z`)
    const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    expect(html).toContain(`${month} ${d.getUTCDate()}, 2027`)
    expect(html).toContain(`${s.exam2027[1]} session`)
  })

  it('keeps the title within 60 characters and has no em dash', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)[1].length).toBeLessThanOrEqual(60)
    expect(html).not.toContain('—')
  })
})
