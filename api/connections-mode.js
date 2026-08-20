import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { sendUserError } from '../lib/server/userErrors.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { buildClientSupplementBlock } from '../lib/server/courseContextPrompt.js'

// Pull concept candidates out of a CourseContext + optional legacy ctx.
function conceptsFrom(brain, legacyCtx) {
  const out = new Set()
  if (brain?.plan?.emphasisTopics) brain.plan.emphasisTopics.forEach(t => t && out.add(String(t)))
  if (brain?.plan?.weeklyFocus?.length) {
    for (const wk of brain.plan.weeklyFocus) {
      for (const t of (wk?.keyTopics || [])) if (t) out.add(String(t))
    }
  }
  if (brain?.deadlines?.items?.length) {
    for (const d of brain.deadlines.items) if (d?.title) out.add(String(d.title))
  }
  if (brain?.topics?.items?.length) {
    for (const t of brain.topics.items) if (t?.name) out.add(String(t.name))
  }
  if (legacyCtx?.weakTopics) for (const t of legacyCtx.weakTopics) if (t?.topic) out.add(String(t.topic))
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    phase,
    courseName,
    courseId: bodyCourseId,
    concepts,
    conceptA, conceptB, question, answer,
    courseContext: legacyCtx,
    crossCourse = false,
    extraCourseIds = [],
    extraCourseContexts = [],
  } = req.body || {}

  if (!phase) return res.status(400).json({ error: 'Missing required fields' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
  if (!courseId) return sendUserError(res, 'course_required', `connections-mode: no courseId resolved (courseName=${courseName ?? 'none'})`)

  // Quota is reserved only now, once the request is known to be well formed.
  // It used to be taken at the top of the handler, so a request that was about
  // to be rejected for a missing course still cost the user an AI action.
  // The non-AI branch keeps the plain auth result and never reserves.
  const gate = phase === 'score'
    ? auth
    : await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { request: req })
  } catch (err) {
    console.error('[connections-mode] getCourseContext failed', err)
    return sendUserError(res, 'course_context_failed', err)
  }
  const resolvedName = brain.identity?.name || courseName || 'this course'
  const contextBlock = formatCourseContextForPrompt(brain)
  const supplementBlock = buildClientSupplementBlock(legacyCtx)

  let prompt

  if (phase === 'generate') {
    // Pool: home course + optional cross-course, each loaded server-side per
    // courseId with per-course isolation enforced by getCourseContext.
    const conceptsByCourse = new Map()
    conceptsByCourse.set(resolvedName, conceptsFrom(brain, legacyCtx))
    if (Array.isArray(concepts)) {
      const home = conceptsByCourse.get(resolvedName)
      for (const c of concepts) if (c) home.add(String(c))
    }

    if (crossCourse) {
      // Prefer server-side load by extraCourseIds (safe, isolated). Fall back
      // to client-passed extraCourseContexts if no ids provided.
      if (Array.isArray(extraCourseIds) && extraCourseIds.length) {
        for (const otherId of extraCourseIds) {
          if (!otherId || String(otherId) === String(courseId)) continue
          try {
            const other = await getCourseContext(gate.userId, otherId, { request: req })
            const name = other.identity?.name || `course-${otherId}`
            conceptsByCourse.set(name, conceptsFrom(other, null))
          } catch (err) {
            console.warn('[connections-mode] extra course load failed', otherId, err?.message)
          }
        }
      } else if (Array.isArray(extraCourseContexts)) {
        for (const other of extraCourseContexts) {
          const name = other?.courseName
          if (!name || name === resolvedName) continue
          const bag = new Set()
          for (const t of (other.emphasisTopics || [])) if (t) bag.add(String(t))
          for (const t of (other.weeklyFocus?.keyTopics || [])) if (t) bag.add(String(t))
          for (const e of (other.syllabusEvents || [])) if (e?.title) bag.add(String(e.title))
          for (const t of (other.weakTopics || [])) if (t?.topic) bag.add(String(t.topic))
          conceptsByCourse.set(name, bag)
        }
      }
    }

    const poolBlock = [...conceptsByCourse.entries()]
      .map(([course, set]) => {
        const list = [...set].slice(0, crossCourse ? 12 : 30)
        return list.length ? `${course}:\n${list.map(c => `  - ${c}`).join('\n')}` : null
      })
      .filter(Boolean)
      .join('\n\n')

    const modeBanner = crossCourse
      ? `CROSS-COURSE MODE: build pairs where conceptA and conceptB come from DIFFERENT courses. The whole point is to help the student see the same idea across their curriculum. If cross-course pairs aren't feasible (e.g. only one course has concepts), fall back to in-course pairs and set "fellBackToSingleCourse": true.`
      : `IN-COURSE MODE: both concepts in every pair must come from ${resolvedName}.`

    prompt = `You are generating Connections Mode cards. ${modeBanner}

${ANTI_GUESSING_RULES}

${contextBlock}${supplementBlock}

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
- If the concept pool is empty or too small to form real pairs, return an empty "connections" array and set "needsMoreContext": true with a short "reason" string. Do NOT invent generic textbook pairs.
- No em dashes anywhere.`
  } else if (phase === 'score') {
    if (!conceptA || !conceptB || question === undefined || answer === undefined)
      return res.status(400).json({ error: 'Missing fields for score phase' })

    prompt = `A ${resolvedName} student was asked about the relationship between "${conceptA}" and "${conceptB}".

${ANTI_GUESSING_RULES}

${contextBlock}${supplementBlock}

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
    // The work succeeded, so charge for it now. A reservation that never
    // reaches this line costs the user nothing.
    await gate.commit?.()
    return res.status(200).json(JSON.parse(content.slice(first, last + 1)))
  } catch (e) {
    console.error('[connections-mode]', e)
    return res.status(500).json({ error: 'Failed. Please try again.' })
  }
}
