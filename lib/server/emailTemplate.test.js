/**
 * Guards the shared email layout and the copy facts it restates.
 *
 * Two bug classes are pinned here:
 *
 * 1. Brand drift. 21 api/ files shipped an orange `#E8531A` call-to-action and
 *    there were 93 uses of `#3B61C4`, while the brand blue in
 *    src/theme/tokens.js is `#3452D9` and appeared in no email at all.
 *
 * 2. Price drift. "$9.99/month or $9.99/month after" went out to real users.
 *    The copy linter in scripts/facts.mjs would have caught a wrong
 *    price/interval pairing, but its TARGET_GLOBS only covers public/*.html
 *    and the root HTML entrypoints -- it has never looked at api/.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { renderEmail, ctaButton, BRAND, PRICE, TRIAL_TERMS } from './emailTemplate.js'
import { facts } from '../../scripts/facts.mjs'
import { TRIAL_PERIOD_DAYS } from './trialPlan.js'

const sample = () => renderEmail({
  preheaderText: 'Inbox preview line.',
  headline: 'You used all 5 free AI questions.',
  paragraphs: ['Hey Ryan, you used them up.', 'Start the trial to keep going.'],
  callout: { title: 'What Pro unlocks', body: '100 AI actions a month.' },
  cta: { label: 'Unlock 100 AI questions', url: 'https://getstudyedge.com/app?trial=1' },
  ctaSubtext: TRIAL_TERMS,
  unsubscribeUrl: 'https://getstudyedge.com/unsubscribe?uid=abc',
})

describe('the shared layout restates content/facts.json', () => {
  it('uses the Pro monthly price from facts.json', () => {
    expect(PRICE.proMonth).toBe(facts.plans.pro.month.toFixed(2))
  })

  it('uses the Pro yearly price from facts.json', () => {
    expect(PRICE.proYear).toBe(facts.plans.pro.year.toFixed(2))
  })

  it('uses the real trial length', () => {
    expect(PRICE.trialDays).toBe(TRIAL_PERIOD_DAYS)
    expect(PRICE.trialDays).toBe(facts.trial.days)
  })

  it('states the card-required terms, because the trial auto-bills', () => {
    expect(facts.trial.cardRequired).toBe(true)
    expect(TRIAL_TERMS).toMatch(/free for 7 days/i)
    expect(TRIAL_TERMS).toMatch(/\$9\.99\/month/)
    expect(TRIAL_TERMS).toMatch(/cancel/i)
  })

  it('never claims a retired weekly price', () => {
    for (const retired of facts.retiredPrices) {
      expect(TRIAL_TERMS).not.toContain(String(retired))
    }
  })
})

describe('rendered output is on brand', () => {
  const html = sample()

  it('uses the V2 brand blue', () => {
    expect(html).toContain(BRAND.blue)
    expect(BRAND.blue).toBe('#3452D9')
  })

  it('does not reintroduce the orange or the old blue', () => {
    expect(html).not.toContain('E8531A')
    expect(html).not.toContain('3B61C4')
  })

  it('leads with the headline, with no icon or badge above it', () => {
    // The logo is allowed; an icon badge above the headline is not.
    const beforeH1 = html.slice(0, html.indexOf('<h1'))
    expect(beforeH1).not.toMatch(/border-radius:999/)
  })
})

describe('rendered output survives real mail clients', () => {
  const html = sample()

  it('is table-based, not flexbox or grid', () => {
    expect(html).toMatch(/<table/)
    expect(html).not.toContain('display:flex')
    expect(html).not.toContain('display:grid')
  })

  it('carries a hidden preheader', () => {
    expect(html).toContain('Inbox preview line.')
    expect(html).toMatch(/display:none/)
  })

  it('caps the body at 600px so phones do not side-scroll', () => {
    expect(html).toContain('max-width:600px')
  })

  it('renders the CTA as a bgcolor td, which Outlook honours', () => {
    expect(ctaButton({ label: 'Go', url: 'https://x.test' }))
      .toMatch(/<td[^>]*bgcolor="#3452D9"/)
  })

  it('includes an unsubscribe link', () => {
    expect(html).toContain('https://getstudyedge.com/unsubscribe?uid=abc')
  })

  it('avoids em dashes, per the house style', () => {
    expect(html).not.toContain('—')
    expect(html).not.toContain('&mdash;')
  })
})

describe('the layout refuses to render something unsendable', () => {
  it('requires a preheader', () => {
    expect(() => renderEmail({ headline: 'x', unsubscribeUrl: 'u' })).toThrow(/preheaderText/)
  })

  it('requires an unsubscribe url', () => {
    expect(() => renderEmail({ headline: 'x', preheaderText: 'p' })).toThrow(/unsubscribeUrl/)
  })
})

describe('no email in api/ contradicts the price source of truth', () => {
  const emailFiles = readdirSync('api')
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => join('api', f))

  it('finds the api directory', () => {
    expect(emailFiles.length).toBeGreaterThan(0)
  })

  it('never states the same price twice as if it were a choice', () => {
    // The exact shape that shipped: "$9.99/month or $9.99/month after".
    const offenders = []
    for (const file of emailFiles) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/\$(\d+\.\d{2})\/(month|year|mo|yr)\s+or\s+\$(\d+\.\d{2})\/(month|year|mo|yr)/gi)) {
        if (m[1] === m[3]) offenders.push(`${file}: "${m[0]}"`)
      }
    }
    expect(offenders, `duplicated price copy:\n${offenders.join('\n')}`).toEqual([])
  })

  it('pairs each of our own prices with an interval it is actually sold at', () => {
    // Same intent as the price-interval-pairing rule in scripts/facts.mjs,
    // applied to the email sources that rule never covered. Comments are
    // stripped first: api/stripe.js legitimately discusses the retired
    // $2.99/wk in its history notes.
    const valid = new Map([
      [facts.plans.pro.month.toFixed(2),        new Set(['month'])],
      [facts.plans.pro.year.toFixed(2),         new Set(['year'])],
      [facts.plans.unlimited.month.toFixed(2),  new Set(['month'])],
      [facts.plans.unlimited.year.toFixed(2),   new Set(['year'])],
    ])
    const norm = { mo: 'month', month: 'month', monthly: 'month', yr: 'year', year: 'year', annually: 'year' }

    const offenders = []
    for (const file of emailFiles) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const m of src.matchAll(/\$(\d+\.\d{2})\s*\/\s*(mo|month|monthly|yr|year|annually)\b/gi)) {
        const allowed = valid.get(m[1])
        if (!allowed) continue // not one of our prices
        const interval = norm[m[2].toLowerCase()]
        if (!allowed.has(interval)) offenders.push(`${file}: "${m[0]}" (valid per ${[...allowed].join(', ')})`)
      }
    }
    expect(offenders, `wrong price/interval pairing:\n${offenders.join('\n')}`).toEqual([])
  })
})
