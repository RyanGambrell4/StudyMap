function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateQuiz(flashcards) {
  if (!flashcards.length) return []

  const deck = shuffle([...flashcards])
  const count = Math.min(10, deck.length)
  const questions = []

  for (let i = 0; i < count; i++) {
    const card = deck[i]
    const qType = i % 3

    if (qType === 0) {
      // Multiple choice: show front, pick correct back from 4 options
      const otherBacks = deck
        .filter((_, j) => j !== i)
        .map(c => c.back)
      const distractors = shuffle(otherBacks).slice(0, 3)
      const options = shuffle([card.back, ...distractors])
      questions.push({
        type: 'mc',
        question: card.front,
        options,
        answer: card.back,
      })
    } else if (qType === 1) {
      // True / False: correct statement or swapped definition
      const isTrue = Math.random() > 0.5
      if (isTrue || deck.length < 2) {
        questions.push({
          type: 'tf',
          question: `"${card.front}" — ${card.back.slice(0, 120)}`,
          answer: true,
        })
      } else {
        const other = deck.find((_, j) => j !== i)
        questions.push({
          type: 'tf',
          question: `"${card.front}" — ${other.back.slice(0, 120)}`,
          answer: false,
        })
      }
    } else {
      // Fill in the blank: show definition, answer is the term
      questions.push({
        type: 'fill',
        question: card.back.slice(0, 200),
        hint: 'What term or concept is being described?',
        answer: card.front,
      })
    }
  }

  return questions
}
