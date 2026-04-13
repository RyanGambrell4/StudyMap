export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const verifyRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' })

  const { text, mode, courseName, sessionType } = req.body;

  // ── quick-quiz mode (replaces the old generate-quick-quiz endpoint) ──────────
  if (mode === 'quick-quiz') {
    if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

    const context = text && text.length > 50
      ? `Based on these notes for ${courseName}:\n${text.slice(0, 4000)}\n\n`
      : `Course: ${courseName}\nSession type: ${sessionType}\n\n`

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
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `${context}Generate exactly 5 multiple choice quiz questions for a mid-session check on ${courseName} (${sessionType} session).

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
- Test conceptual understanding, not just definitions
- All 4 options must be plausible
- Answer must exactly match one of the options strings
- Explanations must be 1-2 sentences maximum`,
          }],
        }),
      })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
      const first = content.indexOf('[')
      const last = content.lastIndexOf(']')
      const questions = JSON.parse(content.slice(first, last + 1))

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

      return res.status(200).json({ questions: shuffled })
    } catch (error) {
      console.error('Quick quiz error:', error)
      return res.status(500).json({ error: error.message ?? 'Internal server error' })
    }
  }

  // ── predict-grade mode ────────────────────────────────────────────────────────
  if (mode === 'predict-grade') {
    const { courseName, targetGrade, components } = req.body
    if (!courseName || !components?.length) return res.status(400).json({ error: 'Missing required fields' })

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

    const TARGET_THRESHOLDS = { A: 93, B: 83, C: 73, 'Pass/Fail': 60 }
    const threshold = TARGET_THRESHOLDS[targetGrade] ?? 83

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
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Analyze this student's grade data for ${courseName} and predict their final grade.

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
- weakAreas: component names where earned grade < 70%, or empty array`,
          }],
        }),
      })
      const data = await response.json()
      const content = data.content?.[0]?.text
      if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      const prediction = JSON.parse(content.slice(first, last + 1))
      return res.status(200).json({ prediction })
    } catch (error) {
      console.error('Predict grade error:', error)
      return res.status(500).json({ error: error.message ?? 'Internal server error' })
    }
  }

  // ── default mode: generate flashcards + quiz from notes ───────────────────────
  if (!text || text.length < 50) {
    return res.status(400).json({ error: 'Not enough text content' });
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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert academic tutor. Based on these lecture notes/slides, generate study materials as JSON.

Content:
${text.slice(0, 8000)}

Generate exactly this JSON structure with no extra text:
{
  "flashcards": [
    {"front": "clear question about a key concept", "back": "concise answer — a few words or 1 short sentence", "topic": "topic name"}
  ],
  "quiz": [
    {"question": "question text", "type": "multiple_choice", "options": ["A", "B", "C", "D"], "answer": "correct option text", "explanation": "why this is correct"}
  ]
}

Rules:
- Generate 15 flashcards testing real concepts, definitions, and formulas
- Generate 10 quiz questions
- Flashcard fronts must be complete questions like "What is market capitalization?" not single words
- Flashcard backs must be SHORT — a few words or 1 sentence maximum. If the answer can be expressed in 3-5 words, do that. Students should be able to instantly check if they were right.
- Good back examples: "Increases shareholder equity", "Assets minus liabilities", "When price exceeds marginal cost"
- Bad back examples: long explanations with multiple clauses, full paragraphs, anything over 20 words unless truly necessary
- Quiz wrong answers must be plausible but clearly wrong if you know the material
- Never use single words like "Investors" or "What" as a flashcard front
- Focus on concepts students will actually be tested on`
        }]
      })
    });

    const data = await response.json();
    const content = data.content?.[0]?.text
    if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')
    const cleaned = content.slice(firstBrace, lastBrace + 1)
    const parsed = JSON.parse(cleaned)

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

    res.status(200).json(parsed);
  } catch (error) {
    console.error('API error:', error);
    console.error(error)
    res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
