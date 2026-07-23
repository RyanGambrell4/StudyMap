import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { tracedCall } from '../lib/server/langfuse.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { text, courseName, topic, courseContext } = req.body
  const ctx = courseContext ?? { courseName }
  const resolvedName = ctx.courseName ?? courseName
  if (!text || !resolvedName) return res.status(400).json({ error: 'Missing required fields' })

  const wordCount = text.trim().split(/\s+/).length
  const contextBlock = buildContextBlock(ctx)
  const guardrails = contextGuardrails(ctx, {
    invention: 'When you name a gap, the concept MUST appear either in the syllabus events, coach-plan emphasis, weak topics, or be a canonical concept for this course. Do not invent professor-specific jargon.',
  })

  // Prior brain dumps for the same course, if any, so we can measure change
  // over time. Study history entries look like { tool, score, topic, dateStr }.
  const priorDumps = (ctx.recentSessions ?? [])
    .filter(s => s.tool === 'Brain Dump' && typeof s.score === 'number')
    .slice(0, 3)
  const priorSummary = priorDumps.length
    ? `Prior brain dumps in this course: ${priorDumps.map(p => `${p.score}% (${p.dateStr}${p.topic ? `, ${p.topic}` : ''})`).join('; ')}`
    : 'No prior brain dumps for this course yet.'

  const prompt = `You are the student's academic coach scoring a brain dump exercise for ${resolvedName}.

${contextBlock}

${priorSummary}
Focus topic for this dump: ${topic || 'general course material'}

Student brain dump (${wordCount} words, written under time pressure):
---
${text.slice(0, 3000)}
---

Score it fairly but rigorously. Reward conceptual coverage and accuracy over completeness.

Return ONLY valid JSON:
{
  "score": 71,
  "categories": {
    "Concepts": { "score": 7, "gap": "Specific concept not mentioned that appears in the syllabus/emphasis" },
    "Application": { "score": 6, "gap": "Missing worked example or scenario" },
    "Detail": { "score": 8, "gap": "Missing specific numerical or defining detail" },
    "Connections": { "score": 5, "gap": "Missing link between two related course concepts" }
  },
  "gradeProjection": "trending toward B territory",
  "studyTimeToUpgrade": 35,
  "upgradeTarget": "B+",
  "possibleGaps": ["3 specific topics they likely didn't cover, drawn from syllabus/emphasis/weak topics"],
  "syllabusCoverage": "One sentence naming which syllabus topics the dump did or did not touch. Omit if syllabus is empty.",
  "changeSincePrior": "One sentence comparing to prior brain dumps — 'up 8 points on Concepts, flat on Connections'. Omit if no prior dumps.",
  "learningStyleTip": "One sentence with the single action the student should take next, framed for their learning style."
}

Rules:
- score: specific integer, never divisible by 5 or 10 (e.g. 67, 71, 83).
- category scores: integers 1-10, should vary meaningfully.
- gap: one specific concept or detail they didn't clearly address (grounded in the context, not generic).
- gradeProjection: hedged ("trending toward", "tracking toward"). No definitive claims.
- studyTimeToUpgrade: realistic minutes of focused review to reach upgradeTarget.
- upgradeTarget: one grade tier above the current projection.
- possibleGaps: exactly 3 specific topics grounded in the context above.
- No em dashes anywhere.

${guardrails}`

  try {
    const data = await tracedCall({
      name: 'brain-dump-score',
      userId: gate.userId,
      model: 'claude-haiku-4-5-20251001',
      input: { messages: [{ role: 'user', content: prompt }] },
      maxTokens: 1000,
      call: () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
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
