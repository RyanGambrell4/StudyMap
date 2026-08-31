import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { facts, RULES, allowedPriceIntervals, renderPriceTable } from '../../scripts/facts.mjs'
import { TRIAL_PLAN, TRIAL_BILLING_PERIOD, TRIAL_PERIOD_DAYS } from './trialPlan.js'

const run = (name, text) => RULES.find((r) => r.name === name).run(text)

describe('content/facts.json agrees with the billing source of truth', () => {
  it('trial length matches TRIAL_PERIOD_DAYS', () => {
    expect(facts.trial.days).toBe(TRIAL_PERIOD_DAYS)
  })

  it('trial plan matches TRIAL_PLAN', () => {
    expect(facts.trial.plan).toBe(TRIAL_PLAN)
  })

  it('trial billing period matches TRIAL_BILLING_PERIOD', () => {
    expect(facts.trial.billingPeriod).toBe(TRIAL_BILLING_PERIOD)
  })

  it('the trial is Pro monthly, and the monthly Pro price is set', () => {
    // Guards the revenue-critical invariant from the copy side: if someone
    // points the trial at Unlimited, the advertised "$9.99/mo after" is a lie.
    expect(facts.trial.plan).toBe('pro')
    expect(facts.trial.billingPeriod).toBe('monthly')
    expect(facts.plans.pro.month).toBe(9.99)
  })

  it('no plan has a weekly price, because weekly is not sellable', () => {
    // Stripe archived $2.99/wk and $4.99/wk; PRICE_IDS omits weekly entirely.
    for (const [key, plan] of Object.entries(facts.plans)) {
      expect(plan.week, `${key} still carries a weekly price`).toBeUndefined()
    }
  })

  it('the trial requires a card, so no page may claim otherwise', () => {
    expect(facts.trial.cardRequired).toBe(true)
  })
})

describe('trial-length rule', () => {
  it('accepts the canonical value', () => {
    expect(run('trial-length', 'Start your 7-day free trial today.')).toHaveLength(0)
  })

  it('catches the exact regression that shipped: a 3-day claim', () => {
    const problems = run('trial-length', 'Pricing: $2.99/week with a 3-day free trial')
    expect(problems).toHaveLength(1)
    expect(problems[0].expected).toBe('7-day free trial')
  })

  it('catches the short form and the prose form', () => {
    expect(run('trial-length', 'a 3-day trial')).toHaveLength(1)
    expect(run('trial-length', 'free for 3 days')).toHaveLength(1)
  })

  it('would catch drift in the other direction too, not just 3-day', () => {
    // The rule keys off the shape, not a known-bad value, so a future 14-day
    // typo fails the same way.
    expect(run('trial-length', 'a 14-day free trial')).toHaveLength(1)
  })

  it('leaves unrelated day counts alone', () => {
    // Real spaced-repetition copy on the site. A naive find-and-replace on
    // "3 days" corrupted this class of sentence, so it is pinned here.
    const copy = 'Review at increasing intervals: 1 day, then 3 days, then 7 days, then 21 days.'
    expect(run('trial-length', copy)).toHaveLength(0)
  })
})

describe('price/interval pairing rule', () => {
  it('accepts every real plan price', () => {
    const copy = 'Pro is $9.99/month or $69.99/year. Unlimited is $14.99/month.'
    expect(run('price-interval-pairing', copy)).toHaveLength(0)
  })

  it('catches one of our amounts against the wrong interval', () => {
    // $2.99/month was the original regression. That amount is now retired, so
    // it belongs to the retired-price rule and this one no longer sees it.
    // The equivalent live mistake is our monthly price billed as weekly.
    const problems = run('price-interval-pairing', 'The Pro plan at $9.99/week unlocks more.')
    expect(problems).toHaveLength(1)
    expect(problems[0].found).toBe('$9.99/week')
  })

  it('accepts annual-equivalent figures, derived not hardcoded', () => {
    // $69.99/yr -> $5.83/mo and $1.35/wk; both appear on the live pages.
    expect(allowedPriceIntervals().get('5.83')).toContain('month')
    expect(allowedPriceIntervals().get('1.35')).toContain('week')
    expect(run('price-interval-pairing', '$69.99/year ($5.83/month equivalent)')).toHaveLength(0)
    expect(run('price-interval-pairing', 'works out to $1.35/week')).toHaveLength(0)
  })

  it('handles "per week" and "a month" phrasings', () => {
    expect(run('price-interval-pairing', '$9.99 per month')).toHaveLength(0)
    expect(run('price-interval-pairing', '$9.99 a week')).toHaveLength(1)
  })

  it('ignores competitor prices on comparison pages', () => {
    // Scoping this rule to our own amounts is what took the first run from
    // 12 violations (11 of them competitor prices) down to 0.
    const copy = 'Chegg is $15.95/month, Course Hero $39.95/month, Wolfram Alpha $7.99/mo.'
    expect(run('price-interval-pairing', copy)).toHaveLength(0)
  })
})

describe('the shipped site', () => {
  const root = join(import.meta.dirname, '../..')

  it('pricing.md, which AI agents read, states the correct trial', () => {
    const md = readFileSync(join(root, 'public/pricing.md'), 'utf8')
    expect(run('trial-length', md)).toHaveLength(0)
    expect(md).toContain(`${facts.trial.days}-day free trial`)
  })

  it('llms.txt states the correct trial', () => {
    const txt = readFileSync(join(root, 'public/llms.txt'), 'utf8')
    expect(run('trial-length', txt)).toHaveLength(0)
  })

  it('the pricing page title, which is the SERP snippet, is correct', () => {
    const html = readFileSync(join(root, 'public/pricing.html'), 'utf8')
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? ''
    expect(run('trial-length', title)).toHaveLength(0)
  })
})

describe('jsonld-offer-price rule', () => {
  // This is the rule that would have caught the 2026-08-30 miss. Branch 3 swept
  // visible copy but could not sweep JSON-LD, because JSON-LD carries the amount
  // and the interval in separate fields: there is no "$2.99/month" string for
  // price-interval-pairing to object to, only "price": "2.99" sitting on its own.
  it('catches an offer priced at the retired weekly amount', () => {
    const problems = run('jsonld-offer-price', '{ "@type": "Offer", "name": "Pro", "price": "2.99" }')
    expect(problems).toHaveLength(1)
    expect(problems[0].expected).toContain('9.99')
  })

  it('accepts an offer at the real monthly price', () => {
    expect(run('jsonld-offer-price', '"name": "Pro", "price": "9.99"')).toHaveLength(0)
    expect(run('jsonld-offer-price', '"name": "Unlimited", "price": "14.99"')).toHaveLength(0)
    expect(run('jsonld-offer-price', '"name": "Free", "price": "0"')).toHaveLength(0)
  })

  it('spans the multi-line shape the static pages actually use', () => {
    const block = [
      '      {',
      '        "@type": "Offer",',
      '        "name": "Unlimited",',
      '        "price": "4.99",',
      '        "priceCurrency": "USD"',
      '      }',
    ].join('\n')
    expect(run('jsonld-offer-price', block)).toHaveLength(1)
  })

  it('leaves a period-qualified offer name to the retired-period-offer rule', () => {
    // "Pro Annual" is a legitimate separate offer at the annual price, and must
    // not be forced to the monthly one.
    expect(run('jsonld-offer-price', '"name": "Pro Annual", "price": "69.99"')).toHaveLength(0)
  })
})

describe('retired-price rule', () => {
  it('catches a retired amount in prose', () => {
    expect(run('retired-price', 'Pro is just $2.99/wk, less than a coffee.')).toHaveLength(1)
    expect(run('retired-price', 'Unlimited from $4.99 a week.')).toHaveLength(1)
  })

  it('exists because dropping the fact would otherwise remove the guard', () => {
    // allowedPriceIntervals() only inspects amounts it recognises as ours, so
    // once 2.99 stopped being one of our prices, price-interval-pairing began
    // treating "$2.99/wk" as a competitor quote and skipping it entirely.
    expect(run('price-interval-pairing', '$2.99/wk')).toHaveLength(0)
    expect(run('retired-price', '$2.99/wk')).toHaveLength(1)
  })

  it('does not fire on SVG path coordinates', () => {
    // The inlined Google logo contains both retired amounts as path data:
    // "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59...". Requiring a literal $ is
    // what keeps this rule off it.
    const path = 'd="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59l-7.98-6.19z"'
    expect(run('retired-price', path)).toHaveLength(0)
  })

  it('does not double-report an offer the jsonld rule already owns', () => {
    expect(run('retired-price', '"name": "Pro", "price": "2.99"')).toHaveLength(0)
  })

  it('leaves current and competitor prices alone', () => {
    expect(run('retired-price', 'Pro $9.99/mo, Chegg $15.95/month, $12.99 legacy')).toHaveLength(0)
  })
})

describe('retired-period-offer rule', () => {
  it('catches a whole offer for a period we withdrew', () => {
    const problems = run('retired-period-offer', '"name": "Pro Weekly",')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain('Remove the whole Offer block')
  })

  it('ignores study-schedule steps and FAQ entries', () => {
    // Anchoring to our plan names took this rule from 97 false positives to 2.
    const copy = [
      '"name": "Week 8: Sharpen and rest"',
      '"name": "What is semester GPA?"',
      '"name": "Semester GPA Calculator"',
      '"name": "Write a complete LEQ thesis every week, not a full essay"',
    ].join('\n')
    expect(run('retired-period-offer', copy)).toHaveLength(0)
  })

  it('ignores the offers we do still sell', () => {
    expect(run('retired-period-offer', '"name": "Pro Monthly"\n"name": "Pro Annual"')).toHaveLength(0)
  })
})

describe('landing-price-table rule', () => {
  const wrap = (body) => `/* facts:price-table x */\n${body}\n      /* /facts:price-table */`

  it('accepts the literal it generates', () => {
    expect(run('landing-price-table', wrap(renderPriceTable()))).toHaveLength(0)
  })

  it('catches a hand-edited price', () => {
    const drifted = renderPriceTable().replace('9.99', '2.99')
    expect(run('landing-price-table', wrap(drifted))).toHaveLength(1)
  })

  it('reports a region left unterminated', () => {
    expect(run('landing-price-table', '/* facts:price-table x */\nconst PRICE_TABLE = {};')).toHaveLength(1)
  })

  it('says nothing about files that carry no markers', () => {
    expect(run('landing-price-table', '<p>Pro is $9.99/month.</p>')).toHaveLength(0)
  })
})
