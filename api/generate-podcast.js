import { verifyAuth } from '../lib/server/usage.js'
import { createClient } from '@supabase/supabase-js'

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

function weekExpired(resetAt) {
  if (!resetAt) return true
  return Date.now() >= new Date(resetAt).getTime()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  const supabase = getAdminClient()

  const { data: row, error: readErr } = await supabase
    .from('user_data')
    .select('subscription, session_notes, coach_plans')
    .eq('user_id', userId)
    .maybeSingle()

  if (readErr) {
    console.error('[podcast] read error', readErr)
    return res.status(500).json({ error: 'Failed to load user data.' })
  }

  const sub = row?.subscription ?? {}
  const activeStatuses = ['active', 'trialing', 'past_due']
  const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'

  if (plan !== 'unlimited') {
    return res.status(403).json({ error: 'Study podcasts are available on the Unlimited plan only.', upgrade: true })
  }

  // Weekly limit: 1 podcast per 7 days
  const podcastUsage = sub.feature_usage?.podcast ?? { count: 0, resetAt: null }
  const expired = weekExpired(podcastUsage.resetAt)
  const currentCount = expired ? 0 : (podcastUsage.count ?? 0)

  if (currentCount >= 1) {
    return res.status(429).json({
      error: 'You have already generated your podcast for this week. Come back next week for a fresh one.',
      resetAt: podcastUsage.resetAt,
    })
  }

  const { courseId, courseName } = req.body
  if (!courseId) return res.status(400).json({ error: 'courseId is required' })

  // Build content from session notes for this course
  const allNotes = row?.session_notes ?? {}
  const noteEntries = Object.entries(allNotes)
    .filter(([key]) => key.startsWith(`${courseId}_`))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)

  const noteText = noteEntries
    .map(([, note]) => {
      const parts = []
      if (note?.summary) parts.push(`Summary: ${note.summary}`)
      if (note?.main) parts.push(`Notes: ${note.main}`)
      if (note?.concepts) parts.push(`Key concepts: ${note.concepts}`)
      return parts.filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n---\n\n')
    .trim()

  if (!noteText) {
    return res.status(400).json({
      error: 'No study notes found for this course. Add some session notes first, then generate a podcast.',
    })
  }

  // Generate dialogue script with Claude Haiku
  const scriptPrompt = `You are producing an engaging audio study podcast for a college student preparing for an exam.

Course: ${courseName || 'this course'}

Study material from recent sessions:
${noteText.slice(0, 6000)}

Create a 4-5 minute conversational podcast between two hosts: ALEX and JORDAN.
- ALEX explains concepts clearly and enthusiastically
- JORDAN asks smart clarifying questions and makes connections to prior knowledge
- Cover the most important material, use concrete examples, explain why things matter
- End with exactly 3 key takeaways labeled "Key Takeaway 1:", "Key Takeaway 2:", "Key Takeaway 3:"
- Sound natural - avoid reading notes word for word

Format each line EXACTLY like this with no other text or formatting:
[ALEX]: text here
[JORDAN]: text here

Output only the lines. No stage directions, no headers, no extra text. No em dashes.`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: scriptPrompt }],
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error('[podcast] Claude error', errText)
    return res.status(500).json({ error: 'Failed to generate podcast script.' })
  }

  const scriptData = await anthropicRes.json()
  const script = scriptData.content?.[0]?.text ?? ''

  const segments = script
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('[ALEX]:') || l.startsWith('[JORDAN]:'))
    .map(l => {
      if (l.startsWith('[ALEX]:')) return { speaker: 'ALEX', text: l.slice(7).trim() }
      return { speaker: 'JORDAN', text: l.slice(9).trim() }
    })
    .filter(s => s.text.length > 0)

  if (segments.length < 4) {
    return res.status(500).json({ error: 'Failed to generate a valid podcast script. Please try again.' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Audio generation is not configured. Add OPENAI_API_KEY to your Vercel environment variables.' })
  }

  // Generate TTS for all segments in parallel
  const ttsResults = await Promise.allSettled(
    segments.map(seg =>
      fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: seg.text,
          voice: seg.speaker === 'ALEX' ? 'alloy' : 'nova',
          response_format: 'mp3',
        }),
      }).then(r => {
        if (!r.ok) throw new Error(`TTS HTTP ${r.status}`)
        return r.arrayBuffer()
      })
    )
  )

  const failed = ttsResults.filter(r => r.status === 'rejected')
  if (failed.length > segments.length / 2) {
    console.error('[podcast] TTS failures', failed.map(f => f.reason?.message))
    return res.status(500).json({ error: 'Audio generation failed. Please try again.' })
  }

  const audioBuffers = ttsResults
    .filter(r => r.status === 'fulfilled')
    .map(r => Buffer.from(r.value))

  const combined = Buffer.concat(audioBuffers)

  // Upload to Supabase Storage (bucket: study-audio, must be public)
  const fileName = `${userId}/${Date.now()}-${courseId}.mp3`
  const { error: uploadErr } = await supabase.storage
    .from('study-audio')
    .upload(fileName, combined, { contentType: 'audio/mpeg', upsert: false })

  if (uploadErr) {
    console.error('[podcast] Storage upload failed', uploadErr)
    return res.status(500).json({ error: 'Failed to save podcast audio. Ensure the "study-audio" Supabase storage bucket exists and is public.' })
  }

  const { data: { publicUrl } } = supabase.storage.from('study-audio').getPublicUrl(fileName)

  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const podcastEntry = {
    courseId,
    courseName: courseName || 'Unknown Course',
    url: publicUrl,
    createdAt: new Date().toISOString(),
  }

  const updatedSub = {
    ...sub,
    feature_usage: {
      ...(sub.feature_usage ?? {}),
      podcast: { count: 1, resetAt: weekFromNow },
    },
    podcasts: [podcastEntry, ...(sub.podcasts ?? [])].slice(0, 5),
  }

  const { error: writeErr } = await supabase
    .from('user_data')
    .update({ subscription: updatedSub, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (writeErr) console.error('[podcast] Subscription update failed', writeErr)

  return res.status(200).json({
    podcast: podcastEntry,
    usage: { count: 1, limit: 1, resetAt: weekFromNow },
  })
}
