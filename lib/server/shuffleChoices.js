// Models put the correct answer first far more often than chance, so most
// answers came back "A". Every multiple-choice generator shuffles the
// options after generation and re-letters them, moving the answer and any
// per-option data (distractor tags) with their option.

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']
const PREFIX = /^\s*[A-F][.)]\s*/

const plain = s => String(s ?? '').replace(PREFIX, '').trim()

/** Fisher-Yates with an injectable random source for tests. */
function shuffled(arr, random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Shuffles one question's options. Options may be lettered ("A. text") or
 * plain; the output keeps the input's style. `answer` may be the full
 * option, the bare text or a single letter. Questions without at least two
 * options, or whose answer matches no option, are returned unchanged.
 */
export function shuffleQuestion(q, random = Math.random) {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return q
  const lettered = q.options.every(o => PREFIX.test(String(o)))
  const texts = q.options.map(plain)
  const answerRaw = String(q.answer ?? '').trim()
  let correct = texts.findIndex(t => t === plain(answerRaw))
  if (correct === -1 && /^[A-F]$/i.test(answerRaw)) correct = LABELS.indexOf(answerRaw.toUpperCase())
  if (correct < 0 || correct >= texts.length) return q

  const order = shuffled(texts.map((_, i) => i), random)
  const newTexts = order.map(i => texts[i])
  const fmt = (t, i) => (lettered ? `${LABELS[i]}. ${t}` : t)
  const options = newTexts.map(fmt)
  const newCorrect = order.indexOf(correct)
  const out = { ...q, options, answer: options[newCorrect] }

  // Distractor tags are keyed by the option string; re-key them.
  if (q.distractorTags && typeof q.distractorTags === 'object') {
    const byText = {}
    for (const [k, v] of Object.entries(q.distractorTags)) byText[plain(k)] = v
    out.distractorTags = Object.fromEntries(options.map((o, i) => [o, byText[newTexts[i]]]).filter(([, v]) => v != null))
  }
  return out
}

export function shuffleChoices(questions, random = Math.random) {
  return Array.isArray(questions) ? questions.map(q => shuffleQuestion(q, random)) : questions
}
