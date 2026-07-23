// courseContextPrompt.js — server-side helpers that turn the CourseContext
// packet (built client-side by src/lib/courseContext.js) into a consistent
// block of grounding text every study-feature endpoint can quote.
//
// Keeping the wording centralized here means "the student's course context"
// looks and feels identical across Quiz Burst, Cheat Sheet, Diagrams, etc. —
// so the LLM's grounding behavior is uniform.

/**
 * Render the student's course context into a block the LLM can quote.
 * Empty-safe — missing fields are just omitted, not represented as "unknown".
 */
export function buildContextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return 'STUDENT CONTEXT: unavailable.'
  const lines = ['STUDENT + COURSE CONTEXT (ground everything you write in this):']

  if (ctx.courseName) lines.push(`- Course: ${ctx.courseName}`)
  if (ctx.courseId != null) lines.push(`- Course ID: ${ctx.courseId}`)
  if (ctx.firstName) lines.push(`- Student: ${ctx.firstName}`)
  if (ctx.yearLevel) lines.push(`- Year: ${ctx.yearLevel}`)
  if (ctx.learningStyle) lines.push(`- Learning style: ${ctx.learningStyle}`)
  if (ctx.targetGrade != null) lines.push(`- Target grade: ${ctx.targetGrade}%`)
  if (ctx.currentGradePct != null) {
    const gap = ctx.gradeGap
    const gapNote = gap == null ? '' : gap > 0 ? ` (${gap.toFixed(1)} pts below target)` : ` (${Math.abs(gap).toFixed(1)} pts above target)`
    lines.push(`- Current grade: ${ctx.currentGradePct}%${gapNote}`)
  }
  if (ctx.examDate) {
    const title = ctx.nextExamTitle ?? 'Next exam'
    lines.push(`- ${title}: ${ctx.examDate}${ctx.daysUntilExam != null ? ` (${ctx.daysUntilExam} days away)` : ''}`)
  }
  if (ctx.upcomingDeadlines?.length) {
    lines.push('- Upcoming deadlines:')
    for (const d of ctx.upcomingDeadlines.slice(0, 6)) {
      lines.push(`    · ${d.dateStr}: ${d.title}`)
    }
  }
  if (ctx.studyGoal) lines.push(`- Stated study goal: ${ctx.studyGoal}`)
  if (ctx.recentRecallAvg != null) {
    lines.push(`- Recent self-rated confidence: ${ctx.recentRecallAvg}/5 average across last 10 tap-ins`)
  }

  if (ctx.emphasisTopics?.length) {
    lines.push(`- Professor emphasis: ${ctx.emphasisTopics.join(', ')}`)
  }
  if (ctx.struggles?.length) {
    lines.push(`- Struggles the student has told us about: ${ctx.struggles.join(', ')}`)
  }
  if (ctx.strengths?.length) {
    lines.push(`- Strengths: ${ctx.strengths.join(', ')}`)
  }

  if (ctx.weeklyFocus?.theme || ctx.weeklyFocus?.keyTopics?.length) {
    const wk = ctx.weeklyFocus
    lines.push(`- Current coach-plan week: ${wk.theme ?? 'in progress'}${wk.keyTopics?.length ? ` — key topics: ${wk.keyTopics.join(', ')}` : ''}`)
  }

  if (ctx.syllabusEvents?.length) {
    lines.push('- Upcoming syllabus events:')
    for (const e of ctx.syllabusEvents.slice(0, 12)) {
      lines.push(`    · ${e.dateStr}: ${e.title}${e.type ? ` (${e.type})` : ''}`)
    }
  }

  if (ctx.weakTopics?.length) {
    lines.push('- Weakest topics (from mastery scores, 0-100):')
    for (const t of ctx.weakTopics.slice(0, 8)) {
      lines.push(`    · ${t.topic} — ${t.score}/100 (${t.level})`)
    }
  }
  if (ctx.strongTopics?.length) {
    lines.push(`- Strong topics: ${ctx.strongTopics.map(t => `${t.topic} (${t.score})`).join(', ')}`)
  }

  if (ctx.recentQuizMisses?.length) {
    lines.push('- Recent quiz misses (student got these wrong):')
    for (const s of ctx.recentQuizMisses.slice(0, 8)) {
      lines.push(`    · ${s.topic ?? '(untagged)'} — ${s.score}% on ${s.dateStr}`)
    }
  }

  if (ctx.brainDumpGaps?.length) {
    lines.push(`- Topics the student didn't mention in recent brain dumps (probable blind spots): ${ctx.brainDumpGaps.slice(0, 6).join(', ')}`)
  }

  if (ctx.brainDumpHistory?.length) {
    lines.push('- Brain-dump trajectory:')
    for (const b of ctx.brainDumpHistory) {
      lines.push(`    · ${b.dateStr}: ${b.score ?? '?'}%${b.topic ? ` on ${b.topic}` : ''}`)
    }
  }

  if (ctx.hardNotes?.length) {
    lines.push('- Recent "I got stuck" flags the student saved:')
    for (const n of ctx.hardNotes) {
      lines.push(`    · "${n.note}" during ${n.sessionLabel ?? 'a session'}`)
    }
  }

  if (lines.length === 1) return 'STUDENT CONTEXT: only a course name is available; no syllabus, coach plan, or mastery data yet.'
  return lines.join('\n')
}

/**
 * Standard set of guardrails for grounding-sensitive endpoints. The optional
 * `invention` override lets a feature customize what to do when context is
 * thin (e.g. Quiz Burst tags the question, Cheat Sheet refuses entirely).
 */
export function contextGuardrails(ctx, opts = {}) {
  const rules = [
    'GROUNDING RULES:',
    `- The course is "${ctx?.courseName ?? 'unspecified'}". Every fact, term, and question you write MUST belong to this course, not a similarly-named course.`,
    '- Prefer material from the syllabus events, coach-plan emphasis topics, and weak topics above. Those beat generic textbook coverage.',
    '- If the student has recent quiz misses, prioritize the topics they missed. They are here to close gaps, not review what they already know.',
    '- Respect the learning style if one is given (visual = describe imagery; reading = precise definitions; practice = worked examples).',
    '- Never fabricate professor names, page numbers, syllabus week numbers, or citations. If you don\'t have the source, don\'t reference it.',
  ]
  if (opts.invention) rules.push(`- ${opts.invention}`)
  return rules.join('\n')
}

/**
 * Detect whether the context is rich enough to ground on. Endpoints that
 * want to refuse (e.g. Essay Outline) can use this to short-circuit and ask
 * the student for more info instead of hallucinating.
 */
export function hasRichContext(ctx) {
  if (!ctx) return false
  const signals = [
    ctx.syllabusEvents?.length ?? 0,
    ctx.emphasisTopics?.length ?? 0,
    ctx.struggles?.length ?? 0,
    ctx.weakTopics?.length ?? 0,
    ctx.recentQuizMisses?.length ?? 0,
    ctx.weeklyFocus?.keyTopics?.length ?? 0,
  ]
  return signals.reduce((a, b) => a + b, 0) >= 2
}
