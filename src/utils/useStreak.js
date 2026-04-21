import { useState, useCallback } from 'react'
import { getCachedStreak, saveStreak } from '../lib/db'

const STORAGE_KEY = 'studyedge_streak'

function fromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function yesterday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

const EMPTY = { lastCompletedDate: null, currentStreak: 0 }

export function useStreak() {
  const [data, setData] = useState(() => {
    // Prefer Supabase-backed cache (populated by initUserData before this renders),
    // fall back to localStorage for first-load or offline scenarios.
    return getCachedStreak() ?? fromLocalStorage() ?? EMPTY
  })

  const recordCompletion = useCallback((todayStr) => {
    setData(prev => {
      if (prev.lastCompletedDate === todayStr) return prev

      const newStreak = prev.lastCompletedDate === yesterday(todayStr)
        ? prev.currentStreak + 1
        : 1

      const next = { lastCompletedDate: todayStr, currentStreak: newStreak }
      // Write to localStorage immediately (sync) + Supabase (async)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      saveStreak(next).catch(() => {})
      return next
    })
  }, [])

  return {
    currentStreak: data.currentStreak,
    lastCompletedDate: data.lastCompletedDate,
    recordCompletion,
  }
}
