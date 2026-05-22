/**
 * SM-2 Spaced Repetition Algorithm
 * quality: 0-5 (0=complete blackout, 3=correct with difficulty, 5=perfect)
 * Returns updated card state
 */
export function sm2(card, quality) {
  let { interval = 1, repetitions = 0, easeFactor = 2.5 } = card

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  } else {
    // Incorrect — reset
    repetitions = 0
    interval = 1
  }

  // Update ease factor
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)

  return {
    interval,
    repetitions,
    easeFactor,
    nextReview: nextReview.toISOString(),
    lastReviewed: new Date().toISOString(),
  }
}

/**
 * Sort cards by due date — cards due today or overdue first,
 * then new cards, then future cards
 */
export function sortCardsByDue(cards) {
  return [...cards].sort((a, b) => {
    const aDue = a.nextReview ? new Date(a.nextReview) : new Date(0)
    const bDue = b.nextReview ? new Date(b.nextReview) : new Date(0)
    return aDue - bDue
  })
}

/**
 * Get cards due for review today
 */
export function getDueCards(cards) {
  const now = new Date()
  return cards.filter(card => {
    if (!card.nextReview) return true // New card — always due
    return new Date(card.nextReview) <= now
  })
}

/**
 * Map button label to SM-2 quality score
 */
export const QUALITY_MAP = {
  'again': 0,
  'hard': 2,
  'good': 4,
  'easy': 5,
}
