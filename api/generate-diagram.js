import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

const COLORS = ['#3B61C4', '#16A34A', '#D97706', '#DC2626', '#6366F1', '#0891B2', '#DB2777', '#EA580C']

function buildPrompt(diagramType, topic, courseName) {
  const ctx = courseName ? ` (${courseName})` : ''

  switch (diagramType) {
    case 'mindmap':
      return `Create a mind map for studying "${topic}"${ctx}.
Return ONLY valid JSON with no other text:
{
  "type": "mindmap",
  "center": "Concise topic title",
  "branches": [
    {
      "label": "Branch Name",
      "color": "${COLORS[0]}",
      "children": ["subtopic 1", "subtopic 2", "subtopic 3"]
    }
  ]
}
Rules:
- 4 to 7 main branches
- 2 to 4 children per branch
- Pick branch colors from: ${COLORS.join(', ')}
- Labels max 4 words each
- Children max 5 words each
- Cover the most important study-relevant aspects
- No em dashes, no markdown`

    case 'flowchart':
      return `Create a process flowchart for studying "${topic}"${ctx}.
Return ONLY valid JSON with no other text:
{
  "type": "flowchart",
  "title": "Process Title",
  "steps": [
    { "id": "1", "label": "Step label", "type": "start", "nexts": ["2"], "nextLabels": [""] },
    { "id": "2", "label": "Process step", "type": "process", "nexts": ["3"], "nextLabels": [""] },
    { "id": "3", "label": "Is condition met?", "type": "decision", "nexts": ["4","2"], "nextLabels": ["Yes","No"] },
    { "id": "4", "label": "End", "type": "end", "nexts": [], "nextLabels": [] }
  ]
}
Rules:
- 5 to 10 steps total
- Types: "start" (exactly 1), "process" (most steps), "decision" (branching), "end" (1 or 2)
- Decisions must have exactly 2 nexts with labels
- Other steps have exactly 1 next (except end which has 0)
- Labels max 6 words
- No em dashes, no markdown`

    case 'timeline':
      return `Create a study timeline for "${topic}"${ctx}.
Return ONLY valid JSON with no other text:
{
  "type": "timeline",
  "title": "Timeline Title",
  "events": [
    { "period": "Date or era", "title": "Event title", "description": "Why this matters to remember for exams" }
  ]
}
Rules:
- 6 to 10 events in chronological order
- Period: year, date range, or era name
- Title: max 6 words
- Description: 1 concise sentence with the exam-relevant takeaway
- No em dashes, no markdown`

    case 'comparison':
      return `Create a comparison chart for studying "${topic}"${ctx}.
Return ONLY valid JSON with no other text:
{
  "type": "comparison",
  "title": "Comparison Title",
  "items": ["Concept A", "Concept B", "Concept C"],
  "attributes": [
    { "name": "Attribute", "values": ["Value A", "Value B", "Value C"] }
  ]
}
Rules:
- 2 to 4 items to compare (match the count of values in every attribute)
- 5 to 8 meaningful attributes
- Values: concise, specific, factually accurate
- No em dashes, no markdown`

    case 'hierarchy':
      return `Create a concept hierarchy (taxonomy) for studying "${topic}"${ctx}.
Return ONLY valid JSON with no other text:
{
  "type": "hierarchy",
  "title": "Hierarchy Title",
  "root": {
    "label": "Root Concept",
    "note": "",
    "children": [
      {
        "label": "Sub-concept",
        "note": "key fact",
        "children": [
          { "label": "Detail", "note": "specific detail", "children": [] }
        ]
      }
    ]
  }
}
Rules:
- 2 to 4 levels deep
- 2 to 5 children per node
- Labels: max 4 words
- Notes: 1 brief fact (or empty string)
- No em dashes, no markdown`

    default:
      return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, diagramType, courseName } = req.body
  if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' })

  const prompt = buildPrompt(diagramType, topic.trim(), courseName || null)
  if (!prompt) return res.status(400).json({ error: 'Invalid diagram type' })

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
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')

    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')

    const diagram = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json({ diagram })
  } catch (e) {
    console.error('[generate-diagram]', e)
    return res.status(500).json({ error: 'Failed to generate diagram. Please try again.' })
  }
}
