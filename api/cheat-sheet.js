import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, syllabusText, recallHistory, coachPlan, examPrompt, regenerate } = req.body
  if (!courseName && !examPrompt) return res.status(400).json({ error: 'Missing course context' })

  const contextParts = []
  if (syllabusText) contextParts.push(`Syllabus and notes:\n${syllabusText.slice(0, 4000)}`)
  if (recallHistory?.length) contextParts.push(`Student recall history (topics and scores):\n${JSON.stringify(recallHistory).slice(0, 1000)}`)
  if (coachPlan) contextParts.push(`Study coach focus areas:\n${coachPlan.slice(0, 1000)}`)
  if (examPrompt) contextParts.push(`Student exam description: "${examPrompt}"`)

  const angle = regenerate === 2
    ? 'a contrarian angle focusing on concepts students typically overlook but professors love to test'
    : regenerate === 1
      ? 'an alternative perspective emphasizing connections between topics and applied knowledge'
      : 'the most likely exam topics based on all available context'

  const prompt = `You are an expert academic coach. A student is preparing for their ${courseName} exam.

${contextParts.length ? `Context:\n${contextParts.join('\n\n')}` : 'No course context uploaded yet. Use your knowledge of this subject to generate likely exam topics.'}

Generate ${angle}.

Return ONLY valid JSON with no other text:
{
  "topics": [
    {
      "rank": 1,
      "name": "Topic Name",
      "whyLikely": "One specific sentence explaining why this appears on exams for this course",
      "examLikelihood": "High",
      "readiness": "Weak",
      "estimatedMinutes": 12
    }
  ],
  "totalMinutes": 90
}

Rules:
- Exactly 10 topics ranked 1 to 10 by exam probability
- examLikelihood: "High" or "Medium" only
- readiness: "Strong", "Moderate", or "Weak" based on recall history if available, otherwise "Moderate"
- estimatedMinutes: realistic review time per topic, 5 to 30 minutes each
- whyLikely must be specific and concrete, not generic filler
- No em dashes in any text field`

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
        max_tokens: 2000,
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
    console.error('[cheat-sheet]', e)
    return res.status(500).json({ error: 'Failed to generate cheat sheet. Please try again.' })
  }
}
