import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { checkFeatureRateLimit } from '../lib/server/rateLimit.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { buildClientSupplementBlock } from '../lib/server/courseContextPrompt.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'
import { USER_ERRORS, sendUserError } from '../lib/server/userErrors.js'

export default async function handler(req, res) {
  try {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 4_500_000) return res.status(413).json({ error: 'Payload too large. Try fewer or smaller images.' })

  // predict-grade mode uses simple math on already-submitted data, so it's
  // auth-only. Every other mode runs Claude and consumes a study boost, but the
  // boost is not reserved until the course has resolved. See below.
  const isPredict = req.body?.mode === 'predict-grade'
  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { text, mode, courseName, courseId: bodyCourseId, sessionType, topic, images, professorEmphasis, struggles, learningStyle, courseContext: legacyCtx } = req.body;
  const safeImages = Array.isArray(images) ? images.slice(0, 6).filter(i => i?.data && i?.media_type) : []

  // predict-grade mode does simple math on request-body components; no
  // course context needed. Load context only for AI-generating modes.
  let ctxBlock = ''
  let supplementBlock = ''
  let resolvedCourseId = bodyCourseId || null
  let resolvedCourseName = courseName || 'Unknown Course'
  if (mode !== 'predict-grade') {
    let courseId = bodyCourseId
    if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
    if (!courseId) return sendUserError(res, 'course_required', `generate-study-tools: no courseId resolved (mode=${mode}, courseName=${courseName ?? 'none'})`)
    resolvedCourseId = courseId
    let brain
    try {
      brain = await getCourseContext(auth.userId, courseId, { topic: topic || null, request: req })
    } catch (err) {
      console.error('[generate-study-tools] getCourseContext failed', err)
      return sendUserError(res, 'course_context_failed', err)
    }
    resolvedCourseName = brain.identity?.name || courseName || 'Unknown Course'
    ctxBlock = ANTI_GUESSING_RULES + '\n\n' + formatCourseContextForPrompt(brain)
    supplementBlock = buildClientSupplementBlock(legacyCtx)
  }

  // The course has resolved and the request is well formed, so this is the
  // first point at which it is honest to charge for it.
  //
  // predict-grade stays free, deliberately. It is one Haiku call with
  // max_tokens 1000, about a tenth of a cent, and it is the moment a student
  // sees what the product is for — spending one of a free account's five
  // actions on it would cost more in conversion than it saves.
  //
  // But the comment that used to sit here said predict-grade "does no AI work",
  // and that was simply false: it calls Anthropic like every other mode. Since
  // skipping reserveAiUsage also skips checkAiRateLimit, this was the only AI
  // call in the product with no ceiling of any kind. Free is a pricing choice;
  // unlimited was an accident. It gets its own ceiling instead of the monthly
  // allowance.
  if (isPredict) {
    // NOTE, and re-read this before moving anything expensive onto this path:
    // checkFeatureRateLimit is the ONLY ceiling on this call. There is no
    // reservation behind it. And rateLimit() FAILS OPEN when Redis is
    // unreachable or unconfigured, so a Redis outage removes the limit
    // entirely rather than degrading it.
    //
    // That is an acceptable trade for one Haiku call at max_tokens 1000,
    // roughly a tenth of a cent. It stops being acceptable the moment this
    // branch grows a bigger model, a longer output, or a second provider call.
    // If you are here to make predict-grade do more work, give it a
    // reservation first.
    const limit = await checkFeatureRateLimit(auth.userId, 'predict-grade', { perMinute: 6, perDay: 60 })
    if (!limit.allowed) {
      if (limit.retryAfter) res.setHeader('Retry-After', String(limit.retryAfter))
      return res.status(429).json({ error: limit.error })
    }
  }

  const gate = isPredict ? auth : await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  // ── quick-quiz mode (replaces the old generate-quick-quiz endpoint) ──────────
  if (mode === 'quick-quiz') {
    if (!courseName) return sendUserError(res, 'course_required', 'generate-study-tools: quick-quiz called without courseName')

    const hasTopic = typeof topic === 'string' && topic.trim().length > 0
    const hasText = typeof text === 'string' && text.length > 50
    const hasImages = safeImages.length > 0

    const scopeLine = hasTopic
      ? `The student wants to be quizzed ONLY on this topic. Do not quiz on anything outside it:\n"${topic.trim()}"\n\n`
      : ''
    const sourceLine = hasText
      ? `The student's source material:\n${text.slice(0, 6000)}\n\n`
      : ''
    const imageLine = hasImages
      ? `The student also uploaded ${safeImages.length} image(s) (attached) - treat them as authoritative source material.\n\n`
      : ''

    const emphasisLine = professorEmphasis ? `Professor emphasizes these topics (prioritize these in questions): ${professorEmphasis}\n\n` : ''
    const struggleLine = struggles?.length ? `Student struggles with: ${struggles.join(', ')} - include at least one question testing each struggle area.\n\n` : ''

    const prompt = `You are making a quiz for a student studying ${courseName}${sessionType ? ` (${sessionType} session)` : ''}.

${ctxBlock}${supplementBlock}

${emphasisLine}${struggleLine}${scopeLine}${sourceLine}${imageLine}Generate exactly 5 multiple choice questions.

${hasTopic ? 'EVERY question must directly test the topic above. Do not drift to other material. If a source was provided, the questions must come from content that is inside the source AND inside the topic.' : ''}
${hasText || hasImages ? 'Only quiz on material that is actually present in the source. Do not invent facts.' : ''}

Return ONLY this JSON array with no other text:
[
  {
    "question": "question text",
    "options": ["A. option", "B. option", "C. option", "D. option"],
    "answer": "exact text of correct option including the letter prefix",
    "explanation": "one sentence explanation"
  }
]

Rules:
- Test conceptual understanding, not just surface definitions
- All 4 options must be plausible
- Answer must exactly match one of the options strings
- Explanations must be 1-2 sentences maximum
- When source material is thin, prefer the syllabus, emphasis topics, and weak topics from the context above. Only fall back to canonical course knowledge as a last resort.
- No em dashes in any field`

    const userContent = hasImages
      ? [
          ...safeImages.map(img => ({
            type: 'image',
            source: { type: 'base64', media_type: img.media_type, data: img.data },
          })),
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
        ]
      : [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }]

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
          max_tokens: 1800,
          messages: [{ role: 'user', content: userContent }],
        }),
      })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
      const strippedQ = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '')
      const first = strippedQ.indexOf('[')
      const last = strippedQ.lastIndexOf(']')
      if (first === -1 || last === -1 || last <= first) throw new Error('AI returned malformed quiz. Please try again.')
      const questions = JSON.parse(strippedQ.slice(first, last + 1))

      const LABELS = ['A', 'B', 'C', 'D']
      const shuffled = questions.map(q => {
        const plain = q.options.map(o => o.replace(/^[A-D]\.\s*/, ''))
        for (let i = plain.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [plain[i], plain[j]] = [plain[j], plain[i]]
        }
        const newOptions = plain.map((t, i) => `${LABELS[i]}. ${t}`)
        const correctPlain = q.answer.replace(/^[A-D]\.\s*/, '')
        const newAnswer = newOptions.find(o => o.replace(/^[A-D]\.\s*/, '') === correctPlain) ?? newOptions[0]
        return { ...q, options: newOptions, answer: newAnswer }
      })

      // The work succeeded, so charge for it now. A reservation that never
      // reaches this line costs the user nothing.
      await gate.commit?.()
      return res.status(200).json({ questions: shuffled })
    } catch (error) {
      console.error('Quick quiz error:', error)
      return res.status(500).json({ error: USER_ERRORS.unexpected.error, code: USER_ERRORS.unexpected.code })
    }
  }

  // ── predict-grade mode ────────────────────────────────────────────────────────
  if (mode === 'predict-grade') {
    const { courseName, targetGrade, components } = req.body
    if (!courseName || !components?.length) return sendUserError(res, 'missing_input', 'generate-study-tools: predict-grade missing courseName or components')

    const filled = components.filter(c => c.earnedGrade !== null && c.earnedGrade !== undefined)
    const remaining = components.filter(c => c.earnedGrade === null || c.earnedGrade === undefined)
    const earnedWeight = filled.reduce((s, c) => s + (c.weight || 0), 0)
    const remainingWeight = remaining.reduce((s, c) => s + (c.weight || 0), 0)
    const currentAvg = earnedWeight > 0
      ? filled.reduce((s, c) => s + c.earnedGrade * (c.weight || 0), 0) / earnedWeight
      : null

    const componentLines = components.map(c =>
      `- ${c.name} (${c.weight}%, ${c.type || 'Assignment'}): ${c.earnedGrade !== null && c.earnedGrade !== undefined ? c.earnedGrade + '%' : 'not yet graded'}`
    ).join('\n')

    const TARGET_THRESHOLDS = { A: 80, B: 70, C: 60, 'Pass/Fail': 50 }
    const threshold = TARGET_THRESHOLDS[targetGrade] ?? 73

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
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: `Analyze this student's grade data for ${courseName} and predict their final grade.

Target grade: ${targetGrade} (threshold: ${threshold}%)
Current weighted average on graded work: ${currentAvg !== null ? currentAvg.toFixed(1) + '%' : 'no grades yet'}
Graded weight so far: ${earnedWeight}% of total
Remaining ungraded weight: ${remainingWeight}%

Components:
${componentLines}

Return ONLY this JSON:
{
  "predictedGrade": number,
  "letterGrade": "A+|A|A-|B+|B|B-|C+|C|C-|D|F",
  "status": "on-track|at-risk|needs-recovery",
  "gapToTarget": number,
  "gradeNeededOnRemaining": number,
  "keyFactors": ["factor 1", "factor 2"],
  "recommendations": ["action 1", "action 2", "action 3"],
  "weakAreas": ["component 1", "component 2"]
}

Rules:
- predictedGrade: realistic final grade assuming average performance on remaining work
- gapToTarget: predictedGrade minus ${threshold} (negative = below target)
- gradeNeededOnRemaining: score needed on all remaining work to hit ${threshold}% overall (cap at 100 if impossible)
- status: on-track if predictedGrade >= ${threshold}, at-risk if within 10 points below, needs-recovery if more than 10 below
- keyFactors: 2-3 items, max 10 words each, explain current trajectory
- recommendations: 2-3 specific actionable steps, max 12 words each
- weakAreas: component names where earned grade < 70%, or empty array` }],
        }],
      }),
    })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      const prediction = JSON.parse(content.slice(first, last + 1))
      // The work succeeded, so charge for it now. A reservation that never
      // reaches this line costs the user nothing.
      await gate.commit?.()
      return res.status(200).json({ prediction })
    } catch (error) {
      console.error('Predict grade error:', error)
      return res.status(500).json({ error: USER_ERRORS.unexpected.error, code: USER_ERRORS.unexpected.code })
    }
  }

  // ── default mode: generate flashcards + quiz from notes ───────────────────────
  const hasTopicFc = typeof topic === 'string' && topic.trim().length > 0
  const hasTextFc = typeof text === 'string' && text.length >= 50
  const hasImagesFc = safeImages.length > 0

  if (!hasTopicFc && !hasTextFc && !hasImagesFc) {
    return res.status(400).json({ error: 'Provide a topic, source material, or notes.' });
  }

  const scopeFc = hasTopicFc
    ? `The student asked for flashcards ONLY on this topic - do not go outside it:\n"${topic.trim()}"\n\n`
    : ''
  const sourceFc = hasTextFc
    ? `Source material the student uploaded or wrote:\n${text.slice(0, 8000)}\n\n`
    : ''
  const imagesFc = hasImagesFc
    ? `The student also uploaded ${safeImages.length} image(s), attached - use them as source material.\n\n`
    : ''

  const emphasisFc = professorEmphasis ? `Professor emphasizes these high-priority topics - weight at least 40% of cards toward them: ${professorEmphasis}\n\n` : ''
  const struggleFc = struggles?.length ? `Student struggles with: ${struggles.join(', ')} - make sure these are well-represented in the cards.\n\n` : ''
  const styleFc = learningStyle === 'visual'
    ? 'This student is a visual learner - use analogy-based cards, spatial relationships, and "what would this look like" prompts where helpful.\n\n'
    : learningStyle === 'practice'
    ? 'This student is practice-based - favor scenario and application cards over pure definition recall.\n\n'
    : learningStyle === 'reading'
    ? 'This student learns through reading/writing - include cards that test organized summaries and written explanations.\n\n'
    : ''

  const fcPrompt = `You are an expert study coach building flashcards + a quiz for a specific student.

${ctxBlock}${supplementBlock}

${emphasisFc}${struggleFc}${styleFc}${scopeFc}${sourceFc}${imagesFc}Generate exactly this JSON structure with no extra text:
{
  "flashcards": [
    {"front": "clear question about a key concept", "back": "concise answer - a few words or 1 short sentence", "topic": "topic name", "isWeakTopic": false, "reviewFirst": false}
  ],
  "quiz": [
    {"question": "question text", "type": "multiple_choice", "options": ["A", "B", "C", "D"], "answer": "correct option text", "explanation": "why this is correct", "topic": "topic name"}
  ],
  "startHere": "Optional one-line hint pointing to which flashcard or topic the student should review first, tied to a weak topic or past miss. Omit if no strong signal."
}

${hasTopicFc ? 'EVERY flashcard and quiz question MUST stay strictly inside the requested topic. Do not produce any card that goes outside it. If the topic is narrow, produce fewer but deeper cards - quality over quantity.' : ''}
${hasTextFc || hasImagesFc ? 'Only build cards on material that actually appears in the source. Do not invent facts.' : ''}

Creativity rules (make the cards actually interesting, not robotic):
- Mix card styles: definition recall, "fill in the blank", "which of these is NOT…", scenario-based ("A student argues X - what concept are they missing?"), contrast pairs ("How does X differ from Y?"), causal chains ("If X happens, what follows?"), and compare/contrast.
- Use real-world examples, mini-scenarios, or analogies on the FRONT when it helps memory stick.
- Vary difficulty across the set - some quick recall, some applied reasoning.
- Group related cards by topic so a student feels momentum.

Hard rules:
- Flashcard fronts must be complete questions or prompts - never a single word.
- Flashcard backs must be SHORT - a few words or 1 sentence. Students should instantly self-check.
- Good backs: "Increases shareholder equity", "Assets minus liabilities", "When price exceeds marginal cost".
- Bad backs: long explanations, multiple clauses, anything over 25 words unless truly necessary.
- Generate 15 flashcards and 10 quiz questions (fewer only if the topic is too narrow to support that many - never pad with irrelevant content).
- Quiz wrong answers must be plausible but clearly wrong if you know the material.
- Set isWeakTopic=true and reviewFirst=true on any flashcard whose topic matches a weak topic, recent miss, or struggle from the context above. Aim for at least 3 cards flagged when weak topics exist.
- When source material is thin, prefer the syllabus, emphasis topics, and weak topics from the context above. Only fall back to canonical course knowledge as a last resort.
- No em dashes in any field.`

  const userContentFc = hasImagesFc
    ? [
        ...safeImages.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.media_type, data: img.data },
        })),
        { type: 'text', text: fcPrompt, cache_control: { type: 'ephemeral' } },
      ]
    : [{ type: 'text', text: fcPrompt, cache_control: { type: 'ephemeral' } }]

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
        max_tokens: 4000,
        messages: [{ role: 'user', content: userContentFc }]
      })
    });

    const rawText = await response.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch (e) {
      console.error('[generate-study-tools] Anthropic returned non-JSON:', rawText.slice(0, 500))
      throw new Error('AI service returned an unexpected response. Please try again.')
    }
    const content = data.content?.[0]?.text
    if (!content) {
      console.error('[generate-study-tools] No content. Full Anthropic response:', JSON.stringify(data).slice(0, 500))
      throw new Error(data.error?.message ?? 'Empty AI response')
    }
    console.log('[generate-study-tools] AI content preview:', content.slice(0, 300))
    const stripped = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '')
    const firstBrace = stripped.indexOf('{')
    const lastBrace = stripped.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error('Malformed AI response. Please try again.')
    const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1))

    // Shuffle quiz options so correct answer is evenly distributed across positions
    if (parsed.quiz) {
      parsed.quiz = parsed.quiz.map(q => {
        const opts = [...q.options]
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]]
        }
        return { ...q, options: opts }
      })
    }

    // Semantic deduplication via OpenAI embeddings
    const openaiKey = process.env.OPENAI_API_KEY
    if (openaiKey && parsed.flashcards?.length > 3) {
      try {
        const texts = parsed.flashcards.map(c => c.front ?? c.question ?? '')
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
        })
        if (embRes.ok) {
          const embData = await embRes.json()
          const embeddings = embData.data.map(d => d.embedding)

          // Greedy dedup at 0.90 similarity threshold
          const cosineSim = (a, b) => {
            let dot = 0, nA = 0, nB = 0
            for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; nA += a[i]*a[i]; nB += b[i]*b[i] }
            return dot / (Math.sqrt(nA) * Math.sqrt(nB))
          }
          const kept = [0]
          for (let i = 1; i < parsed.flashcards.length; i++) {
            if (!kept.some(k => cosineSim(embeddings[i], embeddings[k]) >= 0.90)) kept.push(i)
          }
          parsed.flashcards = kept.map(i => parsed.flashcards[i])
        }
      } catch { /* fail open */ }
    }

    if (resolvedCourseId) {
      saveArtifact({
        userId: gate.userId,
        courseId: resolvedCourseId,
        courseName: resolvedCourseName,
        artifactType: 'flashcard_set',
        title: topic ? `${String(topic).slice(0, 60)} Flashcards` : `${resolvedCourseName} Flashcards`,
        topic: topic ? String(topic).slice(0, 200) : null,
        payload: { flashcards: parsed.flashcards, quiz: parsed.quiz, startHere: parsed.startHere },
      }).then(w => { if (!w.ok) console.warn('[generate-study-tools] saveArtifact failed', w.error) })
        .catch(err2 => console.warn('[generate-study-tools] saveArtifact threw', err2?.message))
    }
    // The work succeeded, so charge for it now. A reservation that never
    // reaches this line costs the user nothing.
    await gate.commit?.()
    res.status(200).json(parsed);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: USER_ERRORS.unexpected.error, code: USER_ERRORS.unexpected.code });
  }

  } catch (err) {
    // Top-level catch: ensures unexpected throws (auth, imports, etc.) always return JSON
    console.error('Unhandled error in generate-study-tools:', err)
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
