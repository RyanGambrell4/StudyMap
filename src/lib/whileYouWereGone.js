/**
 * whileYouWereGone - one line about what the app did without her.
 *
 * The retention question is not "was the session good", it is "why open this
 * tomorrow". A tool hub has no answer: nothing happens between visits, so
 * every session is user initiated and the app is only ever as present as her
 * memory of it.
 *
 * Spaced repetition already gives a legitimate answer for free. Cards ripen on
 * a schedule whether she is here or not. Saying so is not a fabricated
 * notification, it is a report on state that genuinely changed.
 *
 * RULES
 *
 * Only speak when something actually changed. A "nothing new" line is worse
 * than silence: it teaches her the line carries no information, and then she
 * stops reading the one time it matters.
 *
 * Name her material. "Six cards on glycolysis came due" is a fact about her
 * biology course. "You have 6 items in your review queue" is a fact about a
 * database, and she can feel the difference.
 *
 * No guilt. This never mentions how long she was away, and never implies she
 * should have been here. The card ripened; that is all that is being said.
 */

const VISIT_KEY = 'studyedge_last_visit_v1'

/** Below this, "some cards came due" is not worth interrupting for. */
export const MIN_RIPENED = 2

/** Read the last visit timestamp, or null on a first ever visit. */
export function getLastVisit() {
  try {
    const raw = localStorage.getItem(VISIT_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

export function recordVisit(now = Date.now()) {
  try { localStorage.setItem(VISIT_KEY, String(now)) } catch { /* ignore */ }
}

function plural(n, one, many) {
  return n === 1 ? one : many
}

/**
 * Build the line. Pure, so the caller supplies the data and the clock.
 *
 * @param {object}  opts
 * @param {Array}   opts.due        items from getDueForReview: { topic, dueAt }
 * @param {number?} opts.lastVisit  epoch ms of her previous visit
 * @param {number}  opts.now
 * @returns {null | { line: string, topic: string|null, count: number }}
 */
export function buildWhileYouWereGone({ due = [], lastVisit = null, now = Date.now() } = {}) {
  // No previous visit means nothing "changed while she was gone", because
  // there was no gone. A first visit gets silence, not a manufactured event.
  if (lastVisit == null) return null
  if (!Array.isArray(due) || due.length === 0) return null

  // Only the ones that crossed into due SINCE she left. Cards that were
  // already waiting last time are not news, and reporting them every visit
  // is how a signal becomes wallpaper.
  const ripened = due.filter(d => {
    const at = Number(d?.dueAt)
    return Number.isFinite(at) && at > lastVisit && at <= now
  })
  if (ripened.length < MIN_RIPENED) return null

  // Lead with the topic that has the most ripened cards, so the line can name
  // one real thing rather than summing across her whole degree.
  const byTopic = new Map()
  for (const d of ripened) {
    const t = typeof d?.topic === 'string' ? d.topic.trim() : ''
    if (!t) continue
    byTopic.set(t, (byTopic.get(t) ?? 0) + 1)
  }

  let topTopic = null
  let topCount = 0
  for (const [topic, count] of byTopic) {
    if (count > topCount) { topTopic = topic; topCount = count }
  }

  const total = ripened.length

  if (topTopic && topCount >= MIN_RIPENED) {
    const rest = total - topCount
    const head = `${topCount} ${plural(topCount, 'card', 'cards')} on ${topTopic} came due`
    return {
      line: rest > 0 ? `${head}, and ${rest} more elsewhere.` : `${head}.`,
      topic: topTopic,
      count: total,
    }
  }

  // Spread thinly across many topics with no single owner. Still true, still
  // worth one line, just without a headline topic to name.
  return {
    line: `${total} ${plural(total, 'card', 'cards')} came due since you were last here.`,
    topic: null,
    count: total,
  }
}

export default { buildWhileYouWereGone, getLastVisit, recordVisit, MIN_RIPENED }
