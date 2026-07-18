// Confidence Calibration store.
// After a session or quiz, the student rates how confident they feel (1-5).
// Later, when a real score comes in for the same topic, we compare
// perceived confidence to actual mastery to surface a "confidence gap."
//
// Research: metacognitive calibration is one of the strongest predictors
// of long-term retention. Making the gap visible drives real behavior change.

const STORE_KEY = 'se_confidence_v1'
const MAX_ENTRIES = 500

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') } catch { return [] }
}

function save(entries) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))) } catch {}
}

// rating: 1-5, topic: string, courseId: string|null
export function recordConfidence({ rating, topic, courseId, source }) {
  if (rating == null || rating < 1 || rating > 5) return
  const entries = load()
  entries.push({
    rating,
    topic: topic ? topic.trim() : null,
    courseId: courseId ?? null,
    source: source ?? 'session',
    timestamp: Date.now(),
  })
  save(entries)
}

export function getAllConfidence() {
  return load()
}

// Match confidence ratings against actual mastery scores by topic.
// Returns { calibrated, overconfident, underconfident } counts + per-topic gaps.
export function computeConfidenceGap(allMastery = []) {
  const confidence = load()
  if (!confidence.length || !allMastery.length) {
    return { calibrated: 0, overconfident: 0, underconfident: 0, topics: [] }
  }

  // For each topic that has both a confidence rating AND a mastery score,
  // compute the gap. Perceived: rating * 20 (1->20, 5->100). Actual: mastery score.
  const byTopic = {}
  confidence.forEach(c => {
    if (!c.topic) return
    const key = `${c.courseId ?? 'global'}::${c.topic.toLowerCase()}`
    // Keep most recent per topic.
    if (!byTopic[key] || byTopic[key].timestamp < c.timestamp) {
      byTopic[key] = c
    }
  })

  const topics = []
  Object.entries(byTopic).forEach(([key, entry]) => {
    const match = allMastery.find(m => `${m.courseId ?? 'global'}::${m.topic.toLowerCase()}` === key)
    if (!match || match.score == null) return
    const perceived = entry.rating * 20
    const actual = match.score
    const gap = perceived - actual
    topics.push({
      topic: entry.topic,
      courseId: entry.courseId,
      perceived,
      actual,
      gap,
      status: gap > 15 ? 'overconfident' : gap < -15 ? 'underconfident' : 'calibrated',
    })
  })

  const calibrated     = topics.filter(t => t.status === 'calibrated').length
  const overconfident  = topics.filter(t => t.status === 'overconfident').length
  const underconfident = topics.filter(t => t.status === 'underconfident').length

  return { calibrated, overconfident, underconfident, topics }
}
