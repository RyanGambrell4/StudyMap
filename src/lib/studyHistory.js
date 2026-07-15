const KEY = 'studyedge_study_history'

export function addStudySession({ tool, score, topic, courseName }) {
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    const entry = {
      tool,
      score: typeof score === 'number' ? score : null,
      topic: topic || null,
      courseName: courseName || null,
      date: new Date().toISOString(),
    }
    const updated = [...existing, entry].slice(-50)
    localStorage.setItem(KEY, JSON.stringify(updated))
  } catch {}
}

export function getStudyHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return [...items].reverse()
  } catch { return [] }
}

export function getToolSessionsThisWeek(toolLabel) {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const items = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return items.filter(s => s.tool === toolLabel && s.date >= cutoff).length
  } catch { return 0 }
}
