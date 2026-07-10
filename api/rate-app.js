/**
 * POST /api/rate-app
 *
 * Records the user's star rating (1-5) for StudyEdge and stashes context
 * (route, timestamp). The client-side flow decides what to do next based
 * on the rating value:
 *   4-5 stars → send them to the public review URL (App Store, etc.)
 *   1-3 stars → open the in-app feedback modal (private channel)
 * That branching happens client-side; this endpoint just records.
 *
 * Persisting the rating means we can (a) not re-prompt the same user
 * over and over, and (b) later analyze rating distribution and correlate
 * with retention / conversion.
 */

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const stars = Number(body?.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'stars must be an integer 1-5' })
  }
  const source = typeof body?.source === 'string' ? body.source.slice(0, 60) : null

  const { data: row } = await supabaseAdmin
    .from('user_data')
    .select('subscription')
    .eq('user_id', auth.userId)
    .maybeSingle()

  const sub = row?.subscription ?? {}
  const updatedSub = {
    ...sub,
    appRatingStars: stars,
    appRatingAt:    new Date().toISOString(),
    appRatingSource: source,
  }

  const { error: writeErr } = await supabaseAdmin
    .from('user_data')
    .upsert(
      { user_id: auth.userId, subscription: updatedSub, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (writeErr) {
    console.error('[rate-app] write error:', writeErr)
    return res.status(500).json({ error: 'Failed to record rating' })
  }

  return res.status(200).json({ ok: true, stars })
}
