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
      subject: "You have 2 AI study boosts left this month",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <div style="display:inline-block;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:#fbbf24;letter-spacing:0.3px;">
            ⚡ 2 BOOSTS REMAINING
          </div>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Running low on AI study boosts.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            You've used 8 of your 10 free AI boosts this month. When they're gone,
            you'll need to wait until next month — or upgrade to Pro for
            <strong style="color:#c7d2fe;">75 boosts/month</strong>.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Pro also unlocks:
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['5 courses', 'Free gives you 1'],
              ['AI Study Coach', 'Personalized daily study plans'],
              ['Session Blueprints', 'Minute-by-minute session plans'],
              ['Flashcards & quizzes', 'Built into every session'],
            ].map(([feat, sub]) => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <span style="font-size:13px;color:#475569;margin-left:8px;">— ${sub}</span>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <tr><td style="padding-bottom:8px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Start 7-day free trial →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Card charged after trial · Cancel before day 7, pay nothing</span>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you have a StudyEdge AI account.<br/>
            <a href="https://getstudyedge.com/app" style="color:#475569;">Open the app</a> ·
            <a href="mailto:support@getstudyedge.com" style="color:#475569;">Contact support</a>
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
  free:      10,
  pro:       30,
  unlimited: Infinity,
}

const MIN_INTERVAL_MS = 2000 // per-user cooldown between AI calls

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
  const limit = PLAN_AI_LIMITS[plan] ?? PLAN_AI_LIMITS.free

  const now = Date.now()
  const lastCallAt = sub.lastAiCallAt ? new Date(sub.lastAiCallAt).getTime() : 0
  if (now - lastCallAt < MIN_INTERVAL_MS) {
    return {
      ok: false, status: 429,
      error: 'Slow down — wait a moment before making another AI request.',
    }
  }

  const newMonth = isNewMonth(sub.aiQueriesResetAt)
  const used = newMonth ? 0 : (sub.aiQueriesUsed ?? 0)

  if (limit !== Infinity && used >= limit) {
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

  // Fire boost nudge email when free user hits 8/10 — fire-and-forget
  if (plan === 'free' && used + 1 === 8) {
    sendBoostNudgeEmail(userId).catch(() => {})
  }

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
