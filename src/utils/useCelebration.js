import confetti from 'canvas-confetti'
import { useCallback, useRef } from 'react'

const todayStr = () => new Date().toISOString().split('T')[0]

export function useCelebration() {
  // Track light-confetti fires per day — resets automatically when date changes
  const lightRef = useRef({ date: todayStr(), count: 0 })

  const celebrate = useCallback((level = 'medium') => {
    if (level === 'light') {
      const today = todayStr()
      if (lightRef.current.date !== today) {
        lightRef.current = { date: today, count: 0 }
      }
      if (lightRef.current.count >= 2) return
      lightRef.current.count++
      confetti({
        particleCount: 60,
        spread: 50,
        origin: { y: 0.7 },
        disableForReducedMotion: true,
      })
    } else if (level === 'medium') {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        disableForReducedMotion: true,
      })
    } else if (level === 'big') {
      confetti({
        particleCount: 150,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        disableForReducedMotion: true,
      })
      setTimeout(() => {
        confetti({
          particleCount: 150,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.65 },
          disableForReducedMotion: true,
        })
      }, 150)
    }
  }, [])

  return celebrate
}
