// Law school GPA medians on the SEO pages must come from content/law-school-medians.json
// (ABA Standard 509 disclosures). These tests fail when a page drifts from the data or
// states a law-school GPA figure the data does not contain.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, LAW_PAGES, loadData, buildValues, syncHtml } from '../../scripts/law-medians-lib.mjs'

const data = loadData()
const values = buildValues(data)
const read = page => fs.readFileSync(path.join(ROOT, 'public', page), 'utf8')

// Visible text plus meta descriptions and JSON-LD, split into sentences.
function sentences(html) {
  const meta = [...html.matchAll(/<meta[^>]+content="([^"]*)"/g)].map(m => m[1])
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1])
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
  return [body, ...meta, ...ld].join(' . ').replace(/&nbsp;/g, ' ').split(/(?<=[.!?;"])\s+|\n/)
}

const LAW = /\b(law school|law schools|LSAT|T-?14|top 14|Law\b)/i
const GPA_NUM = /(?<![\d.$])([1-4]\.\d{1,2})(?![\d%])/g

describe('law school medians data', () => {
  it('has the fields every page relies on', () => {
    expect(data.report_year).toBe(2025)
    expect(data.source_url).toMatch(/^https:\/\/www\.abarequireddisclosures\.org\//)
    expect(data.t14).toHaveLength(14)
    for (const slug of data.t14) expect(values[`${slug}.gpa50`]).toMatch(/^\d\.\d\d$/)
  })
})

describe.each(LAW_PAGES)('%s', page => {
  const html = read(page)

  it('has every data-law span in sync with the data', () => {
    const { html: synced, unknown } = syncHtml(html, values)
    expect(unknown).toEqual([])
    expect(synced === html, 'run node scripts/sync-law-medians.mjs').toBe(true)
  })

  it('cites the ABA 509 source wherever it shows law medians', () => {
    if (!html.includes('data-law=')) return
    expect(html).toContain(data.source_url)
  })

  it('states no law-school GPA figure that is not in the data', () => {
    const own = page.match(/is-a-(\d)-(\d)-gpa-good/)
    const allowed = new Set([...Object.values(values), '4.0', '4.00', '4.33'])
    if (own) allowed.add(`${own[1]}.${own[2]}`)
    const bad = []
    for (const s of sentences(html)) {
      if (!LAW.test(s)) continue
      for (const [, n] of s.matchAll(GPA_NUM)) if (!allowed.has(n)) bad.push(`${n} in "${s.trim().slice(0, 140)}"`)
    }
    expect(bad).toEqual([])
  })
})
