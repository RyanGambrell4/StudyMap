import { verifyAndCheckAiUsage, verifyAuth } from '../lib/server/usage.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    phase, courseName, concepts, conceptA, conceptB, question, answer,
    courseContext,
    // Wave 3: cross-course mode. When set, extraCourseContexts is an array
    // of hydrated CourseContext objects for the student's OTHER courses,
    // and the endpoint must generate concept pairs that span courses.
    crossCourse = false,
    extraCourseContexts = [],
  } = req.body
  const ctx = courseContext ?? { courseName }
  const resolvedName = ctx.courseName ?? courseName
  if (!phase || !resolvedName) return res.status(400).json({ error: 'Missing required fields' })

  if (phase === 'score') {
    const auth = await verifyAuth(req)
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  } else {
    const gate = await verifyAndCheckAiUsage(req)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })
  }

  let prompt

  if (phase === 'generate') {
    // Assemble the pool of concepts we know are relevant. In-course mode
    // pulls only from THIS course. Cross-course mode also pulls from every
    // other course context the client supplied, tagged with its origin
    // course name — so the model can build interdisciplinary pairs.
    const conceptsByCourse = new Map()
    const addToCourse = (courseName, arr) => {
      if (!arr) return
      const bucket = conceptsByCourse.get(courseName) ?? new Set()
      arr.forEach(t => { if (t) bucket.add(String(t)) })
      conceptsByCourse.set(courseName, bucket)
    }
    // Home course concepts
    addToCourse(resolvedName, ctx.emphasisTopics)
    addToCourse(resolvedName, concepts)
    addToCourse(resolvedName, ctx.weeklyFocus?.keyTopics)
    addToCourse(resolvedName, (ctx.syllabusEvents ?? []).map(e => e.title))
    addToCourse(resolvedName, (ctx.weakTopics ?? []).map(t => t.topic))

    // Cross-course additions
    if (crossCourse && Array.isArray(extraCourseContexts)) {
      for (const other of extraCourseContexts) {
        const name = other?.courseName
        if (!name || name === resolvedName) continue
        addToCourse(name, other.emphasisTopics)
        addToCourse(name, other.weeklyFocus?.keyTopics)
        addToCourse(name, (other.syllabusEvents ?? []).map(e => e.title))
        addToCourse(name, (other.weakTopics ?? []).map(t => t.topic))
      }
    }

    const poolBlock = [...conceptsByCourse.entries()]
      .map(([course, set]) => {
        const concepts = [...set].slice(0, crossCourse ? 12 : 30)
        return concepts.length ? `${course}:\n${concepts.map(c => `  - ${c}`).join('\n')}` : null
      })
      .filter(Boolean)
      .join('\n\n')

    const contextBlock = buildContextBlock(ctx)
    const guardrails = contextGuardrails(ctx, {
      invention: 'If the concept pool is empty or too small to form real pairs, return an empty "connections" array and set "needsMoreContext": true with a short "reason" string. Do NOT invent generic textbook pairs.',
    })

    const modeBanner = crossCourse
      ? `CROSS-COURSE MODE: build pairs where conceptA and conceptB come from DIFFERENT courses. The whole point is to help the student see the same idea across their curriculum. If cross-course pairs aren't feasible (e.g. only one course has concepts), fall back to in-course pairs and set "fellBackToSingleCourse": true.`
      : `IN-COURSE MODE: both concepts in every pair must come from ${resolvedName}.`

    prompt = `You are generating Connections Mode cards. ${modeBanner}

${contextBlock}

CONCEPT POOL BY COURSE (draw pairs only from these — you may lightly rephrase):
${poolBlock || '(pool is empty — refuse to invent, return needsMoreContext: true)'}

Create 5 concept pairs that have a meaningful, non-obvious relationship the student should be able to articulate. Prioritize pairs where at least one side is a WEAK topic — closing those gaps is the point.

Return ONLY valid JSON:
{
  "connections": [
    {
      "conceptA": "First concept, drawn from the pool",
      "conceptAOrigin": "the course name the concept was drawn from",
      "conceptB": "Second concept, drawn from the pool",
      "conceptBOrigin": "the course name the concept was drawn from",
      "question": "How does [conceptA] relate to [conceptB]?",
      "idealAnswer": "2-3 sentences describing the core relationship, specific to this student's material",
      "whyThisPair": "One short phrase citing why (e.g. 'both cover cell membranes from different angles', 'commonly conflated in Week 3')",
      "bridgeType": "cause-effect" | "sub-category" | "contrast" | "analogous-mechanism" | "shared-principle" | "temporal-sequence",
      "grounding": "emphasis" | "flashcards" | "syllabus" | "weak_topic" | "coach_plan" | "cross_course"
    }
  ],
  "needsMoreContext": false,
  "fellBackToSingleCourse": false
}

Rules:
- Choose pairs that are causally linked, commonly confused, or thematically related in ways students miss.
- Never pair a concept with itself or an obvious synonym.
- bridgeType names the SHAPE of the relationship so the student can learn to spot patterns.
- No em dashes anywhere.

${guardrails}`
  } else if (phase === 'score') {
    if (!conceptA || !conceptB || question === undefined || answer === undefined)
      return res.status(400).json({ error: 'Missing fields for score phase' })

    const contextBlock = buildContextBlock(ctx)

    prompt = `A ${resolvedName} student was asked about the relationship between "${conceptA}" and "${conceptB}".

${contextBlock}

Question: "${question}"
Student's answer: "${answer || '(left blank)'}"

Score their understanding. Return ONLY valid JSON:
{
  "score": 0-100,
  "feedback": "2-3 sentences. Confirm what they got right, name any gap, and make the key relationship clear. If the student's answer echoes a prior known-struggle, acknowledge that.",
  "keyRelationship": "One sentence capturing the core connection",
  "gapTopic": "If the answer reveals a gap, the topic name to log for future review. Null otherwise."
}

Be fair but exacting — a vague answer scores below 60. No em dashes anywhere.`
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
        max_tokens: phase === 'generate' ? 1600 : 600,
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
