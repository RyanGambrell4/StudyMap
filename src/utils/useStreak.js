import { useState, useCallback } from 'react'

const STORAGE_KEY = 'studyedge_streak'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { lastCompletedDate: null, currentStreak: 0 }
    return JSON.parse(raw)
  } catch {
    return { lastCompletedDate: null, currentStreak: 0 }
  }
}

function yesterday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export function useStreak() {
  const [data, setData] = useState(load)

  const recordCompletion = useCallback((todayStr) => {
    setData(prev => {
      if (prev.lastCompletedDate === todayStr) return prev // already recorded today

      const newStreak = prev.lastCompletedDate === yesterday(todayStr)
        ? prev.currentStreak + 1
        : 1

      const next = { lastCompletedDate: todayStr, currentStreak: newStreak }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return {
    currentStreak: data.currentStreak,
    lastCompletedDate: data.lastCompletedDate,
    recordCompletion,
  }
}
