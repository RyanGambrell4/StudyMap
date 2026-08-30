import { describe, it, expect } from 'vitest'
import {
  resolveCheckoutPlan,
  TRIAL_PLAN,
  TRIAL_BILLING_PERIOD,
  TRIAL_PERIOD_DAYS,
} from './trialPlan.js'

/**
 * REVENUE-CRITICAL guard. On 2026-08-15 a stale PWA client created a live
 * $4.99/wk Unlimited trial hours after the frontend had already shipped the Pro
 * fix, because the server accepted whatever plan the client sent. These tests
 * lock the server-side coercion that makes that impossible.
 *
 * The trial now bills MONTHLY. It used to convert to Pro weekly at $2.99, and
 * Stripe's own hosted page said "7 days free, then $2.99 per week" — a weekly
 * charge against a student debit card, which is exactly what killed the only
 * real subscription this product has had. Weekly is retired as a sellable
 * period, and any request naming it is converted rather than refused.
 */
describe('trial plan constants', () => {
  it('bills the trial as Pro monthly, never Unlimited', () => {
    expect(TRIAL_PLAN).toBe('pro')
    expect(TRIAL_BILLING_PERIOD).toBe('monthly')
    expect(TRIAL_PLAN).not.toBe('unlimited')
  })

  it('REGRESSION: the trial is never billed weekly', () => {
    expect(TRIAL_BILLING_PERIOD).not.toBe('weekly')
  })

  it('runs for 7 days', () => {
    expect(TRIAL_PERIOD_DAYS).toBe(7)
  })
})

describe('resolveCheckoutPlan — trial requests', () => {
  it('forces a stale unlimited/weekly trial request to pro/monthly', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: true })
    expect(r).toEqual({ plan: 'pro', billingPeriod: 'monthly', wantsTrial: true, coerced: true })
  })

  it.each([
    ['unlimited', 'monthly'],
    ['unlimited', 'yearly'],
    ['unlimited', 'annual'],
    ['unlimited', 'weekly'],
    ['pro', 'yearly'],
    ['pro', 'weekly'],
  ])('forces a %s/%s trial request to pro/monthly', (plan, billingPeriod) => {
    const r = resolveCheckoutPlan({ plan, billingPeriod, trial: true })
    expect(r.plan).toBe('pro')
    expect(r.billingPeriod).toBe('monthly')
    expect(r.coerced).toBe(true)
  })

  it('leaves an already-correct pro/monthly trial untouched and flags no coercion', () => {
    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'monthly', trial: true })
    expect(r).toEqual({ plan: 'pro', billingPeriod: 'monthly', wantsTrial: true, coerced: false })
  })

  it('forces pro/monthly even when the plan is garbage or missing', () => {
    for (const plan of [undefined, null, '', 'enterprise', 'free']) {
      const r = resolveCheckoutPlan({ plan, billingPeriod: 'monthly', trial: true })
      expect(r.plan).toBe('pro')
      expect(r.billingPeriod).toBe('monthly')
    }
  })

  it('treats annual as an alias of yearly when deciding whether it coerced', () => {
    // 'annual' normalizes to 'yearly', which is still not the trial period.
    expect(resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'annual', trial: true }).coerced).toBe(true)
  })
})

describe('resolveCheckoutPlan — non-trial requests', () => {
  it('passes a direct Unlimited monthly purchase through untouched', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'monthly', trial: false })
    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'monthly', wantsTrial: false, coerced: false })
  })

  it('still normalizes the annual alias on paid purchases', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'annual', trial: false })
    expect(r.plan).toBe('unlimited')
    expect(r.billingPeriod).toBe('yearly')
  })

  it.each([undefined, null, false, 0, ''])('treats trial=%s as a paid purchase', (trial) => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'monthly', trial })
    expect(r.wantsTrial).toBe(false)
    expect(r.plan).toBe('unlimited')
  })
})

/**
 * Retired periods are converted, never honoured and never refused.
 *
 * Weekly and semester are no longer sold, but they are still everywhere: 85
 * files carried `billing=weekly` links, every lifecycle email ever sent carries
 * one, and cached PWA bundles keep sending them for days after a deploy.
 * Refusing them would turn a pricing change into a broken checkout for exactly
 * the people most likely to buy; honouring them would sell a price we retired.
 */
describe('resolveCheckoutPlan — retired billing periods', () => {
  it.each(['weekly', 'semester'])('converts a direct %s purchase to monthly and flags it', (period) => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: period, trial: false })
    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'monthly', wantsTrial: false, coerced: true })
  })

  it('REGRESSION: no request can come back holding a retired period', () => {
    for (const plan of ['pro', 'unlimited']) {
      for (const period of ['weekly', 'semester']) {
        for (const trial of [true, false]) {
          const r = resolveCheckoutPlan({ plan, billingPeriod: period, trial })
          expect(r.billingPeriod, `${plan}/${period} trial=${trial} leaked a retired period`)
            .not.toBe(period)
        }
      }
    }
  })

  it('leaves the two periods we actually sell alone', () => {
    for (const period of ['monthly', 'yearly']) {
      const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: period, trial: false })
      expect(r.billingPeriod).toBe(period)
      expect(r.coerced).toBe(false)
    }
  })
})
