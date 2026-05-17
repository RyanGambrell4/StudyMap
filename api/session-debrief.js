import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, sessionType, duration, recallText, notes, weakTopics } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  const hasRecall = recallText && recallText.trim().length > 20
  const hasNotes = notes && notes.trim().length > 10
  const weakStr = Array.isArray(weakTopics) && weakTopics.length ? weakTopics.slice(0, 5).join(', ') : 'none on record'

  const prompt = `You are a study coach analyzing a just-completed study session. Give the student a sharp, personalized debrief.

Course: ${courseName}
Session type: ${sessionType ?? 'Review'}
Duration: ${duration ?? 60} minutes
Known weak topics: ${weakStr}
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
  "coachNote": "<one direct sentence of coaching feedback — be honest, not just encouraging>"
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
    return res.status(200).json(result)
  } catch (e) {
    console.error('[session-debrief]', e)
    return res.status(500).json({ error: 'Failed to generate session debrief.' })
  }
}
