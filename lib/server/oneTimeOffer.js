/**
 * One-time offer generation. When a trial is cancelled, we create a Stripe
 * coupon + promotion code that gives 80% off the first payment, valid for
 * 24 hours, redeemable exactly once. The code is embedded in the follow-up
 * email so the user has to act inside a short window.
 *
 * Kept in a helper (not inlined in stripe.js) so it can be called from both
 * the cancel-trial path (immediate offer) and any future recovery flows.
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const OFFER_DISCOUNT_PCT = 50          // 50% off first invoice
const OFFER_TTL_HOURS    = 24
const OFFER_CODE_PREFIX  = 'COMEBACK'

/**
 * Generate a random 6-char alphanumeric code. Ambiguous chars removed so
 * the code reads cleanly in an email.
 */
function generateSuffix() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

/**
 * Create a one-time-use Stripe coupon and promotion code, persist the pair
 * in `one_time_offers`, and return the human-readable code + metadata.
 *
 * Returns null on any failure so the caller can send the email without the
 * offer (better than failing the whole cancellation flow).
 */
export async function createTrialCancelOffer({ userId }) {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!userId) return null

  const code = `${OFFER_CODE_PREFIX}${generateSuffix()}`
  const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 3600 * 1000)

  try {
    // Coupon: percent-off applied to the first invoice only. `duration: 'once'`
    // means Stripe applies it to the first billing cycle, not recurring.
    const coupon = await stripe.coupons.create({
      percent_off: OFFER_DISCOUNT_PCT,
      duration: 'once',
      name: 'StudyEdge comeback offer',
      redeem_by: Math.floor(expiresAt.getTime() / 1000),
      metadata: { user_id: userId, reason: 'trial_cancel' },
    })

    // Promotion code is what the user types into checkout. Bound to the
    // coupon and single-use (max_redemptions: 1).
    await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      max_redemptions: 1,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      metadata: { user_id: userId, reason: 'trial_cancel' },
    })

    // Persist so we can (a) audit later and (b) prevent multiple offer
    // emails from stacking coupons for the same user.
    await supabaseAdmin.from('one_time_offers').insert({
      code,
      user_id: userId,
      stripe_coupon: coupon.id,
      discount_pct: OFFER_DISCOUNT_PCT,
      reason: 'trial_cancel',
      expires_at: expiresAt.toISOString(),
    })

    return { code, discountPct: OFFER_DISCOUNT_PCT, expiresAt }
  } catch (err) {
    console.error('[oneTimeOffer] create failed:', err?.message ?? err)
    return null
  }
}

/**
 * Guard: has this user already been issued a trial-cancel offer? Prevents
 * a repeat trial → cancel → new coupon loop.
 */
export async function userHasExistingOffer(userId) {
  if (!userId) return false
  try {
    const { data } = await supabaseAdmin
      .from('one_time_offers')
      .select('code')
      .eq('user_id', userId)
      .eq('reason', 'trial_cancel')
      .maybeSingle()
    return !!data
  } catch (err) {
    console.error('[oneTimeOffer] guard check failed:', err?.message ?? err)
    return false
  }
}
