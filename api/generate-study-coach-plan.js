import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import {
  ANTI_GUESSING_RULES,
  NO_STUDENT_CONTENT_DIRECTIVE,
  isGroundedInStudent,
  isMethodOnly,
} from '../lib/server/coachAntiGuessing.js'

// ─── Calendar helpers ────────────────────────────────────────────────────────
// LLMs are unreliable at calendar math (Monday of week N, weeks-until-exam,
// phase boundaries). We compute the week scaffold deterministically here and
// hand it to the model so it only has to fill in content.

const MS_PER_DAY = 86400000
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

const toISO = (d) => d.toISOString().split('T')[0]

function parseISO(s) {
  if (!ISO_RE.test(s)) return null
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function mondayOf(d) {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const dow = out.getDay() // 0=Sun..6=Sat
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1))
  return out
}

function addDays(d, n) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildScaffold(importantDates, isExamMode) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const firstMonday = mondayOf(today)

  const milestones = (importantDates || [])
    .map((d) => ({ label: d.label, date: d.date, parsed: parseISO(d.date) }))
    .filter((d) => d.parsed && d.parsed >= today)
    .sort((a, b) => a.parsed - b.parsed)

  // Horizon: a buffer week past the last milestone, else a sensible default.
  let horizonEnd
  if (milestones.length) {
    horizonEnd = addDays(milestones[milestones.length - 1].parsed, 7)
  } else {
    horizonEnd = addDays(firstMonday, (isExamMode ? 8 : 6) * 7)
  }

  // 2–16 week clamp keeps the plan scannable and within the token budget.
  const horizonMonday = mondayOf(horizonEnd)
  const rawWeeks = Math.round((horizonMonday - firstMonday) / (MS_PER_DAY * 7)) + 1
  const totalWeeks = Math.max(2, Math.min(16, rawWeeks))

  const weeks = []
  for (let i = 0; i < totalWeeks; i++) {
    const mon = addDays(firstMonday, i * 7)
    const sun = addDays(mon, 6)
    const milestonesInWeek = milestones.filter((d) => d.parsed >= mon && d.parsed <= sun)
    weeks.push({
      index: i + 1,
      startDate: toISO(mon),
      endDate: toISO(sun),
      label: `Week of ${fmtShort(mon)}`,
      milestones: milestonesInWeek.map((d) => `${d.label} on ${toISO(d.parsed)}`),
    })
  }

  return { weeks, milestones, totalWeeks }
}

// 4-phase exam ramp: foundation → practice → official material → final crunch.
// Allocation aims for 30 / 30 / 25 / 15 with a minimum of 1 week per phase
// when enough weeks exist, and a graceful collapse below 4 weeks.
function buildPhaseMap(totalWeeks) {
  if (totalWeeks <= 0) return {}
  if (totalWeeks === 1) return { 1: 4 }
  if (totalWeeks === 2) return { 1: 2, 2: 4 }
  if (totalWeeks === 3) return { 1: 1, 2: 2, 3: 4 }

  let p1 = Math.max(1, Math.round(totalWeeks * 0.30))
  let p2 = Math.max(1, Math.round(totalWeeks * 0.30))
  let p3 = Math.max(1, Math.round(totalWeeks * 0.25))
  while (p1 + p2 + p3 >= totalWeeks) {
    if (p3 > 1) p3--
    else if (p2 > 1) p2--
    else if (p1 > 1) p1--
    else break
  }
  const p4 = totalWeeks - (p1 + p2 + p3)

  const map = {}
  let w = 1
  for (let i = 0; i < p1; i++) map[w++] = 1
  for (let i = 0; i < p2; i++) map[w++] = 2
  for (let i = 0; i < p3; i++) map[w++] = 3
  for (let i = 0; i < p4; i++) map[w++] = 4
  return map
}

// ─── Output validation / repair ──────────────────────────────────────────────
// Force the parsed plan onto the deterministic scaffold so dates, week count,
// and session count per week are always sound regardless of what the model
// returned. Content (focusArea, goal, keyTopics, studyMethod) is preserved.
function repairPlan(plan, scaffold, sessionsPerWeek, sessionMinutes, phaseMap, studentTextBag = '') {
  const incoming = Array.isArray(plan?.weeklyFocus) ? plan.weeklyFocus : []
  // Per-invocation copy of neutral traps so concurrent requests don't
  // drain a shared pool.
  const neutralTraps = [
    'Cramming without retrieval practice',
    'Skipping cumulative review across weeks',
    'Passive rereading instead of active recall',
  ]
  // Predicate used to scrub any keyTopics / priorityTopics that the model
  // invented despite the system prompt. If the term does not appear in the
  // student's raw text at all AND is not obviously method language, drop it.
  const passTopic = (t) => {
    const s = String(t || '').trim()
    if (!s) return false
    if (studentTextBag && isGroundedInStudent(s, studentTextBag)) return true
    return isMethodOnly(s)
  }
  const weeklyFocus = scaffold.weeks.map((w, i) => {
    const src = incoming[i] || {}
    let sessions = Array.isArray(src.sessions) ? src.sessions.slice(0, sessionsPerWeek) : []

    // Pad short weeks with a recall slot rather than leaving them empty.
    while (sessions.length < sessionsPerWeek) {
      sessions.push({
        sessionLabel: `Session ${sessions.length + 1}`,
        focusArea: 'Active recall on this week\'s topic',
        goal: 'Self-test on what was covered this week',
        keyTopics: [],
        studyMethod: 'Active recall + practice problems',
        duration: sessionMinutes,
      })
    }

    const phase = phaseMap[w.index]
    const defaultTheme = phase
      ? `Phase ${phase}: ${['Content foundation', 'Practice and passages', 'Official material focus', 'Final crunch'][phase - 1]}`
      : (w.milestones.length ? `Prep for ${w.milestones[0]}` : 'Build mastery on priority topics')

    return {
      week: typeof src.week === 'string' && src.week.trim() ? src.week.trim() : w.label,
      startDate: w.startDate,
      endDate: w.endDate,
      theme: typeof src.theme === 'string' && src.theme.trim() ? src.theme.trim() : defaultTheme,
      sessions: sessions.map((s, j) => ({
        sessionLabel: s.sessionLabel || `Session ${j + 1}`,
        // Focus area: keep as-is if grounded in student text OR method-only;
        // otherwise degrade to the neutral "Active recall on this week's material".
        focusArea: (() => {
          const raw = String(s.focusArea || '').trim()
          if (!raw) return 'Active recall on this week\'s material'
          if (studentTextBag && (isGroundedInStudent(raw, studentTextBag) || isMethodOnly(raw))) return raw
          if (!studentTextBag && isMethodOnly(raw)) return raw
          return 'Active recall on this week\'s material'
        })(),
        goal: String(s.goal || '').trim() || 'Retrieve and apply key concepts',
        // keyTopics: filter out anything the student never mentioned.
        keyTopics: Array.isArray(s.keyTopics)
          ? s.keyTopics.slice(0, 4).map((t) => String(t).slice(0, 60)).filter(passTopic)
          : [],
        studyMethod: String(s.studyMethod || 'Active recall').trim() || 'Active recall',
        duration: Number.isFinite(Number(s.duration)) ? Number(s.duration) : sessionMinutes,
        ...(s.sessionType ? { sessionType: String(s.sessionType) } : {}),
      })),
    }
  })

  return {
    summary: typeof plan?.summary === 'string' ? plan.summary.trim() : '',
    weeklyFocus,
    // priorityTopics MUST be grounded in student text. If the student named
    // zero topics, this is empty — better than fabricated. Method-only entries
    // are dropped too (priorityTopics is for topics, not methods).
    priorityTopics: Array.isArray(plan?.priorityTopics)
      ? plan.priorityTopics
          .slice(0, 5)
          .map((t) => String(t).slice(0, 60))
          .filter(t => studentTextBag ? isGroundedInStudent(t, studentTextBag) : false)
      : [],
    // warningZones are generic study-method traps only. Anything that looks
    // like subject matter gets replaced with a neutral method trap.
    warningZones: Array.isArray(plan?.warningZones)
      ? plan.warningZones
          .slice(0, 3)
          .map((t) => {
            const raw = String(t).slice(0, 90).trim()
            if (!raw) return null
            if (isMethodOnly(raw)) return raw
            // Not method-like — swap for a neutral trap so we never leak
            // fabricated subject content into the warning list.
            return neutralTraps.shift() ?? 'Passive rereading instead of active recall'
          })
          .filter(Boolean)
      : [],
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const {
    courseName,
    goal,
    emphasisTopics,
    importantDates,
    daysPerWeek,
    sessionMinutes,
    calendarEvents,
    timePreference,
    struggles,
    gradeGap,
    weakAreas,
    courseMaterials,
    learningStyle,
    strengths,
    courseRecallScores,
  } = req.body || {}

  if (!courseName || !goal) return res.status(400).json({ error: 'Missing required fields' })

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|Reading Comprehension|FAR|AUD|REG|MBE|MEE|MPT|Verbal Reasoning|Quantitative Reasoning|Analytical Writing|Quantitative|Data Insights/i
  const isExamMode = EXAM_PATTERN.test(courseName)

  const sessionsPerWeek = Math.max(1, Math.min(7, Number(daysPerWeek) || (isExamMode ? 5 : 3)))
  const sessionLen = Math.max(15, Math.min(240, Number(sessionMinutes) || (isExamMode ? 90 : 60)))

  const scaffold = buildScaffold(importantDates, isExamMode)
  const phaseMap = isExamMode ? buildPhaseMap(scaffold.totalWeeks) : {}

  const TIME_WINDOWS = {
    Morning: { label: 'morning', hours: '6am–12pm' },
    Afternoon: { label: 'afternoon', hours: '12pm–6pm' },
    Evening: { label: 'evening', hours: '6pm–10pm' },
  }
  const pref = TIME_WINDOWS[timePreference] ?? TIME_WINDOWS.Morning

  const calendarStr = calendarEvents?.length
    ? calendarEvents.slice(0, 50).map((e) => {
        if (e.allDay || !e.start?.includes('T')) {
          return `- ${e.start?.split('T')[0] ?? ''}: ${e.title} (all day)`
        }
        const sDate = new Date(e.start)
        const eDate = e.end ? new Date(e.end) : null
        const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        return `- ${e.start.split('T')[0]}: ${e.title} (${fmt(sDate)}–${eDate ? fmt(eDate) : 'end unknown'})`
      }).join('\n')
    : null

  const recallLine = (() => {
    if (!courseRecallScores) return ''
    const entries = Object.entries(courseRecallScores)
      .filter(([_, score]) => score !== null)
      .map(([course, score]) => `${course}: ${score}% recall`)
    return entries.length
      ? `Recall scores by course (lower = needs more reps): ${entries.join(', ')}.`
      : ''
  })()

  const hasUserTopics = !!(emphasisTopics && emphasisTopics.trim())
  const hasUserMaterials = !!(courseMaterials && courseMaterials.trim())
  const ungrounded = !hasUserTopics && !hasUserMaterials

  // Compact, deterministic week list the model fills in.
  const weeksBlock = scaffold.weeks.map((w) => {
    const phase = phaseMap[w.index]
    const tag = phase ? ` [Phase ${phase}]` : ''
    const ms = w.milestones.length ? ` - milestones: ${w.milestones.join('; ')}` : ''
    return `${w.index}. ${w.label} (${w.startDate} → ${w.endDate})${tag}${ms}`
  }).join('\n')

  // Static rules / schema - cacheable across all student inputs.
  const systemPrompt = `You are an elite study strategist who builds week-by-week study plans grounded in evidence-based learning science: retrieval practice (Karpicke), spaced repetition, interleaving, deliberate practice, and the testing effect.

Hard rules you ALWAYS follow:
- Output ONLY valid JSON. No prose before or after.
- You will be given an exact list of weeks with locked startDate/endDate and (in exam mode) a locked phase number. You MUST output exactly one object per week, in order, copying its startDate and endDate verbatim.
- Generate exactly the requested number of sessions per week. Never more, never fewer.
- Vary studyMethod across the week. Do NOT use the same method for every session. A good week mixes new-content learning, retrieval practice, mixed problem-solving, and a cumulative review of prior weeks.
- From week 2 onwards, at least one session per week MUST be cumulative review of weak topics from earlier weeks (label its focusArea like "Cumulative recall: <earlier topic>"). This is non-negotiable - spaced retrieval is what makes plans work.
- Each session is a single, concrete activity the student can sit down and execute today. No vague "study the chapter" instructions.
- Earlier weeks introduce content; later weeks compress to retrieval, problem-sets, and timed practice. Intensity ramps as milestones approach.
- focusArea is what appears on a calendar row. Keep it ≤ 5 words for course plans, ≤ 8 words for exam plans, and never end mid-word.
- goal is the outcome of the session in one short sentence (≤ 12 words). Phrase it as something the student can verify they hit ("Can explain X without notes", "Solved 10 mixed problems in under 30m").
- keyTopics: 2–4 specific items, ≤ 4 words each.
- studyMethod: pick ONE concrete technique per session. Allowed vocabulary: "Active recall", "Spaced retrieval", "Practice problems", "Mixed problem set", "Concept map", "Feynman explanation", "Flashcards", "Worked examples", "Past exam questions", "Timed drill", "Cumulative review", "Mock test", "Test review".
- sessionType: include one of: "New content", "Retrieval", "Practice", "Cumulative review", "Weak area", "Mock test", "Test review".
- warningZones: 3 items, ≤ 10 words each. MUST be generic study-method traps only (e.g., "Cramming without retrieval practice", "Skipping cumulative review", "Passive rereading over active recall"). NEVER subject-specific.
- priorityTopics: up to 5 items, ≤ 5 words each. Each item MUST appear (case-insensitive) in the student inputs below. Fewer items is better than fabricated items. If the student named zero topics, priorityTopics MUST be an empty array.
- keyTopics per session: each entry MUST appear (case-insensitive) in the student inputs below. Emit an empty array rather than invent.

${ANTI_GUESSING_RULES}

Return JSON in exactly this shape:
{
  "summary": "2–3 sentences explaining the strategy and why it fits this student.",
  "weeklyFocus": [
    {
      "week": "Week of [Month Day]",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "theme": "what this week is fundamentally about (start with 'Phase N:' in exam mode)",
      "sessions": [
        {
          "sessionLabel": "Session 1",
          "focusArea": "short topic or activity",
          "goal": "verifiable outcome for the session",
          "keyTopics": ["topic 1", "topic 2", "topic 3"],
          "studyMethod": "one concrete method from the allowed list",
          "sessionType": "one of the allowed types",
          "duration": 60
        }
      ]
    }
  ],
  "priorityTopics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "warningZones": ["trap 1", "trap 2", "trap 3"]
}`

  // Dynamic per-student payload.
  const userPrompt = `MODE: ${isExamMode ? 'High-stakes licensing/admissions exam' : 'University course'}

Course / section: ${courseName}
Student's goal (verbatim): ${goal}
Sessions per week: ${sessionsPerWeek}
Session length: ${sessionLen} minutes
Topics emphasized by the professor / exam blueprint: ${emphasisTopics || 'Not specified'}
Learning style: ${learningStyle || 'Not specified - pick mixed methods'}
Preferred study window: ${pref.label} (${pref.hours})
${calendarStr ? `\nKnown blocked time on the student's calendar (informational; the app schedules around these - you do NOT need to assign day-of-week):\n${calendarStr}\n` : ''}
Struggle areas (allocate more reps and resurface in later weeks): ${struggles?.length ? struggles.join(', ') : 'None reported'}
Strong areas (one review session is enough): ${strengths || 'None reported'}
${gradeGap != null && gradeGap < 0 ? `GRADE ALERT: student is ${Math.abs(gradeGap).toFixed(1)} points below target. Treat recovery as the primary objective.` : ''}
${weakAreas?.length ? `Graded components currently below 70%: ${weakAreas.join(', ')}.` : ''}
${recallLine}

${ungrounded ? NO_STUDENT_CONTENT_DIRECTIVE : ''}
${courseMaterials ? `Course material the student uploaded (use to ground specific topics; do not exceed the actual content):\n${String(courseMaterials).slice(0, 8000)}` : ''}

WEEK SCAFFOLD - generate exactly one weeklyFocus object per row below, in order, copying startDate and endDate verbatim. In exam mode, the theme must start with the locked phase label.
${weeksBlock}

${isExamMode ? `Phase intent reminder:
- Phase 1 (Content foundation): systematic content review + active recall drills on new material.
- Phase 2 (Practice and passages): build accuracy and speed with passage / problem blocks; start mixing prior content.
- Phase 3 (Official material focus): work through official prep materials, full-length sections, FL review sessions.
- Phase 4 (Final crunch): timed mock tests, weak-area re-attack, test-review sessions, taper at the very end.
` : ''}
No em dashes in any text field.
Output the JSON now.`

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
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message ?? `Anthropic API error ${response.status}`)
    }
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty response from AI')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('AI response was not valid JSON')

    let raw
    try {
      raw = JSON.parse(content.slice(first, last + 1))
    } catch (e) {
      throw new Error('Could not parse plan JSON: ' + e.message)
    }

    // Bag of every string the student contributed. Used by repairPlan to
    // scrub any keyTopics / priorityTopics / focusArea that the model
    // invented despite the anti-guessing rules.
    const studentTextBag = [
      goal,
      emphasisTopics,
      courseMaterials,
      Array.isArray(struggles) ? struggles.join('\n') : struggles,
      Array.isArray(weakAreas) ? weakAreas.join('\n') : weakAreas,
      strengths,
    ].filter(Boolean).join('\n')

    const plan = repairPlan(raw, scaffold, sessionsPerWeek, sessionLen, phaseMap, studentTextBag)
    res.status(200).json(plan)
  } catch (error) {
    console.error('Study coach plan error:', error)
    res.status(500).json({ error: error.message ?? 'Internal server error' })
  }
}
