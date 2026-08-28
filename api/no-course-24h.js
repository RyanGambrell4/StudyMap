import { createClient } from '@supabase/supabase-js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { isEnabled } from '../lib/server/featureFlags.js'
import { enqueueEmail } from '../lib/server/emailQueue.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Only runs when lifecycle_v2 is on — this trigger has no legacy send path
  if (!(await isEnabled('lifecycle_v2'))) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'lifecycle_v2_off' })
  }

  const locked = await acquireCronLock('no-course-24h')
  if (!locked) {
    console.log('[no-course-24h] Already ran recently - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran' })
  }

  // Target users who signed up 23-25h ago
  const now = new Date()
  const windowStart = new Date(now - 25 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 23 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })

  let queued = 0, skipped = 0

  for (const r of rows ?? []) {
    if (!r.email) { skipped++; continue }

    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('plan, completed_sessions, subscription')
      .eq('user_id', r.user_id)
      .maybeSingle()

    // Skip if no user_data (never completed onboarding) or already has courses
    if (!row) { skipped++; continue }
    const courseCount = Array.isArray(row?.plan?.courses) ? row.plan.courses.length : 0
    if (courseCount > 0) { skipped++; continue }

    // Skip paid/trialing users
    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row?.subscription ?? {}
    if (activeStatuses.includes(sub.status)) { skipped++; continue }

    await enqueueEmail(r.user_id, 'no-course-24h', 5, { email: r.email })
    queued++
  }

  console.log(`[no-course-24h] Queued ${queued}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, queued, skipped })
}
