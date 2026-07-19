// Quick-Start Session Presets
// One-tap "I have X minutes right now" flow. Picks the smartest course +
// topic for each preset and synthesizes a session that goes straight into
// FocusMode — no Blueprint screen, no manual duration/type/topic entry.

import { getAllMastery, getWeakestTopics } from './masteryStore'

export const QUICK_PRESETS = [
  {
    id:          'recall',
    label:       '5-min recall',
    tagline:     'Quick memory check',
    minutes:     5,
    sessionType: 'Active Recall',
    strategy:    'weakest', // pick weakest topic overall
    color:       '#7C3AED',
  },
  {
    id:          'review',
    label:       '15-min review',
    tagline:     'Refresh what you know',
    minutes:     15,
    sessionType: 'Review',
    strategy:    'developing', // pick topics in the middle band
    color:       '#3B61C4',
  },
  {
    id:          'deep',
    label:       '25-min deep dive',
    tagline:     'Full pomodoro on one topic',
    minutes:     25,
    sessionType: 'Deep Dive',
    strategy:    'weakest',
    color:       '#16A34A',
  },
  {
    id:          'exam',
    label:       '45-min exam prep',
    tagline:     'Course with the next exam',
    minutes:     45,
    sessionType: 'Exam Prep',
    strategy:    'nextExam',
    color:       '#DC2626',
  },
]

// Return { course, topic } for the preset. Falls back gracefully.
export function pickTarget(preset, courses = [], todayStr) {
  if (!courses || courses.length === 0) return null

  if (preset.strategy === 'nextExam') {
    // Course with the soonest future exam, else first course.
    const withExam = courses
      .map((c, idx) => ({ course: c, idx, examDate: c?.examDate }))
      .filter(x => x.examDate)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
    const target = withExam.find(x => x.examDate >= todayStr) ?? withExam[0]
    if (target) {
      const weak = getWeakestTopics(target.idx, 1)?.[0]
      return { courseId: target.idx, courseName: target.course.name, topic: weak?.topic ?? null }
    }
    return { courseId: 0, courseName: courses[0]?.name, topic: null }
  }

  if (preset.strategy === 'developing') {
    // Middle-mastery topic: not weakest (too painful for a quick refresh),
    // not strongest (waste of time). Score 40-70.
    const mid = getAllMastery()
      .filter(m => m.score != null && m.score >= 40 && m.score < 70)
      .sort((a, b) => a.score - b.score)
    const pick = mid[0]
    if (pick) {
      const courseIdx = courses.findIndex((_, i) => String(i) === String(pick.courseId))
      const idx = courseIdx >= 0 ? courseIdx : 0
      return { courseId: idx, courseName: courses[idx]?.name, topic: pick.topic }
    }
    // Fall back to weakest strategy if no mid-band topic exists yet.
  }

  // Default: weakest topic overall.
  const weak = getAllMastery()
    .filter(m => m.score != null)
    .sort((a, b) => a.score - b.score)[0]
  if (weak) {
    const idx = courses.findIndex((_, i) => String(i) === String(weak.courseId))
    const courseIdx = idx >= 0 ? idx : 0
    return { courseId: courseIdx, courseName: courses[courseIdx]?.name, topic: weak.topic }
  }

  // No mastery data: default to first course.
  return { courseId: 0, courseName: courses[0]?.name, topic: null }
}

// Synthesize a session object ready for FocusMode. The session ID prefix
// `qs-` distinguishes quick-start sessions in analytics + completion logs.
export function buildQuickSession(preset, courses = [], todayStr) {
  const target = pickTarget(preset, courses, todayStr)
  if (!target) return null
  return {
    id:          `qs-${preset.id}-${Date.now()}`,
    dateStr:     todayStr,
    courseId:    target.courseId,
    courseName:  target.courseName,
    sessionType: preset.sessionType,
    focusArea:   target.topic ?? null,
    duration:    preset.minutes,
    isQuickStart: true,
  }
}
