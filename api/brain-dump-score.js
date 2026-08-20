import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { sendUserError } from '../lib/server/userErrors.js'
import { tracedCall } from '../lib/server/langfuse.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { buildClientSupplementBlock } from '../lib/server/courseContextPrompt.js'
import { recordTopicSignal } from '../lib/server/topicSignals.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'
import { shapeBrainDumpResult, isRetryableWriteFailure } from '../lib/shared/brainDumpResult.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { text, courseName, courseId: bodyCourseId, topic, courseContext: legacyCtx } = req.body || {}
  if (!text) return sendUserError(res, 'missing_input', 'brain-dump-score: no text in body')

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
  if (!courseId) return sendUserError(res, 'course_required', `brain-dump-score: no courseId resolved (courseName=${courseName ?? 'none'})`)

  // Quota is reserved only now, once the request is known to be well formed.
  // It used to be taken at the top of the handler, so a request that was about
  // to be rejected for a missing course still cost the user an AI action.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { topic: topic || null, request: req })
  } catch (err) {
    console.error('[brain-dump-score] getCourseContext failed', err)
    return sendUserError(res, 'course_context_failed', err)
  }

  const resolvedName = brain.identity?.name || courseName || 'this course'
  const wordCount = text.trim().split(/\s+/).length
  const contextBlock = formatCourseContextForPrompt(brain)

  // Whether this dump was actually compared against the student's own
  // uploaded material. Computed here from the retrieved excerpts, never
  // inferred from what the model says it did. getCourseContext returns
  // materials: null when the student has no uploads for this course (or
  // when the killswitch is off), so an empty excerpt list is the single
  // honest test. The results screen keys its entire "You missed" section
  // off this flag: no material, no missed list, no citations.
  const materialExcerpts = Array.isArray(brain.materials?.excerpts) ? brain.materials.excerpts : []
  const comparedAgainstMaterial = materialExcerpts.length > 0
  const materialFiles = [...new Set(materialExcerpts.map(e => e.filename).filter(Boolean))]

  // Prior brain-dump scores from client-passed recentSessions (score history
  // isn't persisted server-side). Text-only history is on brain.sessions.brainDumps.
  const priorDumps = (legacyCtx?.recentSessions ?? [])
    .filter(s => s.tool === 'Brain Dump' && typeof s.score === 'number')
    .slice(0, 3)
  const priorSummary = priorDumps.length
    ? `Prior brain-dump scores in this course: ${priorDumps.map(p => `${p.score}% (${p.dateStr}${p.topic ? `, ${p.topic}` : ''})`).join('; ')}`
    : 'No prior brain-dump scores tracked for this course yet.'

  const supplementBlock = buildClientSupplementBlock(legacyCtx)

  // The covered/missed contract. "covered" is always requested: naming what
  // the student demonstrably wrote is grounded in their own text and needs
  // no uploads. "missed" is only requested when we actually have their
  // material to compare against, because a missed list without material is
  // the model guessing at a syllabus and presenting it as the student's own
  // notes. Any missed array that comes back when comparedAgainstMaterial is
  // false gets dropped below regardless of what the model returned.
  const missedSpec = comparedAgainstMaterial
    ? `  "missed": [
    { "point": "A specific point present in the uploaded material that the dump did not cover", "source": "The exact filename from UPLOADED MATERIALS above, plus a locator such as a page or slide only if the excerpt shows one" }
  ],
`
    : ''

  const missedRules = comparedAgainstMaterial
    ? `- missed: 3 to 5 items, every one drawn from the UPLOADED MATERIALS block above. Never list a point that is not in that material.
- missed[].source: cite the filename exactly as it appears in the [Source: ...] tag. Do not invent page or slide numbers that the excerpt does not show.`
    : `- Do NOT return a "missed" field. There is no uploaded material for this course, so there is nothing of the student's to compare against and any gap list would be a guess.`

  const prompt = `You are the student's academic coach scoring a brain dump exercise for ${resolvedName}.

${ANTI_GUESSING_RULES}

${contextBlock}${supplementBlock}

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
  "covered": ["4 to 6 specific things the student actually demonstrated in the dump above, each a short noun phrase"],
${missedSpec}  "categories": {
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
  "changeSincePrior": "One sentence comparing to prior brain dumps, for example 'up 8 points on Concepts, flat on Connections'. Omit if no prior dumps.",
  "learningStyleTip": "One sentence with the single action the student should take next, framed for their learning style."
}

Rules:
- score: specific integer, never divisible by 5 or 10 (e.g. 67, 71, 83).
- covered: only things genuinely present in the dump text above. If the dump is thin, return fewer items. Never pad the list.
${missedRules}
- category scores: integers 1-10, should vary meaningfully.
- gap: one specific concept or detail they didn't clearly address (grounded in the context, not generic).
- gradeProjection: hedged ("trending toward", "tracking toward"). No definitive claims.
- studyTimeToUpgrade: realistic minutes of focused review to reach upgradeTarget.
- upgradeTarget: one grade tier above the current projection.
- possibleGaps: exactly 3 specific topics grounded in the context above.
- When you name a gap, the concept MUST appear either in the syllabus events, coach-plan emphasis, weak topics, or be a canonical concept for this course. Do not invent professor-specific jargon.
- No em dashes anywhere.`

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

    // Enforce the material contract on the way out. The model is told not to
    // return a missed list without material, but the response is not a
    // trusted channel: shapeBrainDumpResult drops a stray array so it can
    // never reach the results screen and be shown as "your material".
    const shaped = shapeBrainDumpResult(result, {
      comparedAgainstMaterial,
      materialFiles,
      courseName: resolvedName,
    })
    Object.assign(result, shaped)
    if (!comparedAgainstMaterial) delete result.missed

    // The dump's own graded result for the topic the student wrote about.
    // This is the row the Knowledge Map reads to show "Brain Dump 71, today";
    // the brain_dump_gap rows below are unscored evidence of activity and
    // cannot make a topic read Solid on their own. Only written when the
    // student named a topic, because a signal with no topic has nowhere to
    // land on the map.
    const dumpTopic = typeof topic === 'string' ? topic.trim() : ''
    const overallScore = typeof result?.score === 'number' ? result.score : null
    if (dumpTopic && overallScore !== null && courseId) {
      const scoreWrite = await recordTopicSignal({
        userId: gate.userId,
        courseId,
        courseName: resolvedName,
        topic: dumpTopic,
        signalType: 'brain_dump_score',
        rawScore: Math.max(0, Math.min(1, overallScore / 100)),
        metadata: {
          word_count: wordCount,
          compared_against_material: comparedAgainstMaterial,
          material_files: materialFiles.slice(0, 6),
        },
      })
      if (!scoreWrite.ok) console.error('[brain-dump-score] brain_dump_score signal failed', scoreWrite)
      // The client renders "Added to your map." only when this is true, so
      // a failed write must never be reported to the student as a success.
      result.recorded = scoreWrite.ok
      // Whether offering a retry is honest. A check-constraint violation is
      // the shape a missing migration takes, and it will fail identically
      // every time, so the client hides the button rather than looping the
      // student through a failure it cannot resolve.
      result.retryable = scoreWrite.ok ? false : isRetryableWriteFailure(scoreWrite.code)
    } else {
      result.recorded = false
      result.retryable = false
    }

    // Persist each named possibleGap as a brain_dump_gap topic signal.
    // Fire-and-forget style: signal-write failures are logged but never
    // block the user-facing response. courseId here is the stable string
    // resolved above; we never pass a numeric index.
    const gaps = Array.isArray(result?.possibleGaps) ? result.possibleGaps : []
    if (gaps.length && courseId) {
      await Promise.all(gaps.slice(0, 5).map(async (gapTopic) => {
        if (!gapTopic || typeof gapTopic !== 'string') return
        const write = await recordTopicSignal({
          userId: gate.userId,
          courseId,
          courseName: resolvedName,
          topic: gapTopic,
          signalType: 'brain_dump_gap',
          metadata: {
            overall_score: overallScore,
            source_topic: topic || null,
          },
        })
        if (!write.ok) {
          console.error('[brain-dump-score] recordTopicSignal failed', write)
        }
      }))
    }

    // Awaited, unlike the other generator endpoints, because the result
    // screen's retry needs this row's id: it is the only server-side record
    // of the score, and retrying reads the score back from it rather than
    // trusting a number from the client. A failed write is still not fatal,
    // it just means the retry cannot be offered.
    const artifact = await saveArtifact({
      userId: gate.userId,
      courseId,
      courseName: resolvedName,
      artifactType: 'brain_dump',
      title: topic ? `${topic} Brain Dump` : 'Brain Dump',
      topic: topic || null,
      payload: {
        score: result.score,
        covered: result.covered,
        missed: result.missed ?? null,
        comparedAgainstMaterial,
        categories: result.categories,
        gradeProjection: result.gradeProjection,
        studyTimeToUpgrade: result.studyTimeToUpgrade,
        upgradeTarget: result.upgradeTarget,
        possibleGaps: result.possibleGaps,
        syllabusCoverage: result.syllabusCoverage,
        changeSincePrior: result.changeSincePrior,
        learningStyleTip: result.learningStyleTip,
        text_excerpt: String(text || '').slice(0, 2000),
        wordCount,
      },
    }).catch(err => {
      console.warn('[brain-dump-score] saveArtifact threw', err?.message)
      return { ok: false }
    })
    if (!artifact.ok) console.warn('[brain-dump-score] saveArtifact failed', artifact.error)

    result.artifactId = artifact.ok ? artifact.id : null
    // Without the artifact there is nothing for the retry to read the score
    // back out of, so the button cannot be offered honestly.
    if (!result.artifactId) result.retryable = false

    // The work succeeded, so charge for it now. A reservation that never
    // reaches this line costs the user nothing.
    await gate.commit?.()
    return res.status(200).json(result)
  } catch (e) {
    console.error('[brain-dump-score]', e)
    return res.status(500).json({ error: 'Failed to score brain dump. Please try again.' })
  }
}
