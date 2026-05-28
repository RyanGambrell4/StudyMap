// Flag a topic the student is struggling with from the AI tutor.
// Mirrors the sms-opt-in.js pattern: Bearer auth + Supabase upsert.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  // Verify user
  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  })
  const userData = await userRes.json()
  if (!userData?.id) return res.status(401).json({ error: 'Unauthorized' })

  const { courseName, topic } = req.body ?? {}

  if (!courseName || typeof courseName !== 'string' || !courseName.trim()) {
    return res.status(400).json({ error: 'courseName is required' })
  }
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic is required' })
  }
  if (topic.length >= 200) {
    return res.status(400).json({ error: 'topic must be shorter than 200 characters' })
  }

  const { error } = await supabase.from('struggle_topics').upsert({
    user_id: userData.id,
    course_name: courseName.trim(),
    topic: topic.trim(),
    flagged_at: new Date().toISOString(),
  }, { onConflict: 'user_id,course_name,topic' })

  if (error) {
    console.error('[flag-struggle] supabase error:', error)
    return res.status(500).json({ error: 'Failed to save struggle topic' })
  }

  return res.status(200).json({ ok: true })
}
