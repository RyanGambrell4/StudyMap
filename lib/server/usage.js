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
  if (!token) return null

  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.id ?? null
}

/**
 * Full pipeline: verify auth, rate-limit, check quota, increment.
 * Use on endpoints that consume an AI study boost.
 */
export async function verifyAndCheckAiUsage(req) {
  const userId = await verifyBearer(req)
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' }

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
export async function verifyAuth(req) {
  const userId = await verifyBearer(req)
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, userId }
}
