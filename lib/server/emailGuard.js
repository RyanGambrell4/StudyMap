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
 * SUPPRESSION FAILS CLOSED. If the suppression list cannot be read we refuse to
 * send, rather than assuming the address is safe.
 *
 * Why this changed: migrations/20260727_email_suppression_and_queue.sql was
 * never applied, so `email_suppression` does not exist in production. These
 * reads destructured only `data` and ignored `error`, and supabase-js returns
 * { data: null, error } rather than throwing, so a missing table read exactly
 * like "this address is not suppressed" and every send went out. Lifecycle mail
 * has therefore been going to hard-bounced and complained addresses since
 * 2026-07-27.
 *
 * The two risks are not symmetric. A lifecycle email that arrives a day late
 * costs nothing. A send to a complained address costs sender reputation, and
 * that damage compounds and is not undone by fixing the code later. So the
 * default is not symmetric either.
 *
 * This is self-healing: the moment the table exists and is readable, sends
 * resume with no further change.
 *
 * TWO DELIBERATE EXCEPTIONS, so this can never lock anyone out of an account:
 *
 *   1. priority 'critical' is allowed through when the list is UNREADABLE.
 *      A known-suppressed address is still blocked at any priority; only the
 *      "we cannot tell" case is waved through.
 *   2. EMAIL_SUPPRESSION_FAIL_OPEN=1 restores the previous behaviour entirely,
 *      without a code change or a redeploy of this file.
 *
 * Note that password reset and email confirmation do not use this guard at all:
 * they are sent by Supabase Auth over its own SMTP. Payment receipts are sent by
 * Stripe. Neither is affected by anything in this file.
 *
 * The frequency throttle below still fails open, unchanged. A transient read
 * failure there should not stop the pipeline.
 */
const PRIORITY_GAP_HOURS = {
  critical: 0,
  normal: 48,
  low: 120,
}

const FAIL_OPEN = process.env.EMAIL_SUPPRESSION_FAIL_OPEN === '1'

/**
 * Decide what to do when the suppression list could not be read.
 * Returns a blocking result, or null to allow the send.
 */
function suppressionUnreadable(error, priority, where) {
  // A missing table is a deployment fault, not a data condition. PostgREST
  // reports it as PGRST205; Postgres as 42P01. Say so loudly either way.
  const code = error?.code ?? ''
  const missing = code === 'PGRST205' || code === '42P01' ||
    /could not find the table|schema cache|does not exist/i.test(error?.message ?? '')

  console.error(
    `[emailGuard] ${where}: suppression list unreadable ` +
    `(${code || 'no code'}: ${error?.message ?? error}). ` +
    (missing ? 'THE TABLE DOES NOT EXIST. Apply the 20260727 migration. ' : '') +
    (FAIL_OPEN ? 'EMAIL_SUPPRESSION_FAIL_OPEN=1, sending anyway.'
               : priority === 'critical' ? 'Priority is critical, sending anyway.'
               : 'Refusing to send.')
  )

  if (FAIL_OPEN) return null
  if (priority === 'critical') return null
  return { ok: false, reason: 'Suppression list unavailable, refusing to send' }
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
    if (error) {
      const blocked = suppressionUnreadable(error, priority, 'by user_id')
      if (blocked) return blocked
    }
    if (suppressed) return { ok: false, reason: `Suppressed (${suppressed.reason})` }
  } catch (err) {
    const blocked = suppressionUnreadable(err, priority, 'by user_id (threw)')
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
      if (error) {
        const blocked = suppressionUnreadable(error, priority, 'by email')
        if (blocked) return blocked
      }
      if (suppressedByEmail) return { ok: false, reason: `Suppressed (${suppressedByEmail.reason})` }
    } catch (err) {
      const blocked = suppressionUnreadable(err, priority, 'by email (threw)')
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
