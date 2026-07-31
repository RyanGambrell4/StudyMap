/**
 * email_queue helpers. Used by behavioral crons and client-triggered routes
 * when lifecycle_v2 feature flag is ON. The dispatcher cron reads from this
 * table and is the only process that calls Resend when v2 is active.
 *
 * Priority map (lower = higher priority):
 *   1 = checkout-recovery
 *   2 = paywall-hit
 *   3 = first-session
 *   4 = no-first-session
 *   5 = no-course-24h, streak-broken
 *   6 = re-engage, day14-upgrade, day21-upgrade
 *   7 = welcome, onboarding-complete, first-plan
 */
import { supabaseAdmin } from './supabaseAdmin.js'
/**
 * Write one eligibility record to the queue. Ignores duplicate if the same
 * user already has a pending (unsent) entry for the same campaign.
 * context: { email, trigger_check?, [campaignSpecificData] }
 */
export async function enqueueEmail(userId, campaign, priority, context = {}) {
  if (!userId || !campaign) return
  const { error } = await supabaseAdmin
    .from('email_queue')
    .upsert(
      { user_id: userId, campaign, priority, eligible_at: new Date().toISOString(), context },
      { onConflict: 'user_id,campaign', ignoreDuplicates: true }
    )
  if (error) console.error('[emailQueue] enqueue failed:', error.message)
}

/**
 * Fetch one highest-priority pending entry per user, up to limit users.
 * Returns rows sorted by priority ASC (1 = most urgent), then eligible_at ASC.
 */
export async function fetchPendingEntries(limit = 100) {
  const { data, error } = await supabaseAdmin
    .from('email_queue')
    .select('id, user_id, campaign, priority, eligible_at, context')
    .is('sent_at', null)
    .is('suppressed_at', null)
    .lte('eligible_at', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('eligible_at', { ascending: true })
    .limit(limit * 5)

  if (error) { console.error('[emailQueue] fetchPending failed:', error.message); return [] }
  if (!data?.length) return []

  // One entry per user — pick highest priority (already sorted)
  const seen = new Set()
  return (data ?? []).filter(row => {
    if (seen.has(row.user_id)) return false
    seen.add(row.user_id)
    return true
  }).slice(0, limit)
}

export async function markSent(id) {
  const { error } = await supabaseAdmin
    .from('email_queue')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[emailQueue] markSent failed:', error.message)
}

export async function markSuppressed(id, reason) {
  const { error } = await supabaseAdmin
    .from('email_queue')
    .update({ suppressed_at: new Date().toISOString(), skip_reason: reason })
    .eq('id', id)
  if (error) console.error('[emailQueue] markSuppressed failed:', error.message)
}
