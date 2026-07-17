/**
 * Server-side AI usage enforcement.
 *
 * Call verifyAndCheckAiUsage(req) at the top of any AI endpoint. It will:
 *   1. Verify the Bearer token against Supabase.
 *   2. Read the user's subscription from user_data (service role).
 *   3. Apply a per-user cooldown (anti-spam rate limit).
 *   4. Reject with 402 if the user is over their plan's monthly study-boost cap.
 *   5. Atomically increment the usage counter.
 *
 * On failure: { ok: false, status, error } — caller should early-return.
 * On success: { ok: true, userId, plan, usage: { used, limit } }.
 *
 * This is the single source of truth for plan enforcement. The client-side
 * subscription.js functions are UX hints only and must never be trusted.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { checkAiRateLimit } from './rateLimit.js'
import { log } from './axiom.js'

const _resend = new Resend(process.env.RESEND_API_KEY)

async function sendBoostNudgeEmail(userId) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const supabase = getAdminClient()
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) return
    await _resend.emails.send({
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
              ['100 AI sessions / month', 'Free gives you 5 total'],
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
 * Full pipeline: verify auth, rate-limit, check quota, increment.
 * Use on endpoints that consume an AI study boost.
 */
export async function verifyAndCheckAiUsage(req) {
  const { userId, emailConfirmed } = await verifyBearer(req)
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

  if (limit !== Infinity && used >= limit) {
    log('ai.gate.quota_exceeded', { userId, plan, used, limit })
    return {
      ok: false, status: 402,
      error: `You've used all ${limit} study boosts on the ${plan} plan this month. Upgrade for more.`,
      plan, usage: { used, limit },
    }
  }

  const updatedSub = {
    ...sub,
    plan: sub.plan ?? plan,
    status: sub.status ?? 'active',
    aiQueriesUsed: used + 1,
    aiQueriesResetAt: newMonth
      ? new Date().toISOString()
      : (sub.aiQueriesResetAt ?? new Date().toISOString()),
    lastAiCallAt: new Date().toISOString(),
  }

  const { error: writeErr } = await supabase
    .from('user_data')
    .upsert(
      { user_id: userId, subscription: updatedSub, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (writeErr) {
    console.error('[usage] write error', writeErr)
    // Fail closed — if we can't record usage we shouldn't let the call through
    return { ok: false, status: 500, error: 'Usage write failed' }
  }

  // Fire boost nudge email when free user hits 4/5 — fire-and-forget
  if (plan === 'free' && used + 1 === 4) {
    sendBoostNudgeEmail(userId).catch(() => {})
  }

  log('ai.gate.pass', { userId, plan, used: used + 1, limit: limit === Infinity ? null : limit })

  return {
    ok: true,
    userId,
    plan,
    usage: { used: used + 1, limit: limit === Infinity ? null : limit },
  }
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
