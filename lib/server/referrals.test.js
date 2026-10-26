import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ensureCode, claimReferral, recordPaid, applyBankedMonths, referralStats, normalizeCode,
} from './referrals.js'
import { resolveEnforcedPlan } from './appleSubscription.js'

// Minimal in-memory Supabase: from(t).select().eq().eq().maybeSingle(),
// insert(row), update(fields).eq(...).eq(...)[.select()], with unique checks.
function fakeDb() {
  const tables = { referral_codes: [], referrals: [], user_billing: [] }
  const unique = { referral_codes: ['user_id', 'code'], referrals: ['referred_id'], user_billing: ['user_id'] }
  return {
    tables,
    from(name) {
      const rows = tables[name]
      const filters = []
      let op = 'select'
      let payload = null
      let wantRows = false
      const match = r => filters.every(([k, v]) => r[k] === v)
      const q = {
        select() { if (op !== 'select') wantRows = true; return q },
        eq(k, v) { filters.push([k, v]); return q },
        maybeSingle() { return Promise.resolve({ data: rows.find(match) ?? null, error: null }) },
        insert(row) {
          for (const k of unique[name]) {
            if (rows.some(r => r[k] === row[k])) return Promise.resolve({ error: { code: '23505' } })
          }
          rows.push({ id: `${name}-${rows.length + 1}`, ...row })
          return Promise.resolve({ error: null })
        },
        update(fields) { op = 'update'; payload = fields; return q },
        then(resolve) {
          const hit = rows.filter(match)
          // Awaiting a plain select returns the matching rows.
          if (op === 'select') return resolve({ data: hit, error: null })
          // Awaiting an update (with or without .select()) applies it.
          hit.forEach(r => Object.assign(r, payload))
          resolve({ data: wantRows ? hit.map(r => ({ id: r.id })) : null, error: null })
        },
      }
      return q
    },
  }
}

const NOW = new Date('2026-11-01T12:00:00Z')
const DAY = 86_400_000
const plan = b => resolveEnforcedPlan({
  status: b.status, plan: b.plan, grantedBy: b.granted_by, currentPeriodEnd: b.current_period_end,
  appleOriginalTransactionId: b.apple_original_transaction_id, stripeSubId: b.stripe_subscription_id,
}, NOW.getTime())

let db
beforeEach(() => { db = fakeDb() })

describe('referral to free month, end to end', () => {
  it('a free referrer gets 30 days of Pro when the friend first pays', async () => {
    const code = await ensureCode(db, 'alice')
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(await ensureCode(db, 'alice')).toBe(code)                       // stable

    const claim = await claimReferral(db, { referredId: 'bob', rawCode: code.toLowerCase(), referredCreatedAt: NOW, now: NOW })
    expect(claim).toEqual({ ok: true, referrerId: 'alice' })

    // Trial starting does not count; the first paid period does.
    const notify = vi.fn()
    const r = await recordPaid(db, { referredId: 'bob', via: 'apple', now: NOW }, { notify })
    expect(r.reward).toMatchObject({ kind: 'access_days', days: 30 })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ referrerId: 'alice', referredId: 'bob' }))

    const alice = db.tables.user_billing.find(b => b.user_id === 'alice')
    expect(alice).toMatchObject({ plan: 'pro', status: 'active', granted_by: 'referral' })
    expect(plan(alice)).toBe('pro')
    expect(await referralStats(db, 'alice')).toMatchObject({ invited: 1, joined: 1, monthsEarned: 1 })

    // Webhook retry: no second month.
    const again = await recordPaid(db, { referredId: 'bob', via: 'apple', now: NOW }, { notify })
    expect(again.skipped).toBe('already_rewarded')
    expect(notify).toHaveBeenCalledTimes(1)

    // The month ends.
    const later = new Date(NOW.getTime() + 31 * DAY)
    expect(resolveEnforcedPlan({ status: alice.status, plan: alice.plan, grantedBy: 'referral', currentPeriodEnd: alice.current_period_end }, later.getTime())).toBe('free')
  })

  it('a Stripe-paying referrer gets a one-month credit in their own currency', async () => {
    db.tables.user_billing.push({ user_id: 'alice', plan: 'pro', status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' })
    const code = await ensureCode(db, 'alice')
    await claimReferral(db, { referredId: 'bob', rawCode: code, referredCreatedAt: NOW, now: NOW })
    const stripe = {
      subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [{ price: { unit_amount: 12999, currency: 'cad', recurring: { interval: 'year' } } }] } })) },
      customers: { createBalanceTransaction: vi.fn(async () => ({})) },
    }
    const r = await recordPaid(db, { referredId: 'bob', via: 'stripe', now: NOW }, { stripe })
    expect(r.reward).toEqual({ kind: 'stripe_credit', amount: 1083, currency: 'cad' })
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith('cus_1', expect.objectContaining({ amount: -1083, currency: 'cad' }))
  })

  it('an Apple-paying referrer banks the month, which starts when Apple lapses', async () => {
    const appleEnd = new Date(NOW.getTime() + 10 * DAY).toISOString()
    db.tables.user_billing.push({ user_id: 'alice', plan: 'pro', status: 'active', apple_original_transaction_id: 'txn', current_period_end: appleEnd, referral_months_banked: 0 })
    const code = await ensureCode(db, 'alice')
    await claimReferral(db, { referredId: 'bob', rawCode: code, referredCreatedAt: NOW, now: NOW })
    const r = await recordPaid(db, { referredId: 'bob', via: 'apple', now: NOW })
    expect(r.reward).toEqual({ kind: 'banked_month', banked: 1 })

    const isPaying = (b, now) => plan(b) !== 'free' && Date.parse(b.current_period_end) > now.getTime()
    expect((await applyBankedMonths(db, 'alice', NOW, isPaying)).applied).toBe(0)      // still paying
    const afterLapse = new Date(NOW.getTime() + 20 * DAY)
    expect((await applyBankedMonths(db, 'alice', afterLapse, () => false)).applied).toBe(1)
    const alice = db.tables.user_billing.find(b => b.user_id === 'alice')
    expect(alice).toMatchObject({ granted_by: 'referral', referral_months_banked: 0 })
  })
})

describe('abuse guards', () => {
  it('rejects self-referral, duplicates, old accounts and unknown codes', async () => {
    const code = await ensureCode(db, 'alice')
    expect((await claimReferral(db, { referredId: 'alice', rawCode: code, referredCreatedAt: NOW, now: NOW })).reason).toBe('self_referral')
    expect((await claimReferral(db, { referredId: 'carl', rawCode: 'ZZZZZZ', referredCreatedAt: NOW, now: NOW })).reason).toBe('unknown_code')
    const old = new Date(NOW.getTime() - 15 * DAY)
    expect((await claimReferral(db, { referredId: 'dana', rawCode: code, referredCreatedAt: old, now: NOW })).reason).toBe('too_late')
    expect((await claimReferral(db, { referredId: 'bob', rawCode: code, referredCreatedAt: NOW, now: NOW })).ok).toBe(true)
    expect((await claimReferral(db, { referredId: 'bob', rawCode: code, referredCreatedAt: NOW, now: NOW })).reason).toBe('already_referred')
  })

  it('rejects a student who already pays', async () => {
    const code = await ensureCode(db, 'alice')
    db.tables.user_billing.push({ user_id: 'erin', plan: 'pro', status: 'active', stripe_subscription_id: 'sub_9' })
    expect((await claimReferral(db, { referredId: 'erin', rawCode: code, referredCreatedAt: NOW, now: NOW })).reason).toBe('already_subscribed')
  })

  it('a friend who never pays earns nothing', async () => {
    const code = await ensureCode(db, 'alice')
    await claimReferral(db, { referredId: 'bob', rawCode: code, referredCreatedAt: NOW, now: NOW })
    expect(await referralStats(db, 'alice')).toMatchObject({ invited: 1, joined: 0, monthsEarned: 0 })
    expect(db.tables.user_billing.find(b => b.user_id === 'alice')).toBeUndefined()
  })

  it('normalises codes', () => {
    expect(normalizeCode(' ab-c 9 ')).toBe('AB-C9')
  })
})
