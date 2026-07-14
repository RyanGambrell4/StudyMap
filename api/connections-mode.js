import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { phase, courseName, concepts, conceptA, conceptB, question, answer } = req.body
  if (!phase || !courseName) return res.status(400).json({ error: 'Missing required fields' })

  let prompt

  if (phase === 'generate') {
    const conceptContext = concepts?.length
      ? `Work from these specific concepts the student has been studying:\n${concepts.slice(0, 24).join('\n')}`
      : `Generate connections appropriate for a ${courseName} course.`

    prompt = `You are generating Connections Mode cards for a student studying ${courseName}.

${conceptContext}

Create 5 concept pairs that have a meaningful, non-obvious relationship worth understanding deeply. For each pair, write a question asking the student to articulate the connection.

Return ONLY valid JSON:
{
  "connections": [
    {
      "conceptA": "First concept name",
      "conceptB": "Second concept name",
      "question": "How does [conceptA] relate to [conceptB]? What is the key connection between them?",
      "idealAnswer": "2-3 sentences describing the core relationship clearly and specifically"
    }
  ]
}

Rules:
- Choose pairs that are causally linked, commonly confused, or thematically related in ways students often miss
- Avoid pairs where the connection is trivially obvious
- idealAnswer should capture what a student with genuine understanding would say
- No em dashes anywhere`
  } else if (phase === 'score') {
    if (!conceptA || !conceptB || question === undefined || answer === undefined)
      return res.status(400).json({ error: 'Missing fields for score phase' })

    prompt = `A student studying ${courseName} was asked about the relationship between "${conceptA}" and "${conceptB}".

Question: "${question}"
Student's answer: "${answer || '(left blank)'}"

Score their understanding. Return ONLY valid JSON:
{
  "score": number from 0 to 100,
  "feedback": "2-3 sentences of direct feedback. Confirm what they got right. Clarify any gaps. Make the key relationship clear.",
  "keyRelationship": "One sentence capturing the core connection they needed to articulate"
}

No em dashes anywhere.`
  } else {
    return res.status(400).json({ error: 'Invalid phase' })
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
        max_tokens: phase === 'generate' ? 1200 : 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    return res.status(200).json(JSON.parse(content.slice(first, last + 1)))
  } catch (e) {
    console.error('[connections-mode]', e)
    return res.status(500).json({ error: 'Failed. Please try again.' })
  }
}
