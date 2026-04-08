import confetti from 'canvas-confetti'
import { useCallback } from 'react'

export function useCelebration() {
  const celebrate = useCallback((level = 'medium') => {
    if (level === 'light') {
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
