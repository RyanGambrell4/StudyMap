// Concept mastery tracking -- persisted in localStorage.
// Every AI practice tool writes scores here. The Mastery Map reads them.

const STORE_KEY = 'se_mastery_v2'

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}

function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)) } catch {}
}

// Blend a new score into an existing one (exponential moving average).
// New observations carry 40% weight so early outliers don't dominate.
function blend(existing, incoming) {
  if (existing == null) return Math.round(incoming)
  return Math.round(existing * 0.6 + incoming * 0.4)
}

function makeKey(topic, courseId) {
  return `${courseId ?? 'global'}::${topic.toLowerCase().trim()}`
}

export function updateMastery(topic, courseId, score, source) {
  if (!topic || score == null) return
  const key = makeKey(topic, courseId)
  const data = load()
  const prev = data[key]
  data[key] = {
    topic: topic.trim(),
    courseId: courseId ?? null,
    score: blend(prev?.score, score),
    prevScore: prev?.score ?? null,
    lastUpdated: Date.now(),
    source,
    count: (prev?.count ?? 0) + 1,
  }
  save(data)
}

export function getMastery(topic, courseId) {
  return load()[makeKey(topic, courseId)] ?? null
}

export function getAllMastery() {
  return Object.values(load())
}

export function getMasteryForCourse(courseId) {
  return Object.values(load()).filter(m => String(m.courseId) === String(courseId))
}

export function getWeakestTopics(courseId, limit = 5) {
  const items = courseId ? getMasteryForCourse(courseId) : getAllMastery()
  return items
    .filter(m => m.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
}

export function getMasteryLevel(score) {
  if (score == null) return 'unknown'
  if (score < 40) return 'weak'
  if (score < 70) return 'developing'
  return 'strong'
}

export function getMasteryColor(score) {
  if (score == null) return '#9B9B9B'
  if (score < 40) return '#DC2626'
  if (score < 70) return '#D97706'
  return '#16A34A'
}

export function getMasteryTrend(entry) {
  if (entry.prevScore == null || entry.count < 2) return null
  const delta = entry.score - entry.prevScore
  if (Math.abs(delta) < 3) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function getMasterySummary() {
  const all = getAllMastery()
  if (!all.length) return null
  const avg = Math.round(all.reduce((s, m) => s + m.score, 0) / all.length)
  return {
    total: all.length,
    avg,
    strong: all.filter(m => m.score >= 70).length,
    developing: all.filter(m => m.score >= 40 && m.score < 70).length,
    weak: all.filter(m => m.score < 40).length,
  }
}
