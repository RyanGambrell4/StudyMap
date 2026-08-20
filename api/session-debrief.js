import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { sendUserError } from '../lib/server/userErrors.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { courseName, courseId: bodyCourseId, sessionType, duration, recallText, notes, weakTopics: legacyWeak } = req.body || {}

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
  if (!courseId) return sendUserError(res, 'course_required', `session-debrief: no courseId resolved (courseName=${courseName ?? 'none'})`)

  // Quota is reserved only now, once the request is known to be well formed.
  // It used to be taken at the top of the handler, so a request that was about
  // to be rejected for a missing course still cost the user an AI action.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { topic: sessionType || null, request: req })
  } catch (err) {
    console.error('[session-debrief] getCourseContext failed', err)
    return sendUserError(res, 'course_context_failed', err)
  }

  const resolvedName = brain.identity?.name || courseName
  const contextBlock = formatCourseContextForPrompt(brain)
  const hasRecall = recallText && recallText.trim().length > 20
  const hasNotes = notes && notes.trim().length > 10

  // Next-session priority is driven by the lowest-mastery topic with
  // recent evidence. Server-derived list takes precedence over the
  // legacy client field (v1.1 will drop the client field).
  const serverWeak = (brain?.topics?.items ?? [])
    .filter(t => typeof t.mastery === 'number' && t.mastery < 60)
    .sort((a, b) => (a.mastery ?? 999) - (b.mastery ?? 999))
    .slice(0, 5)
    .map(t => `${t.name} (${t.mastery}/100${t.trend && t.trend !== 'new' ? `, trend ${t.trend}` : ''})`)
  const weakLine = serverWeak.length
    ? `\nSERVER-DERIVED weak topics (lowest-mastery first): ${serverWeak.join('; ')}\n`
    : (Array.isArray(legacyWeak) && legacyWeak.length
        ? `\nCLIENT-DERIVED weak topics (fallback): ${legacyWeak.slice(0, 5).join(', ')}\n`
        : '')

  const prompt = `You are a study coach analyzing a just-completed study session. Give the student a sharp, personalized debrief.

${ANTI_GUESSING_RULES}

${contextBlock}${weakLine}

Course: ${resolvedName}
Session type: ${sessionType ?? 'Review'}
Duration: ${duration ?? 60} minutes
${hasRecall ? `Student's recall attempt:\n"${recallText.slice(0, 800)}"` : 'No recall text submitted.'}
${hasNotes ? `Student's notes:\n"${notes.slice(0, 400)}"` : ''}

Return ONLY valid JSON:
{
  "qualityScore": <0-100 integer rating this session's apparent depth>,
  "qualityLabel": "<one of: 'Deep Work', 'Solid Session', 'Surface Level', 'Light Review'>",
  "recallStrengths": ["<concept they clearly understood>"],
  "recallGaps": ["<specific concept that seems shaky or missing>"],
  "nextSessionPriority": "<the single most important topic to tackle next session>",
  "nextSessionType": "<one of: 'Active Recall', 'Practice Problems', 'Concept Review', 'Mixed'>",
  "coachNote": "<one direct sentence of coaching feedback - be honest, not just encouraging>"
}

No em dashes. If no recall text was provided, base gaps and strengths on the known weak topics and session type only.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const result = JSON.parse(content.slice(first, last + 1))
    // The work succeeded, so charge for it now. A reservation that never
    // reaches this line costs the user nothing.
    await gate.commit?.()
    return res.status(200).json(result)
  } catch (e) {
    console.error('[session-debrief]', e)
    return res.status(500).json({ error: 'Failed to generate session debrief.' })
  }
}
