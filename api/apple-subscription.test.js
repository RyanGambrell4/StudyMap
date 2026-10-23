import { describe, it, expect, vi, beforeEach } from 'vitest'

// The handler's three dependencies are stubbed so the test exercises exactly
// the handler's own decisions: auth, body validation, and what it does with
// a verified transaction.
const state = {
  verify: { ok: true, payload: {} },
  billing: { plan: 'free', status: 'active', stripeSubId: null, appleOriginalTransactionId: null },
  commits: [],
}

vi.mock('../lib/server/usage.js', () => ({
  verifyAuth: async (req) => (req.headers.authorization ? { ok: true, userId: 'user-1' } : { ok: false, status: 401, error: 'Unauthorized' }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('../lib/server/billing.js', () => ({
  readBilling: async () => ({ ok: true, billing: state.billing }),
  commitAppleBilling: async (_s, userId, fields) => { state.commits.push({ userId, fields }); return { ok: true } },
}))
vi.mock('../lib/server/appleSubscription.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, verifySignedTransaction: async () => state.verify }
})

const { default: handler } = await import('./apple-subscription.js')
const { APPLE_BUNDLE_ID } = await import('../lib/server/appleSubscription.js')

function res() {
  const r = { statusCode: 200, body: undefined }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (b) => { r.body = b; return r }
  r.end = () => r
  return r
}

function req(body, { auth = true } = {}) {
  return { method: 'POST', headers: auth ? { authorization: 'Bearer t' } : {}, body }
}

const LIVE = {
  bundleId: APPLE_BUNDLE_ID,
  type: 'Auto-Renewable Subscription',
  productId: 'com.studyedgeai.pro.yearly',
  originalTransactionId: '42',
  purchaseDate: Date.now() - 1000,
  expiresDate: Date.now() + 7 * 24 * 3600 * 1000,
  offerType: 1,
  environment: 'Sandbox',
}

beforeEach(() => {
  state.verify = { ok: true, payload: LIVE }
  state.billing = { plan: 'free', status: 'active', stripeSubId: null, appleOriginalTransactionId: null }
  state.commits = []
})

describe('POST /api/apple-subscription', () => {
  it('requires auth', async () => {
    const r = res()
    await handler(req({ signedTransaction: 'a.b.c' }, { auth: false }), r)
    expect(r.statusCode).toBe(401)
  })

  it('rejects a missing or oversized transaction', async () => {
    let r = res()
    await handler(req({}), r)
    expect(r.statusCode).toBe(400)
    r = res()
    await handler(req({ signedTransaction: 'x'.repeat(20000) }), r)
    expect(r.statusCode).toBe(400)
    expect(state.commits).toHaveLength(0)
  })

  it('rejects a JWS that does not verify', async () => {
    state.verify = { ok: false, status: 2, error: 'bad' }
    const r = res()
    await handler(req({ signedTransaction: 'a.b.c' }), r)
    expect(r.statusCode).toBe(400)
    expect(state.commits).toHaveLength(0)
  })

  it('writes the plan for a verified live subscription', async () => {
    const r = res()
    await handler(req({ signedTransaction: 'a.b.c' }), r)
    expect(r.statusCode).toBe(200)
    expect(r.body.action).toBe('write')
    expect(r.body.plan).toBe('pro')
    expect(r.body.status).toBe('trialing')
    expect(r.body.environment).toBe('Sandbox')
    expect(state.commits).toHaveLength(1)
    expect(state.commits[0].userId).toBe('user-1')
    expect(state.commits[0].fields.appleOriginalTransactionId).toBe('42')
  })

  it('leaves a live Stripe plan alone and reports it', async () => {
    state.billing = { plan: 'pro', status: 'active', stripeSubId: 'sub_1', appleOriginalTransactionId: null }
    const r = res()
    await handler(req({ signedTransaction: 'a.b.c' }), r)
    expect(r.statusCode).toBe(200)
    expect(r.body.action).toBe('skip')
    expect(r.body.reason).toBe('stripe_active')
    expect(r.body.plan).toBe('pro')
    expect(state.commits).toHaveLength(0)
  })

  it('rejects a product it does not sell', async () => {
    state.verify = { ok: true, payload: { ...LIVE, productId: 'com.nope' } }
    const r = res()
    await handler(req({ signedTransaction: 'a.b.c' }), r)
    expect(r.statusCode).toBe(400)
  })
})
