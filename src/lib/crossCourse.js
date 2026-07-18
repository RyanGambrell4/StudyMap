// Cross-Course Connections
// Finds topics that recur in two or more of the student's courses.
// Framing: "Study once, apply twice." Real academic overlap is a huge unlock —
// e.g. statistics shows up in bio, psych, and econ.

import { getAllMastery } from './masteryStore'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'on', 'at',
  'by', 'with', 'from', 'as', 'is', 'are', 'be', 'this', 'that', 'these',
  'those', 'it', 'its', 'about', 'into', 'chapter', 'unit', 'section',
  'part', 'topic', 'lecture', 'week', 'day', 'exam', 'test', 'quiz',
  'notes', 'review', 'intro', 'introduction', 'basic', 'basics',
  'advanced', 'general', 'overview', 'summary',
])

// Extract meaningful tokens from a topic string.
function tokenize(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !STOPWORDS.has(t))
}

// Two topics are "shared" if they overlap on a meaningful token.
function sharedTokens(a, b) {
  const A = new Set(tokenize(a))
  const B = new Set(tokenize(b))
  const shared = []
  A.forEach(t => { if (B.has(t)) shared.push(t) })
  return shared
}

// Return an array of connections between courses.
// Each entry: { token, courses: [{ courseId, courseName, topic, score }, ...] }
export function findCrossCourseConnections(courses = []) {
  const mastery = getAllMastery()
  if (!mastery.length || courses.length < 2) return []

  // Build courseId -> courseName map (index-based since sessions carry courseId)
  const nameByCourseId = {}
  courses.forEach((c, i) => {
    // Courses can be keyed by index or by id — match both conventions.
    nameByCourseId[String(i)] = c.name
    if (c.id != null) nameByCourseId[String(c.id)] = c.name
  })

  // Group mastery entries by token.
  const byToken = {}
  mastery.forEach(m => {
    if (!m.topic || m.courseId == null) return
    const tokens = tokenize(m.topic)
    tokens.forEach(tok => {
      if (!byToken[tok]) byToken[tok] = []
      byToken[tok].push({
        courseId:   m.courseId,
        courseName: nameByCourseId[String(m.courseId)] ?? null,
        topic:      m.topic,
        score:      m.score,
      })
    })
  })

  // A connection is a token that shows up in 2+ distinct courses.
  const connections = []
  Object.entries(byToken).forEach(([token, entries]) => {
    const byCourse = {}
    entries.forEach(e => {
      const key = String(e.courseId)
      // Keep the entry with the lowest score per course — that's the more
      // interesting one to study (a weak topic in two courses = high leverage).
      if (!byCourse[key] || (e.score != null && e.score < (byCourse[key].score ?? 100))) {
        byCourse[key] = e
      }
    })
    const distinct = Object.values(byCourse).filter(e => e.courseName)
    if (distinct.length >= 2) {
      const avgScore = distinct.reduce((s, e) => s + (e.score ?? 50), 0) / distinct.length
      connections.push({
        token,
        courses: distinct,
        avgScore: Math.round(avgScore),
        leverage: Math.round((100 - avgScore) * distinct.length),
      })
    }
  })

  // Prioritize connections with the highest leverage (weakest + most courses).
  return connections.sort((a, b) => b.leverage - a.leverage)
}

// Get a single "star" connection for a compact dashboard callout.
export function getTopConnection(courses = []) {
  return findCrossCourseConnections(courses)[0] ?? null
}
