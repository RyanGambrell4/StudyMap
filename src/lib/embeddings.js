// Semantic flashcard deduplication using OpenAI embeddings

/**
 * Cosine similarity between two vectors
 */
function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Deduplicate flashcards by semantic similarity.
 * Returns cards with duplicates removed (keeps first of each similar group).
 * threshold: 0.92 = very similar, 0.85 = somewhat similar
 */
export async function deduplicateFlashcards(cards, threshold = 0.90) {
  if (cards.length <= 1) return cards

  try {
    // Get embeddings for all card fronts
    const texts = cards.map(c => c.front ?? c.question ?? c.term ?? '')
    const res = await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    })

    if (!res.ok) return cards // Fail open
    const { embeddings } = await res.json()
    if (!embeddings?.length) return cards

    // Greedy deduplication: keep a card unless it's too similar to an already-kept card
    const kept = [0] // Always keep first card
    for (let i = 1; i < cards.length; i++) {
      let isDuplicate = false
      for (const keptIdx of kept) {
        const sim = cosineSim(embeddings[i], embeddings[keptIdx])
        if (sim >= threshold) {
          isDuplicate = true
          break
        }
      }
      if (!isDuplicate) kept.push(i)
    }

    return kept.map(i => cards[i])
  } catch {
    return cards // Fail open - never break flashcard generation
  }
}

/**
 * Find cards similar to a given query (for search/suggestions)
 */
export async function findSimilarCards(query, cards, topK = 3) {
  if (!cards.length || !query) return []

  try {
    const texts = [query, ...cards.map(c => c.front ?? c.question ?? c.term ?? '')]
    const res = await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    })

    if (!res.ok) return []
    const { embeddings } = await res.json()
    if (!embeddings?.length) return []

    const [queryEmbed, ...cardEmbeds] = embeddings
    const scored = cards.map((card, i) => ({
      card,
      score: cosineSim(queryEmbed, cardEmbeds[i]),
    }))

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(s => s.score > 0.7)
      .map(s => s.card)
  } catch {
    return []
  }
}
