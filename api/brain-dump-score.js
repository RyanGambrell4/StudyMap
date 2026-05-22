import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { tracedCall } from '../lib/server/langfuse.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { text, courseName, topic } = req.body
  if (!text || !courseName) return res.status(400).json({ error: 'Missing required fields' })

  const wordCount = text.trim().split(/\s+/).length

  const prompt = `You are an expert academic coach scoring a student's brain dump exercise.

Course: ${courseName}
Topic: ${topic || 'general course material'}
Student brain dump (${wordCount} words written under time pressure):
---
${text.slice(0, 3000)}
---

Score this brain dump fairly but rigorously. The student was under time pressure so reward conceptual coverage and accuracy over completeness.

Return ONLY valid JSON with no other text:
{
  "score": 71,
  "categories": {
    "Concepts": { "score": 7, "gap": "Mitosis checkpoints not mentioned" },
    "Application": { "score": 6, "gap": "No real-world examples or problem-solving shown" },
    "Detail": { "score": 8, "gap": "Cell cycle timing values missing" },
    "Connections": { "score": 5, "gap": "Link between DNA replication and mitosis unclear" }
  },
  "gradeProjection": "trending toward B territory",
  "studyTimeToUpgrade": 35,
  "upgradeTarget": "B+",
  "possibleGaps": ["Mitosis checkpoints", "S-phase duration", "Cyclin-CDK complexes"]
}

Rules:
- score: specific integer, never divisible by 5 or 10 (e.g. 67, 71, 83, never 70, 75, 80)
- category scores: integers 1 to 10, should vary meaningfully
- gap: one specific concept or detail they did not clearly address
- gradeProjection: use hedged language like "trending toward" or "tracking toward", never a definitive claim
- studyTimeToUpgrade: realistic minutes of focused review to reach upgradeTarget
- upgradeTarget: one grade tier above the current projection
- possibleGaps: exactly 3 specific topics they likely did not cover, framed as possibilities not certainties
- No em dashes in any field`

  try {
    const data = await tracedCall({
      name: 'brain-dump-score',
      userId: gate.userId,
      model: 'claude-haiku-4-5-20251001',
      input: { messages: [{ role: 'user', content: prompt }] },
      maxTokens: 800,
      call: () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
      }).then(r => r.json()),
    })
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const result = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json(result)
  } catch (e) {
    console.error('[brain-dump-score]', e)
    return res.status(500).json({ error: 'Failed to score brain dump. Please try again.' })
  }
}
