// Exam Autopsy
// Classify each practice-exam question into a cognitive skill tier
// (Recall / Application / Analysis) using cheap keyword + length heuristics.
// Purpose: after a practice exam, students see WHERE they broke — not just
// "you got 68%," but "you nail recall but application is where you leak points."
// That framing points them at the right kind of studying (drill vs. worked
// examples vs. teach-back).

const RECALL_KEYWORDS = [
  'define', 'definition', 'what is', 'what are', 'who is', 'who was',
  'name', 'list', 'identify', 'when did', 'when was', 'where is',
  'which of', 'true or false', 'the term', 'refers to',
]

const APPLICATION_KEYWORDS = [
  'calculate', 'solve', 'compute', 'apply', 'use the', 'given that',
  'find the', 'determine the', 'how much', 'how many', 'convert',
  'given a', 'suppose ', 'if a ', 'if the ',
]

const ANALYSIS_KEYWORDS = [
  'why', 'explain why', 'compare', 'contrast', 'evaluate', 'analyze',
  'assess', 'critique', 'justify', 'infer', 'predict', 'what would happen',
  'best explains', 'most likely', 'which best', 'primary reason',
  'implication', 'relationship between',
]

function containsAny(text, list) {
  const t = text.toLowerCase()
  return list.some(k => t.includes(k))
}

export function classifySkill(question = '') {
  const text = String(question ?? '')
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  if (containsAny(text, ANALYSIS_KEYWORDS)) return 'analysis'
  if (containsAny(text, APPLICATION_KEYWORDS)) return 'application'
  if (containsAny(text, RECALL_KEYWORDS)) return 'recall'

  // Length-based fallback for questions without giveaway keywords.
  if (wordCount >= 25) return 'analysis'
  if (wordCount >= 14) return 'application'
  return 'recall'
}

// graded: array of { q, given, correct } — correct is true/false/null (self-graded)
// Returns per-skill breakdown with counts and percentages.
export function analyzeExam(graded = []) {
  const buckets = {
    recall:      { total: 0, correct: 0, missed: 0 },
    application: { total: 0, correct: 0, missed: 0 },
    analysis:    { total: 0, correct: 0, missed: 0 },
  }
  for (const { q, correct } of graded) {
    if (correct === null) continue // skip self-graded short answers
    const skill = classifySkill(q?.question)
    buckets[skill].total += 1
    if (correct === true) buckets[skill].correct += 1
    else buckets[skill].missed += 1
  }
  const rows = ['recall', 'application', 'analysis'].map(skill => {
    const b = buckets[skill]
    const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : null
    return { skill, ...b, pct }
  })
  const nonEmpty = rows.filter(r => r.total > 0)
  if (nonEmpty.length === 0) return { rows, weakest: null, strongest: null, insight: null }

  const sortedByPct = [...nonEmpty].sort((a, b) => a.pct - b.pct)
  const weakest = sortedByPct[0]
  const strongest = sortedByPct[sortedByPct.length - 1]

  // Only surface a contrast insight if there's a real gap (≥ 20 pts) and both
  // buckets have enough questions to be meaningful.
  let insight = null
  const gap = strongest.pct - weakest.pct
  if (nonEmpty.length >= 2 && gap >= 20 && weakest.total >= 2 && strongest.total >= 2) {
    insight = { weakest, strongest, gap }
  }
  return { rows, weakest, strongest, insight }
}

export const SKILL_LABEL = {
  recall:      'Recall',
  application: 'Application',
  analysis:    'Analysis',
}

export const SKILL_HINT = {
  recall:      'Definitions, terms, dates. Fix with flashcards and quick quizzes.',
  application: 'Using a rule on a new case. Fix with worked examples.',
  analysis:    'Comparing, evaluating, explaining why. Fix with teach-back and outlines.',
}

export const SKILL_COLOR = {
  recall:      '#3B61C4',
  application: '#7C3AED',
  analysis:    '#059669',
}
