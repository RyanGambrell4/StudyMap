// Referrals v2: codes, server-recorded referrals, rewards.
//
// A student shares a code (or getstudyedge.com/r/CODE). A friend claims it at
// sign-up. When the friend's first PAID period starts (after any trial
// converts), the referrer earns one month of Pro:
//
//   - referrer pays through Stripe  -> a credit worth one month of their own
//                                       plan, applied to their next invoice
//   - referrer pays through Apple   -> the month is banked. Apple bills them
//                                       and we cannot discount an Apple renewal
//                                       (only an Apple promotional offer the
//                                       student redeems in the purchase sheet
//                                       can). A banked month becomes 30 days of
//                                       granted access when their Apple
//                                       subscription lapses.
//   - referrer is not paying        -> 30 days of Pro granted in user_billing
//                                       (granted_by 'referral', lapses at
//                                       current_period_end; see
//                                       resolveEnforcedPlan)
//
// Every write here is service-role only. referrals.referred_id is UNIQUE, so
// an account can be referred once; the status transition joined -> paid ->
// rewarded is conditional, so a webhook retry never rewards twice.

/** Await a supabase query; a query error throws instead of reading as "no rows". */
export async function one(query) {
  const { data, error } = await query
  if (error) throw new Error(`referrals: ${error.message ?? error.code ?? 'query failed'}`)
  return data
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L
export const CLAIM_WINDOW_DAYS = 14
export const REWARD_DAYS = 30
const DAY_MS = 86_400_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function generateCode(random = Math.random) {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  return s
}

export function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

export function referralLink(code) {
  return `https://getstudyedge.com/r/${code}`
}

/** The student's code, created on first ask. */
export async function ensureCode(db, userId, random = Math.random) {
  const existing = await one(db.from('referral_codes').select('code').eq('user_id', userId).maybeSingle())
  if (existing?.code) return existing.code
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode(random)
    const { error } = await db.from('referral_codes').insert({ user_id: userId, code })
    if (!error) return code
    // Unique clash on code (or a concurrent insert for this user): re-read.
    const again = await one(db.from('referral_codes').select('code').eq('user_id', userId).maybeSingle())
    if (again?.code) return again.code
  }
  throw new Error('referrals: could not allocate a unique code')
}

/**
 * Record that `referredId` signed up with `rawCode`.
 * @returns {{ ok: true, referrerId } | { ok: false, reason, message }}
 */
export async function claimReferral(db, { referredId, rawCode, referredCreatedAt, now = new Date() }) {
  const code = normalizeCode(rawCode)
  if (!code) return fail('invalid_code', "That code doesn't look right. Check it and try again.")

  // Old links carried the referrer's user id; still honoured.
  let referrerId = null
  let source = 'code'
  if (UUID_RE.test(rawCode ?? '')) {
    referrerId = String(rawCode).toLowerCase()
    source = 'legacy_link'
  } else {
    const data = await one(db.from('referral_codes').select('user_id').eq('code', code).maybeSingle())
    referrerId = data?.user_id ?? null
  }
  if (!referrerId) return fail('unknown_code', "We couldn't find that code. Check it with your friend.")
  if (referrerId === referredId) return fail('self_referral', "You can't use your own code.")

  const created = referredCreatedAt ? new Date(referredCreatedAt) : now
  if (now - created > CLAIM_WINDOW_DAYS * DAY_MS) {
    return fail('too_late', `Codes can only be added in your first ${CLAIM_WINDOW_DAYS} days.`)
  }

  const prior = await one(db.from('referrals').select('id').eq('referred_id', referredId).maybeSingle())
  if (prior) return fail('already_referred', "You've already used a friend's code.")

  const billing = await one(db.from('user_billing').select('plan,status,stripe_subscription_id,apple_original_transaction_id,granted_by').eq('user_id', referredId).maybeSingle())
  const paidAlready = billing && billing.status === 'active' && billing.plan && billing.plan !== 'free' && !billing.granted_by
  if (paidAlready) return fail('already_subscribed', 'Codes are for new students who have not subscribed yet.')

  const { error } = await db.from('referrals').insert({
    referrer_id: referrerId, referred_id: referredId, code, source, status: 'joined',
  })
  if (error) {
    if (String(error.code) === '23505') return fail('already_referred', "You've already used a friend's code.")
    return fail('write_failed', 'Something went wrong on our side. Try again in a minute.')
  }
  return { ok: true, referrerId }
}

function fail(reason, message) { return { ok: false, reason, message } }

/**
 * The referred student's first paid period started. Marks the referral paid
 * and rewards the referrer exactly once.
 * @param {object} deps { stripe?, notify? }
 */
export async function recordPaid(db, { referredId, via, now = new Date() }, deps = {}) {
  const ref = await one(db.from('referrals').select('*').eq('referred_id', referredId).maybeSingle())
  if (!ref || ref.status !== 'joined') return { ok: true, skipped: ref ? 'already_' + ref.status : 'not_referred' }

  // Claim the transition first; a concurrent webhook loses here.
  const claimed = await one(db.from('referrals')
    .update({ status: 'paid', paid_at: now.toISOString(), paid_via: via })
    .eq('id', ref.id).eq('status', 'joined').select('id'))
  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) return { ok: true, skipped: 'race_lost' }

  const reward = await rewardReferrer(db, ref.referrer_id, now, deps)
  await db.from('referrals')
    .update({ status: 'rewarded', rewarded_at: now.toISOString(), reward })
    .eq('id', ref.id)

  if (deps.notify) {
    try { await deps.notify({ referrerId: ref.referrer_id, referredId, reward }) } catch { /* email is best effort */ }
  }
  return { ok: true, reward }
}

async function rewardReferrer(db, referrerId, now, deps) {
  const b = await one(db.from('user_billing').select('*').eq('user_id', referrerId).maybeSingle())
  const billing = b ?? {}
  const active = billing.status === 'active' || billing.status === 'trialing'
  const endMs = billing.current_period_end ? Date.parse(billing.current_period_end) : NaN

  // Paying through Stripe: credit one month of their own plan.
  if (billing.stripe_subscription_id && billing.status === 'active' && deps.stripe && billing.stripe_customer_id) {
    try {
      const sub = await deps.stripe.subscriptions.retrieve(billing.stripe_subscription_id)
      const price = sub?.items?.data?.[0]?.price
      const unit = Number(price?.unit_amount) || 0
      const monthly = price?.recurring?.interval === 'year' ? Math.round(unit / 12) : unit
      if (monthly > 0) {
        await deps.stripe.customers.createBalanceTransaction(billing.stripe_customer_id, {
          amount: -monthly,
          currency: price.currency,
          description: 'Referral reward: one month free',
        })
        return { kind: 'stripe_credit', amount: monthly, currency: price.currency }
      }
    } catch (e) {
      console.error('[referrals] stripe credit failed, granting access instead', e?.message)
    }
  }

  // Paying through Apple: bank the month.
  const appleLive = billing.apple_original_transaction_id && !billing.stripe_subscription_id &&
    active && billing.plan !== 'free' && !billing.granted_by && (!Number.isFinite(endMs) || endMs > now.getTime())
  if (appleLive) {
    const banked = (Number(billing.referral_months_banked) || 0) + 1
    await db.from('user_billing').update({ referral_months_banked: banked }).eq('user_id', referrerId)
    return { kind: 'banked_month', banked }
  }

  // Not paying: 30 days of Pro, stacked on any referral time still running.
  return grantDays(db, referrerId, billing, !!b, now)
}

async function grantDays(db, userId, billing, rowExists, now) {
  const runningReferral = billing.granted_by === 'referral' && Date.parse(billing.current_period_end) > now.getTime()
  const from = runningReferral ? Date.parse(billing.current_period_end) : now.getTime()
  const until = new Date(from + REWARD_DAYS * DAY_MS).toISOString()
  const keepPlan = billing.plan === 'unlimited' && billing.granted_by === 'referral' ? 'unlimited' : 'pro'
  const fields = { plan: keepPlan, status: 'active', granted_by: 'referral', granted_at: now.toISOString(), current_period_end: until }
  if (rowExists) await db.from('user_billing').update(fields).eq('user_id', userId)
  else await db.from('user_billing').insert({ user_id: userId, ...fields })
  return { kind: 'access_days', days: REWARD_DAYS, until }
}

/**
 * Turn banked months into access once the student is no longer paying.
 * Called when the app asks for referral status.
 */
export async function applyBankedMonths(db, userId, now = new Date(), isPaying) {
  const b = await one(db.from('user_billing').select('*').eq('user_id', userId).maybeSingle())
  const banked = Number(b?.referral_months_banked) || 0
  if (!b || banked <= 0 || isPaying(b, now)) return { applied: 0 }
  await db.from('user_billing').update({ referral_months_banked: banked - 1 }).eq('user_id', userId)
  const grant = await grantDays(db, userId, b, true, now)
  return { applied: 1, grant }
}

/** Counts for the referrals screen. */
export async function referralStats(db, userId) {
  const rows = (await one(db.from('referrals').select('status,reward').eq('referrer_id', userId))) ?? []
  const b = await one(db.from('user_billing').select('referral_months_banked').eq('user_id', userId).maybeSingle())
  return {
    invited: rows.length,
    joined: rows.filter(r => r.status !== 'joined').length,
    monthsEarned: rows.filter(r => r.status === 'rewarded').length,
    monthsBanked: Number(b?.referral_months_banked) || 0,
  }
}
