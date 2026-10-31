// public/ap-*-flashcards.html are generated from content/ap-flashcards.json by
// scripts/build-ap-flashcard-pages.py. Every card comes from a College Board CED
// and cites its code. Fails if a page drops a card, loses its source, or breaks
// the title length rule, and runs the deck script once to prove it works.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const root = path.join(__dirname, '..', '..')
const data = JSON.parse(fs.readFileSync(path.join(root, 'content', 'ap-flashcards.json'), 'utf8'))
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const page = c => fs.readFileSync(path.join(root, 'public', `ap-${c.slug}-flashcards.html`), 'utf8')

describe.each(data.courses)('AP $name flashcard page', c => {
  const html = page(c)
  const list = html.slice(html.indexOf('<div class="fc-list">'), html.indexOf('<h2>Source</h2>'))

  it('has between 20 and 40 cards, each with a CED code', () => {
    expect(c.cards.length).toBeGreaterThanOrEqual(20)
    expect(c.cards.length).toBeLessThanOrEqual(40)
    for (const card of c.cards) {
      expect(card.code).toMatch(/^[A-Z0-9]/)
      expect(c.units.map(u => u.number)).toContain(card.unit)
    }
  })

  it('shows every card as crawlable text with its code', () => {
    for (const card of c.cards) {
      expect(list).toContain(`<dt>${esc(card.front)}</dt>`)
      expect(list).toContain(`<dd>${esc(card.back)}<small>`)
      expect(list).toContain(`CED code ${esc(card.code)}`)
    }
  })

  it('cites the CED edition and URL', () => {
    expect(c.ced_url).toMatch(/^https:\/\/apcentral\.collegeboard\.org\/media\/pdf\/.+\.pdf$/)
    expect(html).toContain(`href="${c.ced_url}"`)
    expect(html).toContain(esc(c.ced_edition))
  })

  it('lists every unit with its CED weight', () => {
    for (const u of c.units) {
      expect(html).toContain(`<td class="num">Unit ${u.number}</td>`)
      if (u.weight) expect(html).toContain(`<td class="num">${u.weight}</td>`)
    }
  })

  it('keeps the title within 60 characters and the copy free of em and en dashes', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)[1].length).toBeLessThanOrEqual(60)
    const desc = html.match(/<meta name="description" content="([^"]*)"/)[1]
    expect(desc.length).toBeGreaterThanOrEqual(150)
    expect(desc.length).toBeLessThanOrEqual(160)
    expect(html).not.toContain('\u2014')
    expect(html).not.toContain('\u2013')
  })

  it('has valid JSON-LD and the deck CTA', () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
    expect(blocks.map(b => b['@type'])).toEqual(['LearningResource', 'BreadcrumbList'])
    expect(html).toContain(`data-seo-cta="ap-deck-${c.slug}"`)
    expect(html).toContain(`href="/is-a-3-on-ap-${c.score_slug}-good"`)
  })
})

describe('deck script', () => {
  it('flips, filters, shuffles and exports term TAB definition lines', () => {
    const c = data.courses[0]
    const dom = new JSDOM(page(c), { runScripts: 'dangerously', url: 'https://getstudyedge.com/' })
    const { document } = dom.window
    const $ = id => document.getElementById(id)
    expect(document.documentElement.classList.contains('js')).toBe(true)
    expect($('fc-front').textContent).toBe(c.cards[0].front)
    expect($('fc-count').textContent).toBe(`Card 1 of ${c.cards.length}`)
    $('fc-card').click()
    expect($('fc-card').classList.contains('is-flipped')).toBe(true)
    expect($('fc-back').textContent).toBe(c.cards[0].back)
    $('fc-next').click()
    expect($('fc-front').textContent).toBe(c.cards[1].front)
    expect($('fc-card').classList.contains('is-flipped')).toBe(false)
    $('fc-deck').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect($('fc-front').textContent).toBe(c.cards[0].front)
    const unit = c.units[c.units.length - 1].number
    $('fc-unit').value = String(unit)
    $('fc-unit').dispatchEvent(new dom.window.Event('change'))
    const inUnit = c.cards.filter(x => x.unit === unit)
    expect($('fc-count').textContent).toBe(`Card 1 of ${inUnit.length}`)
    $('fc-shuffle').click()
    expect(inUnit.map(x => x.front)).toContain($('fc-front').textContent)
    const href = $('fc-download').getAttribute('href')
    expect(href === '#').toBe(false)
    const tsv = c.cards.map(x => `${x.front}\t${x.back}`).join('\n') + '\n'
    if (href.startsWith('data:')) expect(decodeURIComponent(href.split(',')[1])).toBe(tsv)
    dom.window.close()
  })
})
