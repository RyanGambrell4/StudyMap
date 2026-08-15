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
 */
describe('trial plan constants', () => {
  it('bills the trial as Pro weekly, never Unlimited', () => {
    expect(TRIAL_PLAN).toBe('pro')
    expect(TRIAL_BILLING_PERIOD).toBe('weekly')
    expect(TRIAL_PLAN).not.toBe('unlimited')
  })

  it('runs for 7 days', () => {
    expect(TRIAL_PERIOD_DAYS).toBe(7)
  })
})

describe('resolveCheckoutPlan — trial requests', () => {
  it('forces a stale unlimited/weekly trial request to pro/weekly', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: true })
    expect(r).toEqual({ plan: 'pro', billingPeriod: 'weekly', wantsTrial: true, coerced: true })
  })

  it.each([
    ['unlimited', 'monthly'],
    ['unlimited', 'yearly'],
    ['unlimited', 'annual'],
    ['pro', 'monthly'],
    ['pro', 'yearly'],
  ])('forces a %s/%s trial request to pro/weekly', (plan, billingPeriod) => {
    const r = resolveCheckoutPlan({ plan, billingPeriod, trial: true })
    expect(r.plan).toBe('pro')
    expect(r.billingPeriod).toBe('weekly')
    expect(r.coerced).toBe(true)
  })

  it('leaves an already-correct pro/weekly trial untouched and flags no coercion', () => {
    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'weekly', trial: true })
    expect(r).toEqual({ plan: 'pro', billingPeriod: 'weekly', wantsTrial: true, coerced: false })
  })

  it('forces pro/weekly even when the plan is garbage or missing', () => {
    for (const plan of [undefined, null, '', 'enterprise', 'free']) {
      const r = resolveCheckoutPlan({ plan, billingPeriod: 'weekly', trial: true })
      expect(r.plan).toBe('pro')
      expect(r.billingPeriod).toBe('weekly')
    }
  })

  it('treats annual as an alias of yearly when deciding whether it coerced', () => {
    // 'annual' normalizes to 'yearly', which is still not the trial period.
    expect(resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'annual', trial: true }).coerced).toBe(true)
  })
})

describe('resolveCheckoutPlan — non-trial requests', () => {
  it('passes a direct Unlimited purchase through untouched', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: false })
    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'weekly', wantsTrial: false, coerced: false })
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
