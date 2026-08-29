import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { facts, RULES, allowedPriceIntervals } from '../../scripts/facts.mjs'
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

  it('the trial is Pro weekly, and the weekly Pro price is set', () => {
    // Guards the revenue-critical invariant from the copy side: if someone
    // points the trial at Unlimited, the advertised "$2.99/wk after" is a lie.
    expect(facts.trial.plan).toBe('pro')
    expect(facts.plans.pro.week).toBe(2.99)
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
    const copy = 'Pro is $2.99/week, $9.99/month, or $69.99/year. Unlimited is $4.99/week.'
    expect(run('price-interval-pairing', copy)).toHaveLength(0)
  })

  it('catches the second regression found in the sweep: $2.99/month', () => {
    const problems = run('price-interval-pairing', 'The Pro plan at $2.99/month unlocks more.')
    expect(problems).toHaveLength(1)
    expect(problems[0].found).toBe('$2.99/month')
  })

  it('accepts annual-equivalent figures, derived not hardcoded', () => {
    // $69.99/yr -> $5.83/mo and $1.35/wk; both appear on the live pages.
    expect(allowedPriceIntervals().get('5.83')).toContain('month')
    expect(allowedPriceIntervals().get('1.35')).toContain('week')
    expect(run('price-interval-pairing', '$69.99/year ($5.83/month equivalent)')).toHaveLength(0)
    expect(run('price-interval-pairing', 'works out to $1.35/week')).toHaveLength(0)
  })

  it('handles "per week" and "a month" phrasings', () => {
    expect(run('price-interval-pairing', '$2.99 per week')).toHaveLength(0)
    expect(run('price-interval-pairing', '$2.99 a month')).toHaveLength(1)
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
