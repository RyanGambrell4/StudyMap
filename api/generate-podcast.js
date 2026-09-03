import { verifyAuth, reserveAiUsage } from '../lib/server/usage.js'
import { createClient } from '@supabase/supabase-js'
import { getCourseContext, formatCourseContextForPrompt } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'
import { reportQueryError } from '../lib/server/supabaseErrors.js'
import { readBilling, commitFeatureUsage } from '../lib/server/billing.js'

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

function weekExpired(resetAt) {
  if (!resetAt) return true
  return Date.now() >= new Date(resetAt).getTime()
}

/**
 * What one podcast costs against the plan's monthly AI actions.
 *
 * This endpoint is the most expensive thing we run, and until now it was the
 * only one spending money without going through reserveAiUsage(). The two
 * gates it did have are not a quota: the plan check and the 1-per-week counter
 * both read `user_data.subscription`, and RLS lets a signed-in user write their
 * own row, so both are self-serve. The email-confirmation gate stops being a
 * gate at all the moment Supabase auto-confirm is switched on.
 *
 * The number, measured rather than guessed (Haiku 4.5 at $1/$5 per MTok,
 * OpenAI tts-1 at $15 per 1M characters):
 *
 *   script     ~2.5k in + ~1.8k out on Haiku 4.5      ~$0.012
 *   audio      ~4-8k characters of TTS                ~$0.06-0.12
 *   total                                             ~$0.10
 *
 * A median metered endpoint here is one Haiku call at roughly $0.006, so a
 * podcast is around 15-20x a normal action.
 *
 * Pricing it at that ratio is not the answer — 5 free actions a month means
 * anything above 5 is indistinguishable from "off", and it would misprice this
 * against generate-study-coach-plan, which runs Sonnet 4.6 at 16k max_tokens
 * for roughly $0.19 and costs 1. Marginal API cost is not what the free tier
 * meters; it meters how much of a month's sampling one action should consume.
 *
 * 3 is the number that survives both directions:
 *
 *   free (5/mo)   one podcast a month, with 2 actions left to try anything
 *                 else. At 5 a single call zeroes a new account's whole
 *                 allowance before they have seen the product, which is the
 *                 exact failure the reserve/commit split was written to stop.
 *                 At 1 or 2 the free tier funds two or five podcasts a month.
 *
 *   pro (100/mo)  caps a determined subscriber at 33 podcasts, about $3.30 of
 *                 API spend against $9.99 of revenue. This is the argument
 *                 that actually decides it: at cost 1, those same 100 actions
 *                 buy 100 podcasts, about $10 — a Pro subscriber could spend
 *                 more on podcasts alone than their subscription is worth,
 *                 before touching any other feature.
 *
 * Unlimited is Infinity, so the quota never binds there and the 1-per-week
 * counter below stays the real limit for that plan.
 */
const PODCAST_AI_COST = 3

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  // Body validation runs before the reservation, so a request that is going to
  // be rejected with a 400 never costs anyone an action.
  const { courseId, courseName } = req.body ?? {}
  if (!courseId) return res.status(400).json({ error: 'courseId is required' })

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

  // Plan and the weekly counter both come from user_billing now. Both used to
  // be read from user_data.subscription, which the user can write — so the
  // "Unlimited only" gate and the one-a-week gate were each self-serve. Those
  // were the two gates left standing after the email-confirmation one went
  // away, and neither was real.
  const billingRead = await readBilling(supabase, userId)
  if (!billingRead.ok) return res.status(500).json({ error: 'Failed to load user data.' })
  const billing = billingRead.billing

  const sub = row?.subscription ?? {}
  const activeStatuses = ['active', 'trialing', 'past_due']
  const plan = activeStatuses.includes(billing.status) ? (billing.plan ?? 'free') : 'free'

  if (plan !== 'unlimited') {
    return res.status(403).json({ error: 'Study podcasts are available on the Unlimited plan only.', upgrade: true })
  }

  // Weekly limit: 1 podcast per 7 days
  const podcastUsage = billing.featureUsage?.podcast ?? { count: 0, resetAt: null }
  const expired = weekExpired(podcastUsage.resetAt)
  const currentCount = expired ? 0 : (podcastUsage.count ?? 0)

  if (currentCount >= 1) {
    return res.status(429).json({
      error: 'You have already generated your podcast for this week. Come back next week for a fresh one.',
      resetAt: podcastUsage.resetAt,
    })
  }

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

  // Everything that can 400 has now run. Reserve the quota before spending a
  // cent: this is the first gate on this endpoint that a user cannot grant
  // themselves by editing their own subscription row, and it is the only one
  // that survives Supabase auto-confirm. `verified` is passed so this does not
  // re-verify the bearer token that verifyAuth already checked.
  //
  // Nothing is written until gate.commit() below, so an Anthropic or TTS
  // failure costs the user nothing.
  const gate = await reserveAiUsage(req, { verified: auth, cost: PODCAST_AI_COST })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error })

  // Layer the server-assembled course context on top of the session-notes
  // content. Podcast content stays notes-driven; context adds tone/framing
  // grounding (student's exam date, weak areas, learning style).
  let podcastContextBlock = ''
  try {
    const brain = await getCourseContext(userId, courseId, { request: req })
    podcastContextBlock = formatCourseContextForPrompt(brain)
  } catch (err) {
    console.warn('[podcast] getCourseContext failed, continuing with notes only', err?.message)
  }

  // Generate dialogue script with Claude Haiku
  const scriptPrompt = `You are producing an engaging audio study podcast for a college student preparing for an exam.

${ANTI_GUESSING_RULES}

${podcastContextBlock}

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

  // The audio exists, so the work succeeded: charge for it.
  await gate.commit()

  // The weekly counter now lives in user_billing, on its own column, so it no
  // longer races the usage commit. The whole-object-overwrite hazard that used
  // to be here — two writers each replacing the entire subscription blob from
  // a copy read at a different moment, last write winning and silently
  // refunding the podcast — cannot happen between two targeted column updates.
  const featureWrite = await commitFeatureUsage(supabase, userId, {
    ...(billing.featureUsage ?? {}),
    podcast: { count: 1, resetAt: weekFromNow },
  })
  if (!featureWrite.ok) console.error('[podcast] feature usage write failed', featureWrite.error)

  // The list of generated podcasts is display data the user is welcome to
  // have, so it stays in user_data. It gates nothing.
  const { data: freshRow, error: freshErr } = await supabase
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  if (freshErr) {
    reportQueryError(freshErr, { table: 'user_data', context: 'generate-podcast podcast list re-read' })
  } else {
    const baseSub = freshRow?.subscription ?? sub
    const { error: writeErr } = await supabase
      .from('user_data')
      .update({
        subscription: {
          ...baseSub,
          podcasts: [podcastEntry, ...(baseSub.podcasts ?? [])].slice(0, 5),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (writeErr) console.error('[podcast] podcast list update failed', writeErr)
  }

  saveArtifact({
    userId,
    courseId,
    courseName: courseName || 'Unknown Course',
    artifactType: 'podcast',
    title: `${courseName || 'Study'} Podcast`,
    topic: null,
    payload: { script, audioUrl: publicUrl, segments },
  }).then(w => { if (!w.ok) console.warn('[podcast] saveArtifact failed', w.error) })
    .catch(err => console.warn('[podcast] saveArtifact threw', err?.message))

  return res.status(200).json({
    podcast: podcastEntry,
    usage: { count: 1, limit: 1, resetAt: weekFromNow },
    aiUsage: gate.usage,
  })
}
