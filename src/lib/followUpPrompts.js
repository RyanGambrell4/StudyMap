// Follow-up prompts
// Generate 3 self-check questions after a Focus session — the student
// silently answers each one and taps confidence. No AI call needed: template
// prompts driven by the topic + session type give a real reinforcement lift.

const TEMPLATES = [
  ({ topic }) => `Can you define ${topic} in your own words, without notes?`,
  ({ topic }) => `Name one real-world example where ${topic} shows up.`,
  ({ topic }) => `What does ${topic} connect to from an earlier chapter?`,
  ({ topic }) => `If you had to teach ${topic} to a friend in 60 seconds, what's the first sentence?`,
  ({ topic }) => `What's the most common mistake people make with ${topic}?`,
  ({ topic }) => `What's the key formula, principle, or definition to remember about ${topic}?`,
  ({ topic }) => `How would a test question on ${topic} likely be worded?`,
]

// Pick 3 distinct templates deterministically per (topic + sessionType) so the
// same session doesn't shuffle prompts on re-render but the next session gets
// fresh ones.
function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function generateFollowUpPrompts({ topic, sessionType, courseName } = {}) {
  const cleanTopic = String(topic ?? sessionType ?? courseName ?? 'this topic').trim()
  if (!cleanTopic) return []
  const seed = hashSeed(`${cleanTopic}|${sessionType ?? ''}`)
  const indices = []
  const pool = TEMPLATES.map((_, i) => i)
  // Shuffle via seeded lookup — pick 3 non-repeating.
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seed + i * 13) % pool.length
    indices.push(pool.splice(idx, 1)[0])
  }
  return indices.map(i => TEMPLATES[i]({ topic: cleanTopic }))
}
