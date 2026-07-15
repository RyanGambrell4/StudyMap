const KEY = 'studyedge_weak_topics'

export function addWeakTopics(topics) {
  if (!topics?.length) return
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    const cleaned = topics.map(t => t?.trim()).filter(Boolean)
    if (!cleaned.length) return
    const merged = [...existing, ...cleaned]
    const seen = new Set()
    const deduped = [...merged].reverse().filter(t => {
      const k = t.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).reverse().slice(-20)
    localStorage.setItem(KEY, JSON.stringify(deduped))
  } catch {}
}

export function getWeakTopics() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function getTopWeakTopic() {
  const topics = getWeakTopics()
  return topics.length ? topics[topics.length - 1] : null
}

export function clearWeakTopics() {
  localStorage.removeItem(KEY)
}
