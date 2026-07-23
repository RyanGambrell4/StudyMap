// smartDefault.js — every study-feature setup screen calls this to pre-fill
// the smartest topic for the student RIGHT NOW so the whole first screen
// collapses to a single "Start on X" button. The rest of the setup (manual
// picker, other options) demotes to "Or pick something else."
//
// Priority order for the "why now" recommendation:
//   1. Unaddressed brain-dump gap — the student literally left this out
//   2. Recent quiz miss — measured miss, freshest signal
//   3. Weakest mastery topic — long-run gap
//   4. Coach-plan current-week emphasis
//   5. Professor emphasis
//   6. First upcoming exam topic
//   7. Fallback: "general course material"

import { getRecentBrainDumpGaps } from './brainDumpGaps'
import { getWeakestTopics, getMastery } from './masteryStore'

/**
 * Compute the smartest default focus topic for a given course.
 *
 * @param {object|null} course - The course object (id, name, examDate, ...)
 * @param {object|null} ctx    - Optional pre-hydrated CourseContext. If not
 *                                given, this helper still works from
 *                                masteryStore + brainDumpGaps alone.
 * @returns {{ topic: string|null, reason: string, confidence: 'high'|'med'|'low', source: string }}
 */
export function pickSmartTopic(course, ctx = null) {
  const courseId = course?.id ?? null

  // 1. Unaddressed brain-dump gap: student wrote the dump, gap surfaced, hasn't fixed it
  const gapEntries = getRecentBrainDumpGaps(courseId, 3)
  for (const entry of gapEntries) {
    for (const g of entry.gaps) {
      const m = getMastery(g, courseId)
      if (!m || m.score < 70) {
        return {
          topic: g,
          reason: `you missed this in your ${friendlyDate(entry.ts)} brain dump`,
          confidence: 'high',
          source: 'brain_dump_gap',
        }
      }
    }
  }

  // 2. Recent quiz miss with topic
  const recentMiss = ctx?.recentQuizMisses?.[0]
  if (recentMiss?.topic) {
    return {
      topic: recentMiss.topic,
      reason: `you scored ${recentMiss.score}% on this on ${recentMiss.dateStr}`,
      confidence: 'high',
      source: 'recent_miss',
    }
  }

  // 3. Weakest mastery topic (score < 70)
  const weakest = getWeakestTopics(courseId, 1)[0]
  if (weakest && weakest.score < 70) {
    return {
      topic: weakest.topic,
      reason: `weakest topic — mastery ${weakest.score}/100`,
      confidence: 'high',
      source: 'weak_topic',
    }
  }

  // 4. Coach-plan current-week keyTopics
  const weekTopic = ctx?.weeklyFocus?.keyTopics?.[0]
  if (weekTopic) {
    return {
      topic: weekTopic,
      reason: `this week's coach plan focus`,
      confidence: 'med',
      source: 'coach_plan',
    }
  }

  // 5. Professor emphasis
  const emphasis = ctx?.emphasisTopics?.[0]
  if (emphasis) {
    return {
      topic: emphasis,
      reason: `professor emphasis`,
      confidence: 'med',
      source: 'emphasis',
    }
  }

  // 6. First upcoming exam topic (from title)
  const nextExam = ctx?.nextExamTitle
  if (nextExam && ctx?.daysUntilExam != null && ctx.daysUntilExam <= 14) {
    return {
      topic: nextExam.replace(/\s*(exam|midterm|final|test|quiz)\s*/gi, '').trim() || nextExam,
      reason: `${ctx.daysUntilExam}d until your ${nextExam}`,
      confidence: 'low',
      source: 'next_exam',
    }
  }

  // 7. Fallback
  return {
    topic: null,
    reason: 'general course material',
    confidence: 'low',
    source: 'fallback',
  }
}

/**
 * Pick the best course to open a modal to. Priority:
 *   1. Closest upcoming exam within 14 days
 *   2. Course with an unaddressed brain-dump gap
 *   3. Course with the weakest overall mastery
 *   4. First course
 */
export function pickSmartCourse(courses = []) {
  if (!courses.length) return { index: 0, reason: null }
  const now = Date.now()

  // 1. Closest upcoming exam within 14 days
  let bestExamIdx = -1
  let bestExamDays = Infinity
  courses.forEach((c, i) => {
    if (!c.examDate) return
    const days = Math.ceil((new Date(c.examDate + 'T12:00:00') - now) / 86400000)
    if (days >= 0 && days <= 14 && days < bestExamDays) {
      bestExamDays = days
      bestExamIdx = i
    }
  })
  if (bestExamIdx >= 0) {
    return { index: bestExamIdx, reason: `exam in ${bestExamDays}d`, source: 'exam' }
  }

  // 2. Course with unaddressed brain-dump gap
  for (let i = 0; i < courses.length; i++) {
    const gaps = getRecentBrainDumpGaps(courses[i].id ?? null, 1)
    if (gaps.length && gaps[0].gaps.length) {
      return { index: i, reason: 'gap you left open in your brain dump', source: 'brain_dump' }
    }
  }

  // 3. Course with weakest overall mastery
  let bestWeakIdx = -1
  let bestWeakScore = 101
  courses.forEach((c, i) => {
    const weakest = getWeakestTopics(c.id ?? null, 1)[0]
    if (weakest && weakest.score < bestWeakScore) {
      bestWeakScore = weakest.score
      bestWeakIdx = i
    }
  })
  if (bestWeakIdx >= 0) {
    return { index: bestWeakIdx, reason: `weakest topic across your courses`, source: 'weak' }
  }

  return { index: 0, reason: null, source: 'first' }
}

function friendlyDate(ts) {
  const days = Math.round((Date.now() - ts) / 86400000)
  if (days === 0) return "today's"
  if (days === 1) return "yesterday's"
  if (days < 7) return `${days}-day-old`
  if (days < 14) return `last week's`
  return `${days}-day-old`
}
