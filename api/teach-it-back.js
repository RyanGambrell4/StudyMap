import { verifyAndCheckAiUsage, verifyAuth } from '../lib/server/usage.js'
import { recordTopicSignal } from '../lib/server/topicSignals.js'
import { resolveCourseId } from '../lib/server/courseContext.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { courseName, courseId: bodyCourseId, topic, explanation, phase, followUpQuestion, followUpAnswer } = req.body
  if (!courseName || !topic || !explanation) return res.status(400).json({ error: 'Missing required fields' })

  // Follow-up is part of the same session, auth only, no extra credit consumed.
  // For the initial phase we resolve userId from the AI usage gate; follow-up
  // phase does not persist a signal so we do not need userId here.
  let userId = null
  if (phase === 'followup') {
    const auth = await verifyAuth(req)
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
    userId = auth.userId
  } else {
    const gate = await verifyAndCheckAiUsage(req)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })
    userId = gate.userId
  }

  let prompt

  if (phase === 'followup') {
    prompt = `A student studying ${courseName} is practicing Teach-It-Back for: "${topic}"

The follow-up question was: "${followUpQuestion}"
Their answer: "${followUpAnswer || '(left blank)'}"

Evaluate whether they understood it. Return ONLY valid JSON:
{
  "understood": true or false,
  "feedback": "2-3 sentences of specific feedback. If correct, reinforce what they got right. If not, clarify the misconception directly."
}

No em dashes anywhere.`
  } else {
    prompt = `A student studying ${courseName} tried to explain "${topic}" in their own words using the Teach-It-Back method.

Their explanation:
"${explanation}"

Evaluate this explanation as a skeptical student receiving the teaching. Return ONLY valid JSON:
{
  "score": number from 0 to 100,
  "verdict": "One sentence summary of how well they understand this topic",
  "got_right": ["Specific thing they got right 1", "Specific thing they got right 2"],
  "missing": ["Most important gap or misconception 1", "Second most important gap 2"],
  "followUp": "One probing question testing the trickiest aspect they have not fully nailed yet"
}

Rules:
- score 85+ = solid understanding, 60-84 = decent with gaps, below 60 = needs review
- got_right: 1-3 specific concrete items. Empty array [] if nothing substantive is right.
- missing: 1-3 items. Focus on the most important gaps, not minor wording issues.
- followUp: the ONE question that separates real understanding from surface-level recall
- No em dashes anywhere`
  }

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
        max_tokens: 700,
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

    // Persist a teach_it_back signal ONLY on the initial phase. Follow-up
    // is a second-chance clarification; a low follow-up should not
    // double-count as a fresh weak signal. courseId must be a stable
    // string; if the caller only knows courseName we resolve it here.
    if (phase !== 'followup' && userId && typeof result?.score === 'number') {
      let courseId = typeof bodyCourseId === 'string' ? bodyCourseId : null
      if (!courseId) {
        try { courseId = await resolveCourseId(userId, courseName) } catch { courseId = null }
      }
      if (courseId) {
        const write = await recordTopicSignal({
          userId,
          courseId,
          courseName,
          topic,
          signalType: 'teach_it_back',
          rawScore: Math.max(0, Math.min(1, result.score / 100)),
          metadata: {
            verdict: typeof result?.verdict === 'string' ? result.verdict.slice(0, 200) : null,
            missing_count: Array.isArray(result?.missing) ? result.missing.length : 0,
          },
        })
        if (!write.ok) console.error('[teach-it-back] recordTopicSignal failed', write)
      }
    }

    return res.status(200).json(result)
  } catch (e) {
    console.error('[teach-it-back]', e)
    return res.status(500).json({ error: 'Failed to evaluate. Please try again.' })
  }
}
