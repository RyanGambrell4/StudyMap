import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

/**
 * Send-frequency guard. Reads `user_data.last_emailed_at` and throttles based on
 * priority. Apply BEFORE every transactional / cron email send, then call
 * recordUserEmail() after a successful send.
 *
 * Goal: keep most users under ~3 emails/week so the domain stays healthy on Gmail,
 * Outlook, and Apple Mail. Exam-day reminders are exempt (critical).
 *
 * Priorities:
 *   - 'critical' → no throttle (exam tomorrow, password reset, email confirmation)
 *   - 'normal'   → at least 48h since last email (everything else)
 *   - 'low'      → at least 5 days since last email (re-engagement, streak-broken)
 *
 * Fails open: if the DB read fails we assume "ok to send" so a transient outage
 * never silently kills our entire pipeline.
 */
const PRIORITY_GAP_HOURS = {
  critical: 0,
  normal: 48,
  low: 120,
}

export async function canSendUserEmail(userId, { priority = 'normal', email = null } = {}) {
  if (!userId) return { ok: true }

  try {
    // Hard block by user_id: bounced or complained users never receive another lifecycle email.
    const { data: suppressed } = await supabaseAdmin
      .from('email_suppression')
      .select('reason')
      .eq('user_id', userId)
      .maybeSingle()
    if (suppressed) return { ok: false, reason: `Suppressed (${suppressed.reason})` }
  } catch (err) {
    console.error('[emailGuard] suppression check failed, failing open:', err?.message ?? err)
  }

  // Hard block by email address: catches bounces that arrived without a userId
  // (e.g. webhook fired before the user_id was resolved and stored).
  if (email) {
    try {
      const { data: suppressedByEmail } = await supabaseAdmin
        .from('email_suppression')
        .select('reason')
        .eq('email', email)
        .maybeSingle()
      if (suppressedByEmail) return { ok: false, reason: `Suppressed (${suppressedByEmail.reason})` }
    } catch (err) {
      console.error('[emailGuard] email suppression check failed, failing open:', err?.message ?? err)
    }
  }

  const minHours = PRIORITY_GAP_HOURS[priority] ?? 48
  if (minHours <= 0) return { ok: true }

  try {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('last_emailed_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (!row?.last_emailed_at) return { ok: true }
    const hoursSince = (Date.now() - new Date(row.last_emailed_at).getTime()) / 3.6e6
    if (hoursSince < minHours) {
      return { ok: false, reason: `Throttled (priority=${priority}): last email ${hoursSince.toFixed(1)}h ago, need ${minHours}h` }
    }
    return { ok: true }
  } catch (err) {
    console.error('[emailGuard] check failed, failing open:', err?.message ?? err)
    return { ok: true }
  }
}

export async function recordUserEmail(userId) {
  if (!userId) return
  try {
    await supabaseAdmin
      .from('user_data')
      .upsert({ user_id: userId, last_emailed_at: new Date().toISOString() }, { onConflict: 'user_id' })
  } catch (err) {
    console.error('[emailGuard] record failed:', err?.message ?? err)
  }
}
