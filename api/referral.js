// GET  /api/referral        -> { code, link, invited, joined, monthsEarned, monthsBanked, referredBy, canClaim }
// POST /api/referral {code} -> claims a friend's code for the signed-in student
//
// See lib/server/referrals.js for the rules and the reward mechanics.
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyAuth } from '../lib/server/usage.js'
import { one, ensureCode, claimReferral, referralStats, referralLink, applyBankedMonths, CLAIM_WINDOW_DAYS } from '../lib/server/referrals.js'
import { resolveEnforcedPlan } from '../lib/server/appleSubscription.js'

export const config = { maxDuration: 15 }

const DAY_MS = 86_400_000

function admin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

/** Paying right now, not on a granted month. */
export function isPayingNow(b, now = new Date()) {
  if (!b || b.granted_by) return false
  const plan = resolveEnforcedPlan({
    status: b.status, plan: b.plan, appleOriginalTransactionId: b.apple_original_transaction_id,
    stripeSubId: b.stripe_subscription_id, currentPeriodEnd: b.current_period_end,
  }, now.getTime())
  return plan !== 'free'
}

export default async function handler(req, res) {
  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized' })
  const db = admin()
  const userId = auth.userId

  if (req.method === 'GET') {
    try {
      await applyBankedMonths(db, userId, new Date(), isPayingNow)
      const code = await ensureCode(db, userId)
      const stats = await referralStats(db, userId)
      const mine = await one(db.from('referrals').select('status').eq('referred_id', userId).maybeSingle())
      const user = await one(db.auth.admin.getUserById(userId))
      const createdAt = user?.user?.created_at ? Date.parse(user.user.created_at) : Date.now()
      const canClaim = !mine && Date.now() - createdAt <= CLAIM_WINDOW_DAYS * DAY_MS
      return res.status(200).json({ code, link: referralLink(code), ...stats, referredBy: !!mine, canClaim })
    } catch (e) {
      console.error('[referral GET]', e)
      return res.status(500).json({ error: 'Something went wrong on our side. Try again in a minute.' })
    }
  }

  if (req.method === 'POST') {
    const code = req.body?.code
    const user = await one(db.auth.admin.getUserById(userId))
    const result = await claimReferral(db, {
      referredId: userId, rawCode: code, referredCreatedAt: user?.user?.created_at,
    })
    if (!result.ok) return res.status(400).json({ error: result.message, code: result.reason })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Notifications (used by the Stripe and Apple paid hooks) ─────────────────

export async function notifyReward({ referrerId, referredId, reward }) {
  const { renderEmail } = await import('../lib/server/emailTemplate.js')
  const { canSendUserEmail, recordUserEmail } = await import('../lib/server/emailGuard.js')
  const { listUnsubscribeHeaders } = await import('../lib/server/emailHelpers.js')
  const db = admin()
  const resend = new Resend(process.env.RESEND_API_KEY)

  const what = reward?.kind === 'stripe_credit'
    ? 'A credit for one month has been added to your account. It comes off your next bill.'
    : reward?.kind === 'banked_month'
      ? "You pay through Apple, so the month is saved for you. If your App Store subscription ever ends, it starts automatically."
      : 'You have 30 days of Pro, starting now.'

  const send = async (userId, subject, headline, paragraphs) => {
    const u = await one(db.auth.admin.getUserById(userId))
    const email = u?.user?.email
    if (!email) return
    const gate = await canSendUserEmail(userId, { priority: 'normal', email })
    if (!gate.ok) return
    await resend.emails.send({
      from: 'StudyEdge AI <ryan@getstudyedge.com>',
      to: email,
      subject,
      headers: listUnsubscribeHeaders(email),
      html: renderEmail({
        preheaderText: headline,
        headline,
        paragraphs,
        cta: { label: 'Open StudyEdge AI', url: 'https://getstudyedge.com/app' },
        unsubscribeUrl: `https://getstudyedge.com/unsubscribe?uid=${userId}`,
      }),
    })
    await recordUserEmail(userId)
  }

  await send(referrerId, 'You earned a free month of Pro', 'You earned a free month of Pro',
    ['A friend you invited just subscribed to StudyEdge AI.', what, 'Keep sharing your code: every friend who subscribes earns you another month.'])
  await send(referredId, 'Your friend got a free month', 'Thanks for joining with a friend\'s code',
    ['Because you subscribed, the friend who invited you just earned a free month of Pro.'])
}
