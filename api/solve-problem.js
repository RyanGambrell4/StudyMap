import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { problem, imageBase64, mediaType, subject } = req.body
  if (!problem?.trim() && !imageBase64) return res.status(400).json({ error: 'Problem text or image required' })

  const systemPrompt = `You are an expert STEM tutor who solves problems with clear, educational step-by-step explanations. Always return valid JSON matching the exact schema requested. Show your work in a way that helps students understand the reasoning, not just the answer.`

  const userContent = []
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
    })
  }
  userContent.push({
    type: 'text',
    text: `Solve this ${subject ? subject + ' ' : ''}problem step by step.${problem?.trim() ? '\n\nProblem: ' + problem.trim() : ''}

Return ONLY a JSON object with this exact structure:
{
  "subject": "detected subject (Math, Physics, Chemistry, Biology, etc.)",
  "restatedProblem": "restate the problem clearly in one sentence",
  "approach": "brief description of the method/strategy to use",
  "steps": [
    {
      "number": 1,
      "action": "what we do in this step",
      "work": "the actual math/logic/working shown here",
      "note": "optional insight or tip (empty string if none)"
    }
  ],
  "finalAnswer": "the complete final answer with units if applicable",
  "keyFormulas": ["formula1", "formula2"],
  "difficulty": "Easy | Medium | Hard",
  "commonMistake": "one common mistake students make on this type of problem"
}

No em dashes in any field.`
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'AI service error: ' + err })
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text || ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' })

  let solution
  try {
    solution = JSON.parse(jsonMatch[0])
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from AI' })
  }

  return res.status(200).json({ solution })
}
