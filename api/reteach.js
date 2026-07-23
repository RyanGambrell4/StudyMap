import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

// Re-explain a concept in a different mode. Called by the ExplainAs component
// whenever the student taps "30-sec" / "Visual" / "Worked example" or the
// "That confused me" button. Cheap (haiku, small max_tokens) because output
// is meant to be a paragraph, not an essay.
//
// Body:
//   concept:     string    - the thing to re-teach (question text, topic name, etc.)
//   context:     string    - what the student already saw / their answer / the setup
//   mode:        'short' | 'visual' | 'example' | 'confused'
//   courseContext: hydrated CourseContext (optional but strongly recommended)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { concept, context, mode, courseContext, priorExplanation } = req.body
  if (!concept?.trim()) return res.status(400).json({ error: 'concept is required' })

  const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.short
  const ctx = courseContext ?? {}
  const contextBlock = buildContextBlock(ctx)
  const guardrails = contextGuardrails(ctx, {
    invention: 'Do not invent professor-specific rules, page numbers, or citations. If you use an analogy, keep it common-knowledge.',
  })

  const prompt = `You are the student's tutor, re-explaining a concept in a specific mode. Every word must earn its place — students bounce off long walls of text.

${contextBlock}

CONCEPT TO RE-TEACH: ${concept.trim()}
${context ? `WHAT THEY ALREADY SAW: ${context.trim()}` : ''}
${priorExplanation ? `PRIOR EXPLANATION (that didn't land): ${priorExplanation.trim()}` : ''}

MODE: ${mode ?? 'short'}
${modeInstruction}

${guardrails}

Return ONLY JSON, no other text:
{
  "explanation": "your re-explanation, formatted per mode",
  "keyTakeaway": "one line the student should remember",
  "checkYourself": "one short question the student can ask themselves to verify they got it — active recall prompt"
}

No em dashes anywhere.`

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
        max_tokens: 900,
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
    return res.status(200).json({ ...result, mode })
  } catch (e) {
    console.error('[reteach]', e)
    return res.status(500).json({ error: 'Failed to re-explain. Please try again.' })
  }
}

const MODE_INSTRUCTIONS = {
  short: `Give a 30-second version. Two or three sentences MAX. The tightest possible articulation of the concept. No fluff.`,

  visual: `Describe a mental image or diagram that captures the concept.
Format:
- Open with a one-line description of the mental image (e.g. "Picture a subway map where the tracks are neurons and the lit stations are active regions.").
- Follow with 3-4 short bullet lines mapping parts of the image to parts of the concept.
- End with 1 line naming what the image reveals that words alone don't.`,

  example: `Give a concrete worked example the student can walk through.
Format:
- Set up a specific scenario in 1-2 sentences.
- Show the reasoning step-by-step (numbered, terse).
- End with the answer + one line naming what pattern this example demonstrates so the student can spot it again.`,

  confused: `The student said this didn't land. Try a fundamentally different angle from any prior explanation. If the prior was abstract, go concrete. If prior was mechanism, go analogy. If prior was verbal, go visual. Keep it under 6 sentences. Do NOT just repeat with different words.`,
}
