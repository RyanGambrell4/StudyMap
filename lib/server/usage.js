/**
 * Server-side AI usage enforcement.
 *
 * ── Reserve and commit ──────────────────────────────────────────────────────
 *
 * This used to be one call that checked the quota and wrote the increment in
 * the same breath, placed at the very top of every endpoint, ABOVE input
 * validation. So a request that was going to be rejected with a 400 two lines
 * later still cost the user an AI action. Two users on 19 Aug 2026 spent their
 * entire free allowance inside 60 seconds on requests that never generated
 * anything, and the free tier is small enough that this is the whole account.
 *
 * The shape now is:
 *
 *   1. Validate the request body FIRST. Return 400 before touching usage.
 *   2. const gate = await reserveAiUsage(req)   // checks, does not write
 *      if (!gate.ok) return res.status(gate.status).json({ error: gate.error })
 *   3. Do the work.
 *   4. await gate.commit()                      // success path only
 *
 * A reservation that is never committed costs the user nothing, because
 * nothing was written. There is no refund to forget on a throw, which is the
 * failure mode that made increment-and-refund the wrong pattern here.
 *
 * The trade is that two genuinely simultaneous requests can both pass a check
 * for the last remaining action. The Redis sliding-window limiter already
 * serialises bursts from one user, and the residual over-grant is at most one
 * action and lands in the user's favour. Over-charging for failed work does
 * not.
 *
 * verifyAndCheckAiUsage(req) is kept as reserve-then-commit-immediately so
 * that any endpoint not yet converted behaves exactly as it did before. Use
 * reserveAiUsage for anything new.
 *
 * On failure: { ok: false, status, error } — caller should early-return.
 * On success: { ok: true, userId, plan, usage: { used, limit }, commit() }.
 *
 * This is the single source of truth for plan enforcement. The client-side
 * subscription.js functions are UX hints only and must never be trusted.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { checkAiRateLimit } from './rateLimit.js'
import { log } from './axiom.js'

// Constructed on first use, not at import.
//
// `new Resend(undefined)` throws "Missing API key", and this module is imported
// by every AI endpoint. Building it eagerly meant that the moment
// RESEND_API_KEY was absent or misspelled, the entire AI surface failed at cold
// start with a 500 and no route ever ran — over a nudge email that
// sendBoostNudgeEmail already declines to send when the key is missing. The
// eager construction bought nothing and coupled AI availability to email
// config. It also made usage.js unimportable in any test or script without a
// Resend key, which is why the quota accounting had to be verified through
// mocks rather than against a real database.
let _resendClient = null
function getResend() {
  if (!_resendClient) _resendClient = new Resend(process.env.RESEND_API_KEY)
  return _resendClient
}

async function sendBoostNudgeEmail(userId) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const supabase = getAdminClient()
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) return
    await getResend().emails.send({
      from: 'StudyEdge AI <support@getstudyedge.com>',
      to: email,
      subject: "1 free AI session left on StudyEdge",
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
        <tr><td style="padding-bottom:20px;text-align:center;">
          <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
        </td></tr>
        <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">

          <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#D97706;text-transform:uppercase;">1 session left</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You've used 4 of your 5 free AI sessions.</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
            After your last session, the AI features lock until you upgrade. Pro gives you 100 AI sessions per month and unlocks everything.
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            ${[
              ['100 AI sessions / month', 'Free gives you 5 a month'],
              ['5 courses', 'Free gives you 1'],
              ['AI Study Coach', 'Personalized multi-week plans'],
              ['Session Blueprints', 'Know exactly what to study each session'],
            ].map(([feat, sub], i, arr) => `
            <tr>
              <td style="padding:10px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
                <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
                <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${sub}</div>
              </td>
            </tr>`).join('')}
          </table>

          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td align="center" style="padding-bottom:6px;">
              <a href="https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=nudge&utm_campaign=ai_limit"
                 style="display:inline-block;background:#3B61C4;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;">
                Start 7-day free trial →
              </a>
            </td></tr>
            <tr><td align="center">
              <span style="font-size:12px;color:#9B9B9B;">Card required · Cancel before day 8 and pay nothing</span>
            </td></tr>
          </table>

        </td></tr>
        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
            You're receiving this because you have a StudyEdge AI account.
            <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(`[usage] Boost nudge email sent to ${email}`)
  } catch (err) {
    console.error('[usage] Failed to send boost nudge email:', err)
  }
}

export const PLAN_AI_LIMITS = {
  free:      5,
  pro:       100,
  unlimited: Infinity,
}


let _client = null
function getAdminClient() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )
  }
  return _client
}

function isNewMonth(iso) {
  if (!iso) return true
  const now = new Date()
  const then = new Date(iso)
  return now.getMonth() !== then.getMonth() || now.getFullYear() !== then.getFullYear()
}

async function verifyBearer(req) {
  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { userId: null, emailConfirmed: false }

  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!res.ok) return { userId: null, emailConfirmed: false }
  const data = await res.json()
  // Supabase returns email_confirmed_at as ISO string when the user has clicked
  // the verification link, null otherwise. Also accept confirmed_at for older
  // sessions and users authenticated via OAuth (email is implicitly verified).
  const emailConfirmed = !!(data?.email_confirmed_at || data?.confirmed_at)
  return { userId: data?.id ?? null, emailConfirmed }
}

/**
 * Reserve AI actions.
 *
 * Verifies auth, applies the rate limit, and checks the quota. It does NOT
 * write anything. Call gate.commit() once the work has actually succeeded.
 *
 * A reservation that is never committed is free: the user is not charged for
 * work that did not happen.
 *
 * `cost` is how many of the plan's monthly actions one request consumes. It
 * defaults to 1, which is exactly what every endpoint did before this
 * parameter existed, so every existing call site is unchanged. Raise it only
 * where the marginal spend is genuinely a multiple of a normal generation —
 * api/generate-podcast.js is the only endpoint that does, and it carries the
 * arithmetic for why.
 */
export async function reserveAiUsage(req, { verified, cost = 1 } = {}) {
  if (!Number.isInteger(cost) || cost < 1) {
    throw new TypeError(`reserveAiUsage: cost must be a positive integer, got ${cost}`)
  }
  // Endpoints that must resolve a courseId before reserving already had to
  // authenticate to do it (resolveCourseId is scoped to the user). Passing that
  // result back in here avoids a second round-trip to Supabase for the same
  // token. `verified` must be the { ok, userId } from a successful verifyAuth,
  // which has already enforced email confirmation.
  const { userId, emailConfirmed } = verified?.ok
    ? { userId: verified.userId, emailConfirmed: true }
    : await verifyBearer(req)

  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' }
  if (!emailConfirmed) {
    return {
      ok: false, status: 403,
      error: 'Please verify your email before using AI features. Check your inbox for the confirmation link.',
    }
  }

  const supabase = getAdminClient()
  const { data: row, error: readErr } = await supabase
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  if (readErr) {
    console.error('[usage] read error', readErr)
    return { ok: false, status: 500, error: 'Usage check failed' }
  }

  const sub = row?.subscription ?? {}
  const activeStatuses = ['active', 'trialing', 'past_due']
  const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
  const baseLimit = PLAN_AI_LIMITS[plan] ?? PLAN_AI_LIMITS.free
  // Bonus AI actions granted outside the normal plan (e.g. paywall-exit gift).
  // Only meaningful for finite plan limits — Unlimited is Infinity anyway.
  const bonus = plan === 'free' ? (Number(sub.bonusAiActions) || 0) : 0
  const limit = baseLimit === Infinity ? Infinity : baseLimit + bonus

  // Redis sliding window rate limit (replaces 2s cooldown)
  const rlResult = await checkAiRateLimit(userId, plan)
  if (!rlResult.allowed) {
    log('ai.gate.ratelimit', { userId, error: rlResult.error })
    return { ok: false, status: 429, error: rlResult.error }
  }

  const newMonth = isNewMonth(sub.aiQueriesResetAt)
  const used = newMonth ? 0 : (sub.aiQueriesUsed ?? 0)

  const remaining = limit === Infinity ? Infinity : limit - used
  if (remaining < cost) {
    log('ai.gate.quota_exceeded', { userId, plan, used, limit, cost })
    // Two different situations. Telling someone they have none left when they
    // have two left and asked for something that costs three reads as a bug,
    // and it hides the one fact that would make them upgrade.
    const error = remaining <= 0
      ? `You've used all ${limit} study boosts on the ${plan} plan this month. Upgrade for more.`
      : `This uses ${cost} study boosts and you have ${remaining} left this month on the ${plan} plan. Upgrade for more.`
    return { ok: false, status: 402, error, plan, usage: { used, limit }, cost }
  }

  log('ai.gate.reserved', { userId, plan, used, limit: limit === Infinity ? null : limit, cost })

  let committed = false
  const gate = {
    ok: true,
    userId,
    plan,
    cost,
    usage: { used: used + cost, limit: limit === Infinity ? null : limit },
    /**
     * Write the increment. Idempotent within a request: calling it twice
     * charges once. Returns { ok } so a caller can react to a write failure,
     * though by this point the work is already done and the user has their
     * result, so a failed commit is logged rather than surfaced.
     */
    async commit() {
      if (committed) return { ok: true, alreadyCommitted: true }
      committed = true
      return commitReservation({ supabase, userId, sub, plan, used, newMonth, cost })
    },
    get committed() { return committed },
  }
  return gate
}

async function commitReservation({ supabase, userId, sub, plan, used, newMonth, cost = 1 }) {
  const updatedSub = {
    ...sub,
    plan: sub.plan ?? plan,
    status: sub.status ?? 'active',
    aiQueriesUsed: used + cost,
    aiQueriesResetAt: newMonth
      ? new Date().toISOString()
      : (sub.aiQueriesResetAt ?? new Date().toISOString()),
    lastAiCallAt: new Date().toISOString(),
    // Stamped once, on the first AI action that actually produced something.
    // The client reads this to decide whether a card ask is allowed yet.
    firstGenerationAt: sub.firstGenerationAt ?? new Date().toISOString(),
  }

  const { error: writeErr } = await supabase
    .from('user_data')
    .upsert(
      { user_id: userId, subscription: updatedSub, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (writeErr) {
    // The user already has their generation at this point, so failing the
    // request now would be charging them nothing and giving them nothing.
    // Log it and let the response through.
    console.error('[usage] commit write error', writeErr)
    log('ai.gate.commit_failed', { userId, plan, error: writeErr.message })
    return { ok: false, error: 'Usage write failed' }
  }

  // Fire boost nudge email when a free user crosses 4/5 — fire-and-forget.
  // A crossing test rather than an equality: a multi-cost action steps straight
  // over 4, and `=== 4` would skip the nudge for exactly the users who are
  // about to run out.
  if (plan === 'free' && used < 4 && used + cost >= 4) {
    sendBoostNudgeEmail(userId).catch(() => {})
  }

  log('ai.gate.commit', { userId, plan, used: used + cost, cost })
  return { ok: true }
}

/**
 * Reserve and commit in one call.
 *
 * Preserves the original all-in-one behaviour for endpoints that have not been
 * converted to reserve/commit. New code should use reserveAiUsage so a failed
 * request costs the user nothing.
 */
export async function verifyAndCheckAiUsage(req) {
  const gate = await reserveAiUsage(req)
  if (!gate.ok) return gate
  const written = await gate.commit()
  if (!written.ok) {
    // Fail closed — if we cannot record usage we should not let the call through.
    return { ok: false, status: 500, error: 'Usage write failed' }
  }
  return gate
}

/**
 * Auth-only variant for endpoints that don't consume a study boost
 * (e.g. calendar reads, webhooks, lightweight parses).
 */
export async function verifyAuth(req, { requireEmailConfirmed = true } = {}) {
  const { userId, emailConfirmed } = await verifyBearer(req)
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' }
  if (requireEmailConfirmed && !emailConfirmed) {
    return {
      ok: false, status: 403,
      error: 'Please verify your email before using this feature. Check your inbox for the confirmation link.',
    }
  }
  return { ok: true, userId }
}
