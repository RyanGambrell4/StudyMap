import { createClient } from '@supabase/supabase-js'
import { reportQueryError } from './supabaseErrors.js'

/**
 * What to do when the suppression list cannot be read.
 *
 * Default is CLOSED: no read, no send. Sending to an address that has hard
 * bounced or filed a complaint costs sender reputation, and that damage
 * compounds and is not undone later. A lifecycle email that arrives a day late
 * costs approximately nothing. The two risks are not symmetric, so the default
 * is not symmetric either.
 *
 * This is a deliberate behaviour change. Before it, a missing
 * `email_suppression` table read as "nobody is suppressed" and every send went
 * out. With it, the same missing table stops lifecycle mail until the
 * migration is applied, and it self-heals the moment the table exists.
 *
 * Set EMAIL_SUPPRESSION_FAIL_OPEN=1 to restore the old behaviour without a
 * code change. Do that only if you have decided the reputation risk is
 * acceptable.
 */
const FAIL_OPEN = process.env.EMAIL_SUPPRESSION_FAIL_OPEN === '1'

function suppressionUnavailable(what) {
  if (FAIL_OPEN) {
    console.error(`[emailGuard] ${what} unavailable and EMAIL_SUPPRESSION_FAIL_OPEN=1, sending anyway`)
    return null
  }
  return { ok: false, reason: 'Suppression list unavailable, refusing to send' }
}

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
    const { data: suppressed, error } = await supabaseAdmin
      .from('email_suppression')
      .select('reason')
      .eq('user_id', userId)
      .maybeSingle()
    // A failed read is NOT "not suppressed". Binding `error` is the whole fix:
    // without it a missing table reads as an empty result and the mail goes
    // out, which is what has been happening since 2026-07-27.
    if (reportQueryError(error, { table: 'email_suppression', context: 'canSendUserEmail(by user_id)' })) {
      const blocked = suppressionUnavailable('suppression list')
      if (blocked) return blocked
    }
    if (suppressed) return { ok: false, reason: `Suppressed (${suppressed.reason})` }
  } catch (err) {
    // Fail CLOSED. We cannot prove this address is safe to mail, and the cost
    // of a wrong send (sender reputation) is not symmetric with the cost of a
    // skipped send (one delayed lifecycle email).
    console.error('[emailGuard] suppression check threw, failing closed:', err?.message ?? err)
    const blocked = suppressionUnavailable('suppression check')
    if (blocked) return blocked
  }

  // Hard block by email address: catches bounces that arrived without a userId
  // (e.g. webhook fired before the user_id was resolved and stored).
  if (email) {
    try {
      const { data: suppressedByEmail, error } = await supabaseAdmin
        .from('email_suppression')
        .select('reason')
        .eq('email', email)
        .maybeSingle()
      if (reportQueryError(error, { table: 'email_suppression', context: 'canSendUserEmail(by email)' })) {
        const blocked = suppressionUnavailable('suppression list')
        if (blocked) return blocked
      }
      if (suppressedByEmail) return { ok: false, reason: `Suppressed (${suppressedByEmail.reason})` }
    } catch (err) {
      console.error('[emailGuard] email suppression check threw, failing closed:', err?.message ?? err)
      const blocked = suppressionUnavailable('suppression check')
      if (blocked) return blocked
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
