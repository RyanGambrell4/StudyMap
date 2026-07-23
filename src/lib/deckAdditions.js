// deckAdditions.js — every miss, gap, or failed connection anywhere in the
// app appends a flashcard to the student's Study Tools deck. The deck stops
// being a one-shot generation and becomes the student's living personalized
// weakness catalog. Study Tools' SM-2 loop then schedules them for review.
//
// Dedupes both structurally (by front string) and semantically (via the
// existing embeddings helper) so heavy users don't end up with 500 near-dupes.

import { getCachedStudyTools, saveStudyTools } from './db'
import { dedupeAgainstExisting } from './embeddings'

const MAX_DECK_SIZE = 300

// Where a card came from — surfaces in the deck UI + used for analytics so
// we can see which tool is contributing the most learning capture.
export const SOURCE = {
  QUIZ_MISS: 'quiz_miss',
  CONNECTION_MISS: 'connection_miss',
  BRAIN_DUMP_GAP: 'brain_dump_gap',
  PRACTICE_EXAM_MISS: 'practice_exam_miss',
  PROBLEM_SOLVER: 'problem_solver',
  TEACH_IT_BACK: 'teach_it_back',
}

/**
 * Add one or more cards to the deck, deduping against what's already there.
 * Returns the number of cards actually added after dedup.
 *
 * @param {Array<{front, back, topic?, source, sourceMeta?}>} newCards
 * @param {object} opts
 * @param {number|null} opts.courseIdx - which course tab the deck belongs to
 * @param {boolean}     opts.skipEmbeddings - useful when the deck is empty
 */
export async function addCardsToDeck(newCards, { courseIdx = null, skipEmbeddings = false } = {}) {
  if (!Array.isArray(newCards) || !newCards.length) return { added: 0, deck: null }
  const clean = newCards
    .filter(c => c && typeof c.front === 'string' && c.front.trim().length > 0)
    .map(c => ({
      front: c.front.trim(),
      back: (c.back ?? '').toString().trim(),
      topic: c.topic ?? null,
      source: c.source ?? 'unknown',
      sourceMeta: c.sourceMeta ?? null,
      addedAt: Date.now(),
      // Every auto-added card starts with an SM-2 shape so the review queue
      // treats it like any hand-generated card.
      interval: 0, repetitions: 0, ease: 2.5, dueAt: Date.now(),
      isWeakTopic: true, // by definition — these came from misses
      reviewFirst: true,
    }))
  if (!clean.length) return { added: 0, deck: null }

  const existing = getCachedStudyTools()
  const existingCards = existing?.flashcards ?? []

  // Structural dedup: never add a card whose front matches an existing one.
  const existingFronts = new Set(existingCards.map(c => (c.front ?? '').toLowerCase().trim()))
  const structuralUnique = clean.filter(c => !existingFronts.has(c.front.toLowerCase()))
  if (!structuralUnique.length) return { added: 0, deck: existing }

  // Semantic dedup against the current deck via embeddings — fails open.
  let toAdd = structuralUnique
  if (!skipEmbeddings && existingCards.length > 0) {
    const { kept } = await dedupeAgainstExisting(structuralUnique, existingCards, 0.92)
    toAdd = kept.length ? kept : structuralUnique
  }

  const nextDeck = {
    ...existing,
    flashcards: [...toAdd, ...existingCards].slice(0, MAX_DECK_SIZE),
    lastAutoAddedAt: Date.now(),
  }
  if (courseIdx != null) nextDeck.courseIdx = courseIdx
  await saveStudyTools(nextDeck)
  return { added: toAdd.length, deck: nextDeck }
}

/**
 * Convenience wrappers so callers don't have to remember the shape.
 */
export function cardFromQuizMiss(question, courseId, courseName) {
  return {
    front: question.question,
    back: `${question.answer}${question.explanation ? ` — ${question.explanation}` : ''}`,
    topic: question.topic ?? null,
    source: SOURCE.QUIZ_MISS,
    sourceMeta: { courseId, courseName },
  }
}

export function cardFromConnectionMiss(connection, courseId, courseName) {
  return {
    front: connection.question || `How does ${connection.conceptA} relate to ${connection.conceptB}?`,
    back: connection.idealAnswer,
    topic: connection.conceptA ?? connection.conceptB ?? null,
    source: SOURCE.CONNECTION_MISS,
    sourceMeta: { courseId, courseName, conceptA: connection.conceptA, conceptB: connection.conceptB },
  }
}

export function cardFromBrainDumpGap(gap, courseId, courseName) {
  return {
    front: `Define / explain: ${gap}`,
    back: `You didn't mention this in your brain dump on ${new Date().toLocaleDateString()}. Look it up and come back.`,
    topic: gap,
    source: SOURCE.BRAIN_DUMP_GAP,
    sourceMeta: { courseId, courseName },
  }
}

export function cardFromPracticeExamMiss(question, courseId, courseName) {
  return {
    front: question.question,
    back: `${question.answer}${question.explanation ? ` — ${question.explanation}` : ''}`,
    topic: question.topic ?? null,
    source: SOURCE.PRACTICE_EXAM_MISS,
    sourceMeta: { courseId, courseName },
  }
}
