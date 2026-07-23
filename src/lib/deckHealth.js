// deckHealth.js — one-glance summary of the state of the student's
// flashcard deck. Reads from the existing Study Tools cache + SM-2 fields
// so no new schema. Used by the Deck Health panel on the Study Tools hub.

import { getCachedStudyTools } from './db'

const DAY_MS = 86_400_000

/**
 * Return a snapshot of the deck's current state.
 *
 * @returns {{
 *   total: number,
 *   dueToday: number,
 *   dueThisWeek: number,
 *   stale: number,          // not reviewed in 14+ days
 *   consistentlyMissed: number, // ease <= 1.7 or repeatedly Again-rated
 *   fromMisses: number,     // auto-added by another feature this month
 *   topicBreakdown: Array<{ topic: string, count: number, dueNow: number }>,
 *   newestSource: string|null, // most recent SOURCE tag on an auto-add
 *   lastAutoAddedAt: number|null,
 *   recommendedAction: string
 * }}
 */
export function getDeckHealth() {
  const tools = getCachedStudyTools()
  const cards = tools?.flashcards ?? []
  const now = Date.now()

  const total = cards.length
  if (total === 0) {
    return {
      total: 0,
      dueToday: 0, dueThisWeek: 0, stale: 0, consistentlyMissed: 0, fromMisses: 0,
      topicBreakdown: [], newestSource: null, lastAutoAddedAt: null,
      recommendedAction: 'Generate a deck from your notes to get started.',
    }
  }

  let dueToday = 0
  let dueThisWeek = 0
  let stale = 0
  let consistentlyMissed = 0
  let fromMisses = 0

  const topicMap = new Map() // topic -> { count, dueNow }
  let newestAuto = { at: 0, source: null }
  const monthAgo = now - 30 * DAY_MS

  for (const c of cards) {
    const dueAt = c.dueAt ?? c.addedAt ?? 0
    if (dueAt <= now) dueToday += 1
    if (dueAt <= now + 7 * DAY_MS) dueThisWeek += 1

    const lastTouched = c.lastReviewedAt ?? c.addedAt ?? 0
    if (lastTouched && now - lastTouched >= 14 * DAY_MS) stale += 1

    if (typeof c.ease === 'number' && c.ease <= 1.7) consistentlyMissed += 1

    if (c.source && c.source !== 'unknown' && c.source !== 'generated' && (c.addedAt ?? 0) >= monthAgo) {
      fromMisses += 1
      if ((c.addedAt ?? 0) > newestAuto.at) newestAuto = { at: c.addedAt, source: c.source }
    }

    const t = (c.topic ?? 'Untagged').trim() || 'Untagged'
    const entry = topicMap.get(t) ?? { topic: t, count: 0, dueNow: 0 }
    entry.count += 1
    if (dueAt <= now) entry.dueNow += 1
    topicMap.set(t, entry)
  }

  const topicBreakdown = [...topicMap.values()]
    .sort((a, b) => b.dueNow - a.dueNow || b.count - a.count)
    .slice(0, 5)

  const recommendedAction =
    dueToday >= 8 ? `You have ${dueToday} cards due — start a 10-min review.` :
    consistentlyMissed >= 5 ? `${consistentlyMissed} cards you keep missing — worth a targeted drill.` :
    stale >= 5 ? `${stale} cards untouched in 2 weeks — refresh them before they decay further.` :
    dueToday > 0 ? `${dueToday} card${dueToday === 1 ? '' : 's'} due — knock them out.` :
    'Deck is clean. Add source material or run a Quiz Burst to feed it more.'

  return {
    total,
    dueToday,
    dueThisWeek,
    stale,
    consistentlyMissed,
    fromMisses,
    topicBreakdown,
    newestSource: newestAuto.source,
    lastAutoAddedAt: newestAuto.at || tools?.lastAutoAddedAt || null,
    recommendedAction,
  }
}

/**
 * Human-friendly label for a card's source tag. Used in the deck-health
 * "Recent additions" line so students see where cards came from.
 */
export function labelForSource(source) {
  return {
    quiz_miss: 'Quiz Burst misses',
    connection_miss: 'Failed Connections',
    brain_dump_gap: 'Brain Dump gaps',
    practice_exam_miss: 'Practice Exam misses',
    problem_solver: 'Problem Solver',
    teach_it_back: 'Teach-It-Back',
  }[source] ?? 'auto-adds'
}
