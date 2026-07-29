import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export const config = { maxDuration: 10 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { courseName, topic, courseId } = req.body
  if (!courseName || !topic) return res.status(400).json({ error: 'courseName and topic required' })

  // courseId is optional. The client resolves the stable plan.courses[].id
  // when it has one and passes it through. We store it verbatim and let
  // courseContext.js validate on read. Not re-resolved server-side: that
  // would require a plan lookup on every write and duplicate work the
  // client already did.
  const stableCourseId = typeof courseId === 'string' && courseId ? courseId.slice(0, 120) : null

  const row = {
    user_id: userId,
    course_name: courseName.slice(0, 120),
    topic: topic.slice(0, 120),
    flagged_at: new Date().toISOString(),
  }
  if (stableCourseId) row.course_id = stableCourseId

  const { error } = await supabaseAdmin
    .from('struggle_topics')
    .upsert(row, { onConflict: 'user_id,course_name,topic' })

  if (error) {
    console.error('[log-struggle] DB error:', error)
    return res.status(500).json({ error: 'Failed to log struggle' })
  }

  return res.status(200).json({ ok: true })
}
