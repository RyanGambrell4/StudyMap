import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Manually load .env file into process.env
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        process.env[key] = value
      }
    }
  })
}

async function anthropicPost(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

function makeHandler(fn) {
  return (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const result = await fn(JSON.parse(body))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (err) {
        console.error('[api]', err)
        res.statusCode = err.statusCode ?? 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err.message }))
      }
    })
  }
}

function apiDevPlugin() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {

      // ── Clean URL routing ─────────────────────────────────────────────────
      server.middlewares.use((req, res, next) => {
        if (req.url === '/app' || req.url?.startsWith('/app?')) {
          req.url = '/app.html' + (req.url.slice(4) || '')
        } else if (req.url === '/signup' || req.url?.startsWith('/signup?')) {
          req.url = '/signup.html' + (req.url.slice(7) || '')
        }
        next()
      })

      // ── /api/generate-session-blueprint ──────────────────────────────────
      server.middlewares.use('/api/generate-session-blueprint', makeHandler(async ({ courseName, sessionType, durationMinutes, examDate, targetGrade, uploadedTopics, studentFocus }) => {
        if (!courseName || !durationMinutes) {
          const err = new Error('Missing required fields'); err.statusCode = 400; throw err
        }
        const todayStr = new Date().toISOString().split('T')[0]
        const daysUntilExam = examDate
          ? Math.max(0, Math.round((new Date(examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000))
          : 30
        const data = await anthropicPost({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are an expert academic study strategist designing a focused, structured study session. Your goal is to help the student walk in knowing exactly what to tackle and walk out having made real progress.

Course: ${courseName}
Session type: ${sessionType}
Total duration: ${durationMinutes} minutes
Days until exam: ${daysUntilExam}
Target grade: ${targetGrade || 'B'}
Available study materials/topics: ${uploadedTopics || 'General course material'}
Student wants to focus on: ${studentFocus || 'Most important exam topics'}

Design a structured study session broken into specific timed blocks. Each block should have a clear purpose that builds toward the student's goal. Return ONLY this JSON:

{
  "sessionTitle": "short motivating session name",
  "objective": "one sentence: what the student will achieve in this session",
  "blocks": [
    {
      "blockNumber": 1,
      "title": "block name",
      "duration": 5,
      "activity": "one of: review, active-recall, flashcards, practice-problems, summary, break",
      "instruction": "specific 1-2 sentence instruction for exactly what to do",
      "why": "one sentence explaining why this block matters for the exam"
    }
  ],
  "successNote": "one encouraging sentence for when the session is complete"
}

Rules:
- Total block durations must add up to exactly ${durationMinutes} minutes
- Start with a short 5-min warm-up block
- End with a 5-10 min summary block
- Middle blocks alternate between review and active-recall or practice
- If exam is less than 7 days away, weight heavily toward practice and recall
- Include a 5-min break block if session is over 50 minutes, after the halfway point`,
          }],
        })
        const content = data.content[0].text
        const first = content.indexOf('{')
        const last = content.lastIndexOf('}')
        return JSON.parse(content.slice(first, last + 1))
      }))

      // ── /api/generate-study-coach-plan ───────────────────────────────────────
      server.middlewares.use('/api/generate-study-coach-plan', makeHandler(async ({ courseName, goal, emphasisTopics, importantDates, daysPerWeek, sessionMinutes }) => {
        if (!courseName || !goal) {
          const err = new Error('Missing required fields'); err.statusCode = 400; throw err
        }
        const todayStr = new Date().toISOString().split('T')[0]
        const datesStr = importantDates?.length
          ? importantDates.map(d => `${d.label} — ${d.date}`).join('\n')
          : 'No specific dates provided'
        const data = await anthropicPost({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: `You are an expert academic strategist building a comprehensive, week-by-week study plan for a student.

Course: ${courseName}
Student's goal: ${goal}
Topics the professor emphasizes: ${emphasisTopics || 'Not specified'}
Available study days per week: ${daysPerWeek || 3}
Typical session length: ${sessionMinutes || 60} minutes
Today's date: ${todayStr}

Important upcoming dates:
${datesStr}

Build a focused, realistic study plan starting from today. Generate enough weeks to cover all important dates, with the right session count per week (${daysPerWeek || 3} sessions/week).

Return ONLY this JSON:

{
  "summary": "2-3 sentence overview of the study strategy and why it fits this student's goal",
  "weeklyFocus": [
    {
      "week": "Week of [Month Day]",
      "theme": "what this week is fundamentally about",
      "sessions": [
        {
          "sessionLabel": "Session 1",
          "focusArea": "specific topic or concept to cover this session",
          "goal": "what the student should be able to do or understand by the end of this session",
          "keyTopics": ["specific topic 1", "specific topic 2", "specific topic 3"],
          "studyMethod": "recommended approach — e.g. Active recall + practice problems",
          "duration": ${sessionMinutes || 60}
        }
      ]
    }
  ],
  "priorityTopics": ["most important topic 1", "most important topic 2", "most important topic 3", "most important topic 4", "most important topic 5"],
  "warningZones": ["thing student is likely to neglect 1", "thing student is likely to underestimate 2", "common mistake 3"]
}

Rules:
- Generate exactly ${daysPerWeek || 3} sessions per week
- Make focusArea and keyTopics highly specific to the course content, not generic
- Make studyMethod specific and actionable
- warningZones should be honest and specific
- If there are important dates, weight the weeks before them appropriately
- Generate enough weeks to cover all listed dates plus 1-2 weeks before the last one`,
          }],
        })
        const content = data.content[0].text
        const first = content.indexOf('{')
        const last = content.lastIndexOf('}')
        return JSON.parse(content.slice(first, last + 1))
      }))

      // ── /api/generate-study-tools ─────────────────────────────────────────
      server.middlewares.use('/api/generate-study-tools', makeHandler(async ({ text }) => {
        if (!text || text.length < 50) {
          const err = new Error('Not enough text content'); err.statusCode = 400; throw err
        }
        const data = await anthropicPost({
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
- Focus on concepts students will actually be tested on`,
          }],
        })
        const content = data.content[0].text
        const firstBrace = content.indexOf('{')
        const lastBrace = content.lastIndexOf('}')
        const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1))
        // Shuffle quiz options so correct answer is evenly distributed
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
        return parsed
      }))

      // ── /api/generate-quick-quiz ─────────────────────────────────────────
      server.middlewares.use('/api/generate-quick-quiz', makeHandler(async ({ courseName, sessionType, text }) => {
        if (!courseName) {
          const err = new Error('Missing courseName'); err.statusCode = 400; throw err
        }
        const context = text && text.length > 50
          ? `Based on these notes for ${courseName}:\n${text.slice(0, 4000)}\n\n`
          : `Course: ${courseName}\nSession type: ${sessionType}\n\n`
        const data = await anthropicPost({
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
        })
        const content = data.content[0].text
        const first = content.indexOf('[')
        const last = content.lastIndexOf(']')
        const questions = JSON.parse(content.slice(first, last + 1))
        // Shuffle options so correct answer is evenly distributed across A/B/C/D
        const LABELS = ['A', 'B', 'C', 'D']
        const shuffled = questions.map(q => {
          const plain = q.options.map(o => o.replace(/^[A-D]\.\s*/, ''))
          for (let i = plain.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [plain[i], plain[j]] = [plain[j], plain[i]]
          }
          const newOptions = plain.map((text, i) => `${LABELS[i]}. ${text}`)
          const correctPlain = q.answer.replace(/^[A-D]\.\s*/, '')
          const newAnswer = newOptions.find(o => o.replace(/^[A-D]\.\s*/, '') === correctPlain) ?? newOptions[0]
          return { ...q, options: newOptions, answer: newAnswer }
        })
        return { questions: shuffled }
      }))

      // ── /api/extract-syllabus-events ──────────────────────────────────────
      server.middlewares.use('/api/extract-syllabus-events', makeHandler(async ({ text }) => {
        if (!text || text.length < 50) {
          const err = new Error('Not enough text'); err.statusCode = 400; throw err
        }
        const data = await anthropicPost({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Extract all academic deadlines and important dates from this course syllabus.

Syllabus text:
${text.slice(0, 6000)}

Return ONLY a JSON array. Extract every assignment, quiz, exam, project, presentation, and deadline you can find. For recurring items like "weekly quizzes", create one entry with the note "recurring weekly".

For each item return:
{
  "name": "clear short name like 'Midterm Exam' or 'Group Project Due'",
  "date": "YYYY-MM-DD format, use current year if not specified",
  "type": "one of: Exam, Midterm, Assignment, Project, Quiz, Lab, Other",
  "weight": "percentage as number if mentioned, null if not",
  "notes": "any extra details like time or location, null if none"
}

Return ONLY the JSON array with no other text. Example:
[{"name": "Midterm Exam", "date": "2026-02-12", "type": "Midterm", "weight": 20, "notes": "In Class"}]`,
          }],
        })
        const content = data.content[0].text
        const firstBracket = content.indexOf('[')
        const lastBracket = content.lastIndexOf(']')
        const events = JSON.parse(content.slice(firstBracket, lastBracket + 1))
        return { events }
      }))

    },
  }
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        app: path.resolve(process.cwd(), 'app.html'),
        signup: path.resolve(process.cwd(), 'signup.html'),
      },
    },
  },
})
