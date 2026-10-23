import { describe, it, expect } from 'vitest'
import {
  deriveAppleBilling,
  mergeAppleIntoBilling,
  verifySignedTransaction,
  APPLE_BUNDLE_ID,
} from './appleSubscription.js'

const NOW = new Date('2026-10-23T12:00:00Z')
const DAY = 24 * 3600 * 1000

function tx(overrides = {}) {
  return {
    bundleId: APPLE_BUNDLE_ID,
    type: 'Auto-Renewable Subscription',
    productId: 'com.studyedgeai.pro.yearly',
    originalTransactionId: '2000000123',
    purchaseDate: NOW.getTime() - 2 * DAY,
    expiresDate: NOW.getTime() + 5 * DAY,
    environment: 'Production',
    ...overrides,
  }
}

describe('deriveAppleBilling', () => {
  it('maps a live yearly Pro transaction to an active pro plan', () => {
    const d = deriveAppleBilling(tx(), NOW)
    expect(d.ok).toBe(true)
    expect(d.active).toBe(true)
    expect(d.plan).toBe('pro')
    expect(d.billingPeriod).toBe('yearly')
    expect(d.status).toBe('active')
    expect(d.currentPeriodEnd).toBe(new Date(NOW.getTime() + 5 * DAY).toISOString())
    expect(d.trialUsedAt).toBeUndefined()
    expect(d.originalTransactionId).toBe('2000000123')
  })

  it('reports trialing and stamps trialUsedAt during the introductory offer', () => {
    const d = deriveAppleBilling(tx({ offerType: 1 }), NOW)
    expect(d.status).toBe('trialing')
    expect(d.trialUsedAt).toBe(new Date(NOW.getTime() - 2 * DAY).toISOString())
  })

  it('is inactive once expired', () => {
    const d = deriveAppleBilling(tx({ expiresDate: NOW.getTime() - 1000 }), NOW)
    expect(d.active).toBe(false)
    expect(d.status).toBe('expired')
  })

  it('is inactive when revoked, even before expiry', () => {
    const d = deriveAppleBilling(tx({ revocationDate: NOW.getTime() - 1000 }), NOW)
    expect(d.active).toBe(false)
    expect(d.status).toBe('revoked')
  })

  it('maps unlimited monthly', () => {
    const d = deriveAppleBilling(tx({ productId: 'com.studyedgeai.unlimited.monthly' }), NOW)
    expect(d.plan).toBe('unlimited')
    expect(d.billingPeriod).toBe('monthly')
  })

  it('rejects a product it does not sell', () => {
    expect(deriveAppleBilling(tx({ productId: 'com.other.thing' }), NOW)).toEqual({ ok: false, reason: 'unknown_product' })
  })

  it('rejects another bundle', () => {
    expect(deriveAppleBilling(tx({ bundleId: 'com.evil.app' }), NOW).reason).toBe('wrong_bundle')
  })

  it('rejects a consumable', () => {
    expect(deriveAppleBilling(tx({ type: 'Consumable' }), NOW).reason).toBe('not_subscription')
  })
})

describe('mergeAppleIntoBilling', () => {
  const freeRow = { plan: 'free', status: 'active', stripeSubId: null, appleOriginalTransactionId: null, trialUsedAt: null }
  const active = deriveAppleBilling(tx({ offerType: 1 }), NOW)
  const expired = deriveAppleBilling(tx({ expiresDate: NOW.getTime() - DAY }), NOW)

  it('grants the plan on a free account', () => {
    const r = mergeAppleIntoBilling(freeRow, active)
    expect(r.action).toBe('write')
    expect(r.fields.plan).toBe('pro')
    expect(r.fields.status).toBe('trialing')
    expect(r.fields.appleOriginalTransactionId).toBe('2000000123')
    expect(r.fields.trialUsedAt).toBe(active.trialUsedAt)
  })

  it('never overwrites a live Stripe subscription of equal or higher tier', () => {
    const stripe = { plan: 'pro', status: 'active', stripeSubId: 'sub_1', appleOriginalTransactionId: null }
    expect(mergeAppleIntoBilling(stripe, active)).toEqual({ action: 'skip', reason: 'stripe_active' })
  })

  it('upgrades a live Stripe Pro to Apple Unlimited', () => {
    const stripe = { plan: 'pro', status: 'active', stripeSubId: 'sub_1' }
    const unlimited = deriveAppleBilling(tx({ productId: 'com.studyedgeai.unlimited.yearly' }), NOW)
    const r = mergeAppleIntoBilling(stripe, unlimited)
    expect(r.action).toBe('write')
    expect(r.fields.plan).toBe('unlimited')
  })

  it('replaces a cancelled Stripe plan', () => {
    const stripe = { plan: 'free', status: 'cancelled', stripeSubId: 'sub_1' }
    expect(mergeAppleIntoBilling(stripe, active).action).toBe('write')
  })

  it('clears the plan only when the same Apple subscription set it', () => {
    const appleOwned = { plan: 'pro', status: 'active', stripeSubId: null, appleOriginalTransactionId: '2000000123', trialUsedAt: '2026-10-01T00:00:00.000Z' }
    const r = mergeAppleIntoBilling(appleOwned, expired)
    expect(r.action).toBe('write')
    expect(r.fields.plan).toBe('free')
    expect(r.fields.status).toBe('expired')
    expect(r.fields.trialUsedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('does not clear a plan another subscription set', () => {
    const other = { plan: 'pro', status: 'active', stripeSubId: null, appleOriginalTransactionId: '999' }
    expect(mergeAppleIntoBilling(other, expired)).toEqual({ action: 'skip', reason: 'not_owner' })
    expect(mergeAppleIntoBilling(freeRow, expired)).toEqual({ action: 'skip', reason: 'not_owner' })
  })

  it('does not touch a live Stripe plan when the Apple one expires', () => {
    const stripe = { plan: 'pro', status: 'trialing', stripeSubId: 'sub_1', appleOriginalTransactionId: '2000000123' }
    expect(mergeAppleIntoBilling(stripe, expired)).toEqual({ action: 'skip', reason: 'stripe_active' })
  })

  it('preserves an already-recorded trialUsedAt when a paid renewal arrives', () => {
    const row = { ...freeRow, trialUsedAt: '2026-09-01T00:00:00.000Z' }
    const renewal = deriveAppleBilling(tx(), NOW)
    expect(mergeAppleIntoBilling(row, renewal).fields.trialUsedAt).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('verifySignedTransaction', () => {
  it('returns the first verifier that accepts the JWS', async () => {
    const prod = { verifyAndDecodeTransaction: async () => { throw new Error('INVALID_ENVIRONMENT') } }
    const sandbox = { verifyAndDecodeTransaction: async () => ({ productId: 'x', environment: 'Sandbox' }) }
    const r = await verifySignedTransaction('a.b.c', { verifiers: [prod, sandbox] })
    expect(r).toEqual({ ok: true, payload: { productId: 'x', environment: 'Sandbox' } })
  })

  it('fails when no verifier accepts it', async () => {
    const bad = { verifyAndDecodeTransaction: async () => { throw new Error('bad sig') } }
    const r = await verifySignedTransaction('a.b.c', { verifiers: [bad, bad] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('bad sig')
  })

  it('rejects garbage with the real Apple verifiers', async () => {
    const r = await verifySignedTransaction('not.a.jws')
    expect(r.ok).toBe(false)
  })
})
