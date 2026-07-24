import { getCachedCoachPlan, getCachedStudyTools } from '../../lib/db'
import { getWeakestTopics, getAverageMastery } from '../../lib/masteryStore'
import { courseColor } from '../../theme/tokens'

// Nearest-upcoming-exam course, falling back to first course.
export function getBestPickCourse(courses) {
  if (!courses?.length) return { course: null, courseIdx: 0 }
  const now = Date.now()
  const ranked = courses
    .map((c, i) => {
      const ms = c.examDate
        ? new Date(c.examDate + 'T12:00:00').getTime()
        : Number.POSITIVE_INFINITY
      const upcoming = ms > now
      return { c, i, ms, upcoming }
    })
    .sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1
      return a.ms - b.ms
    })
  const best = ranked[0]
  return { course: best.c, courseIdx: best.i }
}

// Best topic to focus on: coach-plan focus first, else weakest mastery.
export function getBestPickTopic(courseId) {
  const plan = courseId ? getCachedCoachPlan(courseId) : null
  const topics = plan?.formData?.topics
  if (Array.isArray(topics) && topics.length) {
    return { topic: topics[0], contextLine: "This week's coach plan focus" }
  }
  const emphasis = plan?.formData?.emphasisTopics
  if (typeof emphasis === 'string' && emphasis.trim()) {
    return { topic: emphasis.split(',')[0].trim(), contextLine: "Your professor's focus area" }
  }
  const weak = getWeakestTopics(courseId, 1)
  if (weak.length && weak[0].topic) {
    return { topic: weak[0].topic, contextLine: 'Your lowest-recall area' }
  }
  return { topic: '', contextLine: 'No focus data yet — pick any topic' }
}

// Two topics for the Connections tool (two lowest-recall).
export function getBestPickTopicPair(courseId) {
  const weak = getWeakestTopics(courseId, 2)
  if (weak.length >= 2) {
    return { topics: [weak[0].topic, weak[1].topic], contextLine: 'Your two weakest topics' }
  }
  if (weak.length === 1) {
    return { topics: [weak[0].topic, ''], contextLine: 'Add a second topic to compare' }
  }
  return { topics: ['', ''], contextLine: 'Pick two topics to connect' }
}

export function getCoursePillProps(course, courseIdx) {
  const idx = courseIdx ?? 0
  const c = course?.color ?? courseColor(idx)
  return {
    label: course?.name ?? 'Add a course',
    dot: c.dot,
    bg: c.halo,
  }
}

// Standard "best pick" bundle for a tool that runs on {course, topic}.
export function computeBestPick(toolId, courses) {
  const { course, courseIdx } = getBestPickCourse(courses)
  const { topic, contextLine } = getBestPickTopic(course?.id ?? null)

  if (toolId === 'examRescue') {
    const days = daysUntilExam(course?.examDate)
    return {
      course, courseIdx, topic, contextLine:
        days == null ? 'No exam date set — add one to unlock rescue plans'
        : days <= 0 ? 'Your exam is today — start now'
        : days === 1 ? 'Your exam is tomorrow'
        : `${days} days until your exam`,
    }
  }

  if (toolId === 'timeAttack' || toolId === 'cheatSheet' || toolId === 'podcast' || toolId === 'uploadMaterial') {
    return { course, courseIdx, topic: '', contextLine: course?.name ? `Focused on ${course.name}` : 'Pick a course to start' }
  }

  if (toolId === 'connections') {
    const pair = getBestPickTopicPair(course?.id ?? null)
    return { course, courseIdx, topic: pair.topics[0], topics: pair.topics, contextLine: pair.contextLine }
  }

  if (toolId === 'flashcards' || toolId === 'quizzes') {
    const cached = getCachedStudyTools()
    const count = toolId === 'flashcards' ? cached?.flashcards?.length ?? 0 : cached?.quiz?.length ?? 0
    if (count > 0) {
      return { course, courseIdx, topic: cached?.fileLabel ?? 'Your last set', contextLine: `${count} ${toolId === 'flashcards' ? 'cards' : 'questions'} ready` }
    }
    return { course, courseIdx, topic: '', contextLine: 'No cards yet — upload material first', requiresUpload: true }
  }

  if (toolId === 'studyCoach') {
    const hasPlan = course?.id ? !!getCachedCoachPlan(course.id) : false
    return { course, courseIdx, topic, contextLine: hasPlan ? "Continue this week's plan" : 'Build your first weekly plan' }
  }

  return { course, courseIdx, topic, contextLine }
}

// Two data-driven "Recommended right now" strip suggestions.
export function getRecommendations(courses) {
  const recs = []
  const { course, courseIdx } = getBestPickCourse(courses)
  const days = daysUntilExam(course?.examDate)

  if (days != null && days <= 3 && days >= 0) {
    recs.push({
      toolId: 'examRescue',
      reason: days <= 0 ? `${course.name} exam is today` : `${course.name} exam in ${days} day${days === 1 ? '' : 's'}`,
    })
  }

  const weak = course?.id ? getWeakestTopics(course.id, 1) : []
  if (weak[0]?.score != null && weak[0].score < 60) {
    recs.push({
      toolId: 'quizBurst',
      reason: `${weak[0].topic} is your lowest-recall topic`,
    })
  }

  const avg = course?.id ? getAverageMastery(course.id) : null
  if (avg != null && avg >= 70 && recs.length < 2) {
    recs.push({
      toolId: 'teachItBack',
      reason: `${course.name} recall is strong — lock it in`,
    })
  }

  if (recs.length === 0) {
    recs.push({
      toolId: 'quizBurst',
      reason: course?.name ? `Start with a quick burst on ${course.name}` : 'Add a course to get personalized picks',
    })
  }

  return { recommendations: recs.slice(0, 2), defaultCourseIdx: courseIdx }
}

function daysUntilExam(examDate) {
  if (!examDate) return null
  const target = new Date(examDate + 'T12:00:00').getTime()
  const now = Date.now()
  return Math.ceil((target - now) / 86400000)
}
