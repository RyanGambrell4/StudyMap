import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { buildClientSupplementBlock } from '../lib/server/courseContextPrompt.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'

const COLORS = ['#3B61C4', '#16A34A', '#D97706', '#DC2626', '#6366F1', '#0891B2', '#DB2777', '#EA580C']

function schemaFor(diagramType, topic) {
  switch (diagramType) {
    case 'mindmap':
      return `{
  "type": "mindmap",
  "center": "Concise topic title",
  "branches": [
    {
      "label": "Branch Name (max 4 words)",
      "color": "one of ${COLORS.join(', ')}",
      "children": ["subtopic 1 (max 5 words)", "subtopic 2", "subtopic 3"],
      "isWeakSpot": false
    }
  ],
  "weakSpotCallout": "Optional one-liner surfacing the branch or child that maps to a weak topic; omit if none."
}
Rules: 4-7 branches, 2-4 children each. Set isWeakSpot=true on any branch that matches one of the student's weak topics. No em dashes.`

    case 'flowchart':
      return `{
  "type": "flowchart",
  "title": "Process Title",
  "steps": [
    { "id": "1", "label": "Step label", "type": "start", "nexts": ["2"], "nextLabels": [""] },
    { "id": "3", "label": "Is condition met?", "type": "decision", "nexts": ["4","2"], "nextLabels": ["Yes","No"] }
  ],
  "weakStepId": "Optional id of the step tied to a known-struggle; omit if none."
}
Rules: 5-10 steps, exactly 1 start, at least 1 end. Decisions have 2 nexts. No em dashes.`

    case 'timeline':
      return `{
  "type": "timeline",
  "title": "Timeline Title",
  "events": [
    { "period": "Date or era", "title": "Event title (<=6 words)", "description": "1 exam-relevant sentence", "isWeakSpot": false }
  ]
}
Rules: 6-10 events chronological. Flag events that align with weak topics. No em dashes.`

    case 'comparison':
      return `{
  "type": "comparison",
  "title": "Comparison Title",
  "items": ["Concept A", "Concept B"],
  "attributes": [{ "name": "Attribute", "values": ["Value A", "Value B"] }],
  "confuseNote": "Optional one-liner naming which two items the student most commonly confuses (from context). Omit if none."
}
Rules: 2-4 items, 5-8 attributes, values match item count. No em dashes.`

    case 'hierarchy':
      return `{
  "type": "hierarchy",
  "title": "Hierarchy Title",
  "root": {
    "label": "Root Concept",
    "note": "",
    "children": [
      { "label": "Sub-concept (<=4 words)", "note": "brief fact", "isWeakSpot": false, "children": [] }
    ]
  }
}
Rules: 2-4 levels deep, 2-5 children per node. Mark weak nodes. No em dashes.`

    default:
      return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, diagramType, courseName, courseId: bodyCourseId, courseContext: legacyCtx } = req.body || {}
  if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' })

  const schema = schemaFor(diagramType, topic.trim())
  if (!schema) return res.status(400).json({ error: 'Invalid diagram type' })

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(gate.userId, courseName)
  if (!courseId) return res.status(400).json({ error: 'Missing courseId (or unique courseName)' })

  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { topic: topic.trim(), request: req })
  } catch (err) {
    console.error('[generate-diagram] getCourseContext failed', err)
    return res.status(400).json({ error: String(err?.message || err) })
  }

  const contextBlock = formatCourseContextForPrompt(brain)
  const supplementBlock = buildClientSupplementBlock(legacyCtx)

  const prompt = `You are drawing a study diagram for a specific student.

${ANTI_GUESSING_RULES}

${contextBlock}${supplementBlock}

DIAGRAM TOPIC: "${topic.trim()}"

Return ONLY valid JSON matching this schema:
${schema}

Grounding requirements:
- Node/branch labels should use the same wording as the student's syllabus or coach plan when possible.
- Where a node matches one of the student's weak topics or recent quiz misses, flag it (isWeakSpot=true, weakStepId, or confuseNote).
- If the topic isn't clearly in the course's material, still return a good general diagram but keep it broad, and skip the weak-spot callouts.
- Prefer terminology and definitions that show up in the syllabus events, emphasis topics, or weak-topic list. Do NOT invent professor-specific jargon.`

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
        max_tokens: 2800,
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
    const resolvedName = brain.identity?.name || courseName || 'this course'
    saveArtifact({
      userId: gate.userId,
      courseId,
      courseName: resolvedName,
      artifactType: 'diagram',
      title: `${topic.trim()} Diagram`,
      topic: topic.trim(),
      payload: { diagram, diagramType },
    }).then(w => { if (!w.ok) console.warn('[generate-diagram] saveArtifact failed', w.error) })
      .catch(err => console.warn('[generate-diagram] saveArtifact threw', err?.message))
    return res.status(200).json({ diagram })
  } catch (e) {
    console.error('[generate-diagram]', e)
    return res.status(500).json({ error: 'Failed to generate diagram. Please try again.' })
  }
}
