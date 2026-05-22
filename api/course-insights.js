import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, gradeComponents, completedSessions, weakTopics, examDate, targetScore } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  const gradeStr = gradeComponents?.length
    ? gradeComponents.map(c => `${c.name} (${c.weight}% weight${c.grade != null ? `, current: ${c.grade}%` : ', ungraded'})`).join(', ')
    : 'No grade data'

  const sessionCount = Array.isArray(completedSessions) ? completedSessions.length : 0
  const recentSessions = Array.isArray(completedSessions)
    ? completedSessions.slice(-5).map(s => `${s.dateStr}: ${s.sessionType ?? 'Review'} (${s.duration ?? 60}min)`).join(', ')
    : 'none'

  const weakStr = Array.isArray(weakTopics) && weakTopics.length ? weakTopics.slice(0, 5).join(', ') : 'none identified'

  const prompt = `You are a study analytics engine. Analyze this student's course performance and generate actionable insights.

Course: ${courseName}
Grade breakdown: ${gradeStr}
Total sessions completed: ${sessionCount}
Recent sessions: ${recentSessions}
Weak topics from recall: ${weakStr}
${examDate ? `Exam date: ${examDate}` : ''}
${targetScore ? `Target score: ${targetScore}` : ''}

Return ONLY valid JSON:
{
  "healthScore": <0-100 integer representing overall course health>,
  "healthLabel": "<one of: 'On Track', 'Needs Attention', 'At Risk', 'Strong'>",
  "gradeTrajectory": "<one of: 'improving', 'stable', 'declining', 'unknown'>",
  "topWeakAreas": ["<specific concept>", "<specific concept>"],
  "topStrengths": ["<specific area>"],
  "nextSessionFocus": "<one concrete action for their very next study session>",
  "insight": "<one sharp sentence about what this student most needs to do differently right now>"
}

No em dashes. Be specific to the course and data — not generic advice.`

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
        max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
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
    console.error('[course-insights]', e)
    return res.status(500).json({ error: 'Failed to generate course insights.' })
  }
}
