import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, essayType, wordCount, requirements, courseName, thesis } = req.body
  if (!topic?.trim()) return res.status(400).json({ error: 'Essay topic is required' })

  const typeDescriptions = {
    argumentative: 'argumentative essay that takes a clear position and defends it with evidence',
    analytical: 'analytical essay that breaks down and examines a topic in depth',
    expository: 'expository essay that explains or describes a topic objectively',
    compare: 'compare and contrast essay examining similarities and differences',
    narrative: 'narrative essay telling a story or recounting an experience',
    research: 'research paper synthesizing multiple sources around a central thesis'
  }

  const typeDesc = typeDescriptions[essayType] || 'academic essay'
  const wc = wordCount || 1000

  const prompt = `Create a detailed outline for a ${wc}-word ${typeDesc}.

Topic: ${topic}${thesis ? '\nThesis (use this exactly): ' + thesis : ''}${courseName ? '\nCourse: ' + courseName : ''}${requirements ? '\nSpecific requirements: ' + requirements : ''}

Return ONLY a JSON object with this exact structure:
{
  "title": "suggested essay title",
  "thesis": "the thesis statement (use the provided thesis if given)",
  "essayType": "${essayType || 'academic'}",
  "estimatedWordCount": ${wc},
  "sections": [
    {
      "name": "Introduction",
      "purpose": "hook the reader and present the thesis",
      "points": ["hook/opening", "background context", "thesis statement"],
      "wordAllocation": 150
    },
    {
      "name": "Body Paragraph 1",
      "purpose": "first main argument",
      "points": ["topic sentence", "evidence/example", "analysis", "transition"],
      "wordAllocation": 200
    }
  ],
  "keyArguments": ["main argument 1", "main argument 2", "main argument 3"],
  "suggestedSources": ["type of source 1", "type of source 2"],
  "writingTips": ["tip specific to this essay type and topic"],
  "commonPitfalls": ["pitfall to avoid for this essay type"]
}

No em dashes in any field.`

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
      system: 'You are an expert writing coach and academic tutor. Create detailed, actionable essay outlines. Always return valid JSON matching the exact schema requested.',
      messages: [{ role: 'user', content: prompt }]
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

  let outline
  try {
    outline = JSON.parse(jsonMatch[0])
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from AI' })
  }

  return res.status(200).json({ outline })
}
