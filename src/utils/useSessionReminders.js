import { useEffect, useRef } from 'react'

const ASKED_KEY = 'studyedge_notifications_asked'

function requestPermissionOnce() {
  if (!('Notification' in window)) return
  try {
    const asked = localStorage.getItem(ASKED_KEY)
    if (asked) return
    localStorage.setItem(ASKED_KEY, 'true')
    Notification.requestPermission()
  } catch {}
}

function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted'
}

function timeToMinutes(str) {
  if (!str) return null
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
  return h * 60 + min
}

export function useSessionReminders(allSessions, completedIds, todayStr) {
  const firedRef = useRef(new Set())

  // Ask for permission once on first call
  useEffect(() => {
    requestPermissionOnce()
  }, [])

  useEffect(() => {
    if (!canNotify()) return

    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    const timeouts = []

    const todaySessions = allSessions.filter(
      s => s.dateStr === todayStr && !completedIds.has(s.id)
    )

    for (const session of todaySessions) {
      const sessionMinutes = timeToMinutes(session.startTime)
      if (sessionMinutes === null) continue

      const notifId = `${session.id}-reminder`
      if (firedRef.current.has(notifId)) continue

      // Minutes until the session starts
      const minutesUntil = sessionMinutes - nowMinutes

      // Only schedule if session is within the next 30 minutes (and hasn't started yet)
      if (minutesUntil < 0 || minutesUntil > 30) continue

      // Fire the notification after the appropriate delay
      // (i.e. at exactly 30 min before start — but if we're already past that, fire soon)
      const targetNotifMinutes = sessionMinutes - 30
      const delayMs = Math.max(0, (targetNotifMinutes - nowMinutes) * 60 * 1000)

      const tid = setTimeout(() => {
        if (!canNotify()) return
        if (firedRef.current.has(notifId)) return
        firedRef.current.add(notifId)

        const minutesLeft = sessionMinutes - (new Date().getHours() * 60 + new Date().getMinutes())
        const timeLabel = minutesLeft <= 1 ? 'now' : `in ${minutesLeft} minutes`

        new Notification('Time to study 📚', {
          body: `${session.courseName} — ${session.sessionType} starts ${timeLabel}`,
          tag: notifId,
        })
      }, delayMs)

      timeouts.push(tid)
    }

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [allSessions, completedIds, todayStr])
}
