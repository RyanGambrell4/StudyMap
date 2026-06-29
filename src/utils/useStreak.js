import { useState, useCallback, useEffect } from 'react'
import { getCachedStreak, saveStreak } from '../lib/db'

const STORAGE_KEY = 'studyedge_streak'
const FREEZE_KEY = 'studyedge_streak_freeze'

function fromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `${d.getUTCFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`
}

function loadFreezeState() {
  try {
    const raw = localStorage.getItem(FREEZE_KEY)
    return raw ? JSON.parse(raw) : { count: 0, weekEarned: null }
  } catch { return { count: 0, weekEarned: null } }
}

function saveFreezeState(state) {
  try { localStorage.setItem(FREEZE_KEY, JSON.stringify(state)) } catch {}
}

function yesterday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

const EMPTY = { lastCompletedDate: null, currentStreak: 0 }

export function useStreak() {
  const [data, setData] = useState(() => {
    return getCachedStreak() ?? fromLocalStorage() ?? EMPTY
  })

  const [freezeCount, setFreezeCount] = useState(() => {
    const state = loadFreezeState()
    const thisWeek = getISOWeek()

    // Award 1 free freeze per week if not yet earned this week
    if (state.weekEarned !== thisWeek) {
      const updated = { count: state.count + 1, weekEarned: thisWeek }
      saveFreezeState(updated)
      return updated.count
    }
    return state.count
  })

  // Keep freeze count in sync with localStorage
  useEffect(() => {
    const state = loadFreezeState()
    if (state.count !== freezeCount) {
      saveFreezeState({ ...state, count: freezeCount })
    }
  }, [freezeCount])

  const recordCompletion = useCallback((todayStr) => {
    setData(prev => {
      if (prev.lastCompletedDate === todayStr) return prev

      const newStreak = prev.lastCompletedDate === yesterday(todayStr)
        ? prev.currentStreak + 1
        : 1

      const next = { lastCompletedDate: todayStr, currentStreak: newStreak }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      saveStreak(next).catch(() => {})
      return next
    })
  }, [])

  // Use a freeze: mark yesterday as completed so streak survives
  const useFreeze = useCallback((todayStr) => {
    setFreezeCount(prev => {
      if (prev <= 0) return prev
      const updated = prev - 1
      const freezeState = loadFreezeState()
      saveFreezeState({ ...freezeState, count: updated })
      return updated
    })

    const yesterdayStr = yesterday(todayStr)
    setData(prev => {
      if (prev.lastCompletedDate === todayStr || prev.lastCompletedDate === yesterdayStr) return prev
      const next = { lastCompletedDate: yesterdayStr, currentStreak: prev.currentStreak }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      saveStreak(next).catch(() => {})
      return next
    })
  }, [])

  return {
    currentStreak: data.currentStreak,
    lastCompletedDate: data.lastCompletedDate,
    recordCompletion,
    freezeCount,
    useFreeze,
  }
}
