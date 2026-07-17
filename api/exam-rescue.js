import { verifyAndCheckAiUsage, verifyAuth } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    courseName,
    currentGrade,
    hoursAvailable,
    step,
    topics,
    syllabusText,
    recallHistory,
    coachPlan,
    targetGrade,
    learningStyle,
    struggles,
  } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  // Schedule step is auto-generated as part of the same session — auth only, no extra credit.
  if (step === 'schedule') {
    const auth = await verifyAuth(req)
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  } else {
    const gate = await verifyAndCheckAiUsage(req)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })
  }

  const safeHours = Math.min(Math.max(Number(hoursAvailable) || 3, 0.5), 72)

  const contextParts = []
  if (syllabusText) contextParts.push(`Syllabus:\n${syllabusText.slice(0, 2000)}`)
  if (recallHistory?.length) contextParts.push(`Recall history:\n${JSON.stringify(recallHistory).slice(0, 600)}`)
  if (coachPlan) contextParts.push(`Study plan focus:\n${coachPlan.slice(0, 600)}`)
  const context = contextParts.join('\n\n') || 'No additional context provided.'

  const personalLines = []
  if (targetGrade) personalLines.push(`Target grade: ${targetGrade}.`)
  if (learningStyle) personalLines.push(`Learning style: ${learningStyle}. Tailor topic framing to match.`)
  if (Array.isArray(struggles) && struggles.length) personalLines.push(`Active struggle areas (prioritize): ${struggles.join(', ')}.`)
  const personalBlock = personalLines.length ? `\n${personalLines.join('\n')}\n` : ''

  if (step === 'topics' || !step) {
    const prompt = `You are an expert academic coach helping a student prepare for an urgent exam.

Course: ${courseName}
Current grade: ${currentGrade || 'unknown'}
Hours available: ${safeHours}${personalBlock}
${context}

Generate 5 ranked topics ordered by (exam likelihood multiplied by current weakness). Prioritize what will move the grade most.

Return ONLY valid JSON with no other text:
{
  "topics": [
    {
      "rank": 1,
      "name": "Topic Name",
      "priority": "Critical",
      "estimatedMinutes": 45,
      "why": "One specific sentence explaining why this is the top priority right now"
    }
  ]
}

Rules:
- priority: "Critical", "Important", or "Nice to have" only
- Exactly 5 topics
- why: specific to this course and current situation, actionable
- No em dashes`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
        }),
      })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error('Empty AI response')
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      const result = JSON.parse(content.slice(first, last + 1))
      return res.status(200).json(result)
    } catch (e) {
      console.error('[exam-rescue topics]', e)
      return res.status(500).json({ error: 'Failed to generate topics. Please try again.' })
    }
  }

  if (step === 'schedule') {
    const now = new Date()
    const startLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const hours = safeHours

    const prompt = `You are an expert academic coach. A student has ${hours} hours starting now (${startLabel}) to study for their ${courseName} exam.${personalBlock}

Topics to cover in priority order:
${(topics || []).map((t, i) => `${i + 1}. ${t.name} (${t.priority}, about ${t.estimatedMinutes} min)`).join('\n')}

Build a specific hour-by-hour study schedule. Include a 10-minute buffer block at the end for final review.

Return ONLY valid JSON with no other text:
{
  "blocks": [
    {
      "startTime": "9:00 PM",
      "endTime": "9:45 PM",
      "topic": "Topic Name",
      "focus": "Specific actionable task for this block",
      "type": "study"
    }
  ],
  "bufferBlock": {
    "startTime": "11:50 PM",
    "endTime": "12:00 AM",
    "topic": "Final review",
    "focus": "Skim notes and recall 3 key things per topic",
    "type": "buffer"
  }
}

Rules:
- Fill exactly ${hours} hours total (blocks plus buffer)
- Last 10 minutes is always the bufferBlock
- type is "study" or "buffer"
- focus must be specific and actionable, not generic
- No em dashes`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1400,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
        }),
      })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error('Empty AI response')
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      const result = JSON.parse(content.slice(first, last + 1))
      return res.status(200).json(result)
    } catch (e) {
      console.error('[exam-rescue schedule]', e)
      return res.status(500).json({ error: 'Failed to generate schedule. Please try again.' })
    }
  }

  return res.status(400).json({ error: 'Invalid step. Use "topics" or "schedule".' })
}
