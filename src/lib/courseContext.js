// courseContext.js — single source of truth for the "who is this student in
// this course" packet that every AI study feature sends to its API.
//
// Before this file existed, most features shipped just { courseName } and the
// LLM had nothing but a two-word cue to work with — so it hallucinated
// curricula, sometimes drifting into a different course entirely. This helper
// pulls together everything the client already knows (coach plan, syllabus,
// weak topics, past misses, exam window, learning style) into one object so
// every prompt can be grounded on the same rich context.

import { getCachedCoachPlan, getCachedSyllabusEvents } from './db'
import { getWeakestTopics, getMasteryForCourse, getMasteryLevel } from './masteryStore'
import { getStudyHistory } from './studyHistory'
import { getAllConfidence } from './confidenceStore'
import { getBrainDumpGapTopics, getRecentBrainDumpGaps } from './brainDumpGaps'
import { getCurrentGrade } from '../utils/gradeCalc'

// How much of each list we bring back by default. The wire budget kicks in
// when we serialize for an API call so we never blow past ~4KB of context.
const DEFAULTS = {
  weakTopicsLimit: 8,
  historyLimit: 20,
  syllabusEventsLimit: 30,
  confidenceLimit: 20,
}

/**
 * Build the full course context for a given course.
 * Everything here is derived from client-side caches — no network calls.
 *
 * @param {object|null} course - The course object from App.jsx (id, name, color, examDate, targetGrade, gradeData)
 * @param {object} profile - User-level fields (learningStyle, yearLevel, firstName, schoolType, assignments)
 * @param {object} [opts] - Optional overrides
 * @returns {object} A CourseContext ready to serialize for any /api/* endpoint
 */
export function hydrateCourseContext(course, profile = {}, opts = {}) {
  const options = { ...DEFAULTS, ...opts }
  const courseId = course?.id ?? null
  const courseName = course?.name ?? null

  // Current grade percentage from the student's own grade components (only
  // graded work is included in the weighted average).
  const gradeComponents = course?.gradeData?.components ?? []
  const currentGradePct = gradeComponents.length ? (() => {
    const v = getCurrentGrade(gradeComponents)
    return v == null ? null : Math.round(v * 10) / 10
  })() : null

  const coach = courseId != null ? getCachedCoachPlan(courseId) : null
  const formData = coach?.formData ?? {}

  // Syllabus events scoped to this course. Not every event has courseId
  // attached (older imports were global), so we accept both matched + generic.
  const allSyllabusEvents = getCachedSyllabusEvents() ?? []
  const scopedSyllabus = courseId != null
    ? allSyllabusEvents.filter(e =>
        e.courseId == null || String(e.courseId) === String(courseId)
      )
    : allSyllabusEvents

  const todayStr = new Date().toISOString().slice(0, 10)
  const upcomingSyllabusEvents = scopedSyllabus
    .filter(e => (e.date ?? e.dateStr ?? '') >= todayStr)
    .sort((a, b) =>
      (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? '')
    )
    .slice(0, options.syllabusEventsLimit)

  const nextExam = scopedSyllabus
    .filter(e => {
      const isExam = e.type === 'exam' || /exam|midterm|final|test|quiz/i.test(e.title ?? '')
      const d = e.date ?? e.dateStr ?? ''
      return isExam && d >= todayStr
    })
    .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))[0] ?? null

  // Prefer explicit course.examDate (student-entered) over syllabus inference.
  const examDate = course?.examDate ?? nextExam?.date ?? nextExam?.dateStr ?? null
  const daysUntilExam = examDate
    ? Math.max(0, Math.ceil((new Date(examDate + 'T12:00:00') - Date.now()) / 86400000))
    : null

  // Mastery / weakness signals.
  const allMastery = courseId != null ? getMasteryForCourse(courseId) : []
  const weakTopics = getWeakestTopics(courseId, options.weakTopicsLimit)
    .filter(t => t.score < 80)
    .map(t => ({
      topic: t.topic,
      score: t.score,
      level: getMasteryLevel(t.score),
      lastUpdated: t.lastUpdated,
    }))

  const strongTopics = allMastery
    .filter(m => m.score >= 80)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(t => ({ topic: t.topic, score: t.score }))

  // Recent quiz + tool sessions for this course. Study history is stored by
  // courseName (not id) — that's fine because we scope on name here.
  const recentSessions = getStudyHistory()
    .filter(s => !courseName || s.courseName === courseName)
    .slice(0, options.historyLimit)
    .map(s => ({
      tool: s.tool,
      topic: s.topic,
      score: s.score,
      dateStr: s.date?.slice(0, 10) ?? null,
    }))

  const recentQuizMisses = recentSessions
    .filter(s => (s.tool === 'Quiz Burst' || s.tool === 'Practice Exam') && typeof s.score === 'number' && s.score < 80)
    .slice(0, 10)

  // Confidence gaps — where the student says they know it but mastery says
  // they don't. These are the highest-leverage things to drill.
  const confidence = getAllConfidence()
    .filter(c => courseId == null || String(c.courseId) === String(courseId))
    .slice(-options.confidenceLimit)
    .map(c => ({ topic: c.topic, rating: c.rating, source: c.source, ts: c.timestamp }))

  // Recall average across the last 10 confidence tap-ins for this course.
  // Scale is 1-5 (student self-reported). Used by the API to gauge whether
  // a topic they think they know actually holds up under quizzing.
  const recallEntries = confidence.slice(-10)
  const recentRecallAvg = recallEntries.length
    ? Math.round((recallEntries.reduce((s, c) => s + (c.rating || 0), 0) / recallEntries.length) * 10) / 10
    : null

  // Brain-dump gaps — things the student left out of prior dumps. Persisted
  // by brainDumpGaps.js so they survive across sessions/features.
  const brainDumpGaps = getBrainDumpGapTopics(courseId, 8)
  const brainDumpHistory = getRecentBrainDumpGaps(courseId, 3).map(e => ({
    dateStr: new Date(e.ts).toISOString().slice(0, 10),
    topic: e.topic,
    score: e.score,
    gaps: e.gaps,
  }))

  // Upcoming deadlines — merge assignments (from plan) with syllabus events
  // that look like deadlines, sorted by date.
  const assignments = Array.isArray(profile.assignments) ? profile.assignments : []
  const upcomingDeadlines = [
    ...assignments
      .filter(a => {
        const d = a?.dueDate ?? a?.date ?? a?.dateStr
        return d && d >= todayStr && !a?.completed
      })
      .map(a => ({
        dateStr: a.dueDate ?? a.date ?? a.dateStr,
        title: a.title ?? a.name ?? 'Assignment',
        type: 'assignment',
        courseId: a.courseId ?? null,
      })),
    ...upcomingSyllabusEvents
      .filter(e => /due|assignment|paper|essay|project|homework|hw/i.test(e.title ?? ''))
      .map(e => ({ dateStr: e.dateStr, title: e.title, type: 'syllabus-deadline', courseId }))
  ]
    .filter(d => courseId == null || d.courseId == null || String(d.courseId) === String(courseId))
    .sort((a, b) => (a.dateStr ?? '').localeCompare(b.dateStr ?? ''))
    .slice(0, 8)

  // Emphasis topics can come from either coach plan formData shape depending
  // on when the plan was saved. Cover both.
  const emphasisTopics = normalizeList(
    formData.emphasisTopics
      ?? (Array.isArray(formData.topics) ? formData.topics.join(', ') : null)
  )

  // Hard notes are per-session flags the student captured during focus mode.
  // They're a strong "I got stuck here" signal.
  const hardNotes = Array.isArray(coach?.pendingHardNotes)
    ? coach.pendingHardNotes.slice(-5).map(n => ({
        note: n.note,
        sessionLabel: n.sessionLabel,
        dateStr: n.dateStr,
      }))
    : []

  return {
    // Identity
    courseId,
    courseName,
    colorDot: course?.color?.dot ?? null,

    // Student profile
    firstName: profile.firstName ?? null,
    yearLevel: profile.yearLevel ?? null,
    learningStyle: profile.learningStyle ?? null,
    preferredTime: profile.preferredTime ?? null,
    schoolType: profile.schoolType ?? null,

    // Goal + timing
    targetGrade: course?.targetGrade ?? null,
    currentGradePct,
    gradeGap: (course?.targetGrade != null && currentGradePct != null)
      ? Math.round((course.targetGrade - currentGradePct) * 10) / 10
      : null,
    examDate,
    daysUntilExam,
    nextExamTitle: nextExam?.title ?? null,
    upcomingDeadlines,

    // Curriculum grounding
    syllabusEvents: upcomingSyllabusEvents.map(e => ({
      dateStr: e.date ?? e.dateStr ?? null,
      title: e.title ?? null,
      type: e.type ?? null,
    })),
    hasSyllabus: upcomingSyllabusEvents.length > 0,

    // Coach plan signals
    coachPlanSummary: coach?.plan?.summary ?? null,
    weeklyFocus: extractWeeklyFocus(coach?.plan),
    emphasisTopics,
    struggles: normalizeList(coach?.struggles),
    strengths: normalizeList(formData.strengths),
    studyGoal: formData.studyGoal ?? null,

    // Performance signals
    weakTopics,
    strongTopics,
    recentSessions,
    recentQuizMisses,
    confidence,
    recentRecallAvg,
    brainDumpGaps,
    brainDumpHistory,
    hardNotes,

    // Meta
    hydratedAt: Date.now(),
  }
}

/**
 * Trim a CourseContext down to what the wire actually needs. Some endpoints
 * only care about a subset — this lets a caller cheaply drop what they don't
 * need, but by default we send the whole thing because prompt caching handles
 * repetition and the total is well under 4KB.
 */
export function serializeCourseContext(ctx, pick = null) {
  if (!ctx) return null
  if (!pick) return ctx
  const out = {}
  for (const k of pick) if (k in ctx) out[k] = ctx[k]
  return out
}

/**
 * Convert a CourseContext into a compact human-readable block that an LLM
 * can quote directly in its system prompt. Every API endpoint uses this so
 * grounding wording stays consistent across features.
 */
export function contextAsPromptBlock(ctx) {
  if (!ctx) return ''
  const lines = []
  lines.push(`Course: ${ctx.courseName ?? 'unspecified'}`)
  if (ctx.courseId != null) lines.push(`Course ID: ${ctx.courseId}`)
  if (ctx.yearLevel) lines.push(`Year: ${ctx.yearLevel}`)
  if (ctx.learningStyle) lines.push(`Learning style: ${ctx.learningStyle}`)
  if (ctx.targetGrade != null) lines.push(`Target grade: ${ctx.targetGrade}%`)
  if (ctx.examDate) {
    lines.push(`Next exam: ${ctx.nextExamTitle ?? 'exam'} on ${ctx.examDate} (${ctx.daysUntilExam ?? '?'} days away)`)
  }
  if (ctx.studyGoal) lines.push(`Student's stated goal: ${ctx.studyGoal}`)
  if (ctx.emphasisTopics?.length) lines.push(`Professor emphasis: ${ctx.emphasisTopics.join(', ')}`)
  if (ctx.struggles?.length) lines.push(`Known struggles: ${ctx.struggles.join(', ')}`)
  if (ctx.strengths?.length) lines.push(`Known strengths: ${ctx.strengths.join(', ')}`)
  if (ctx.syllabusEvents?.length) {
    lines.push(`Upcoming syllabus events:`)
    for (const e of ctx.syllabusEvents.slice(0, 10)) {
      lines.push(`  - ${e.dateStr}: ${e.title}${e.type ? ` (${e.type})` : ''}`)
    }
  }
  if (ctx.weakTopics?.length) {
    lines.push(`Weakest topics (from mastery data):`)
    for (const t of ctx.weakTopics.slice(0, 6)) {
      lines.push(`  - ${t.topic} — ${t.score}/100 (${t.level})`)
    }
  }
  if (ctx.strongTopics?.length) {
    lines.push(`Strongest topics: ${ctx.strongTopics.map(t => `${t.topic} (${t.score})`).join(', ')}`)
  }
  if (ctx.recentQuizMisses?.length) {
    lines.push(`Recent quiz misses:`)
    for (const s of ctx.recentQuizMisses.slice(0, 6)) {
      lines.push(`  - ${s.topic ?? '(untagged)'} scored ${s.score}% on ${s.dateStr}`)
    }
  }
  if (ctx.hardNotes?.length) {
    lines.push(`Recent "I got stuck" flags:`)
    for (const n of ctx.hardNotes) lines.push(`  - "${n.note}" during ${n.sessionLabel ?? 'session'}`)
  }
  return lines.join('\n')
}

/**
 * A one-line summary the LLM can use as an early anchor. Compact enough to
 * quote verbatim in the assistant's opening line.
 */
export function contextOneLiner(ctx) {
  if (!ctx?.courseName) return ''
  const parts = [ctx.courseName]
  if (ctx.nextExamTitle && ctx.daysUntilExam != null) parts.push(`${ctx.nextExamTitle} in ${ctx.daysUntilExam}d`)
  else if (ctx.daysUntilExam != null) parts.push(`exam in ${ctx.daysUntilExam}d`)
  if (ctx.targetGrade) parts.push(`goal ${ctx.targetGrade}%`)
  if (ctx.weakTopics?.[0]) parts.push(`weakest: ${ctx.weakTopics[0].topic}`)
  return parts.join(' · ')
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeList(v) {
  if (!v) return []
  if (Array.isArray(v)) return v.filter(Boolean).map(String)
  if (typeof v === 'string') {
    return v.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

function extractWeeklyFocus(plan) {
  if (!plan?.weeklyFocus || !Array.isArray(plan.weeklyFocus)) return null
  const now = Date.now()
  // Return the current or next-upcoming week only.
  const current = plan.weeklyFocus.find(w => {
    const start = w.startDate ? new Date(w.startDate + 'T00:00:00').getTime() : 0
    const end = w.endDate ? new Date(w.endDate + 'T23:59:59').getTime() : 0
    return now >= start && now <= end
  })
  const chosen = current ?? plan.weeklyFocus[0]
  if (!chosen) return null
  return {
    week: chosen.week ?? null,
    theme: chosen.theme ?? null,
    keyTopics: Array.isArray(chosen.sessions)
      ? Array.from(new Set(chosen.sessions.flatMap(s => Array.isArray(s.keyTopics) ? s.keyTopics : []))).slice(0, 6)
      : [],
  }
}
