import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, examPrompt, regenerate, courseContext } = req.body
  const ctx = courseContext ?? { courseName }
  const resolvedName = ctx.courseName ?? courseName
  if (!resolvedName && !examPrompt) return res.status(400).json({ error: 'Missing course context' })

  const angle = regenerate === 2
    ? 'Recompute the ranking from a contrarian angle: surface topics students commonly under-review that this professor still tests. Cross-reference the emphasis and syllabus signals for hints.'
    : regenerate === 1
      ? 'Recompute the ranking emphasizing cross-topic connections and applied problems drawn from the coach plan and syllabus.'
      : 'Rank the most likely exam topics using ALL context signals below. Weight = syllabus mention density × recent quiz-miss rate × proximity to exam date × professor emphasis.'

  const contextBlock = buildContextBlock(ctx)
  const guardrails = contextGuardrails(ctx, {
    invention: 'If the context only contains a course name (no syllabus, coach plan, or mastery data), return topics that are canonical for a course of this name at this year-level, and mark examLikelihood as "Medium" for all of them. Do NOT invent professor names or fake syllabus weeks.',
  })

  const prompt = `You are the student's academic coach preparing a personalized cheat sheet for their ${resolvedName} exam.

${contextBlock}

${examPrompt ? `Student's own exam description: "${examPrompt}"` : ''}

Task: ${angle}

Return ONLY valid JSON, no other text:
{
  "topics": [
    {
      "rank": 1,
      "name": "Topic Name",
      "whyLikely": "One concrete sentence citing the specific signal (e.g. 'Appears on 3 syllabus weeks and student missed 62% on last practice exam').",
      "examLikelihood": "High" | "Medium",
      "readiness": "Strong" | "Moderate" | "Weak",
      "readinessReason": "One short phrase citing the mastery score or a recent miss (e.g. 'mastery 34/100, missed Photosynthesis quiz Mar 3'). Omit if only course name is known.",
      "estimatedMinutes": 12,
      "priorityAction": "One concrete action (e.g. 'Do 10 practice problems on gel electrophoresis', 'Rewrite Bloom's timeline from memory'). Should tie to the student's learning style if known.",
      "grounding": "syllabus" | "weak_topic" | "past_miss" | "emphasis" | "coach_plan" | "canonical"
    }
  ],
  "totalMinutes": 90,
  "topPickReason": "One sentence saying which topic returns the most exam-point ROI in the next 30 min and why."
}

Rules:
- Exactly 10 topics ranked by exam probability × student weakness (weakest known topics rank higher, all else equal).
- Every 'whyLikely' MUST cite a real signal from the context above — do not write generic filler.
- Set readiness from mastery scores when available: <40 = Weak, 40-69 = Moderate, 70+ = Strong. Only fall back to "Moderate" when no mastery data exists.
- estimatedMinutes: 5-30 per topic, realistic to actually complete.
- No em dashes anywhere.

${guardrails}`

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
        max_tokens: 2400,
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
    console.error('[cheat-sheet]', e)
    return res.status(500).json({ error: 'Failed to generate cheat sheet. Please try again.' })
  }
}
