import { useEffect, useRef, useCallback } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_KEY = 'studyedge_tour_complete'

// Inject dark-theme overrides for driver.js popover
const STYLE_ID = 'studyedge-tour-styles'
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .driver-popover {
      background-color: #111827 !important;
      border: 1px solid #1e293b !important;
      color: #f1f5f9 !important;
      border-radius: 14px !important;
      box-shadow: 0 25px 50px rgba(0,0,0,0.6) !important;
      max-width: 340px !important;
      padding: 20px 22px !important;
    }
    .driver-popover-title {
      color: #ffffff !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      margin-bottom: 8px !important;
    }
    .driver-popover-description {
      color: #cbd5e1 !important;
      font-size: 13px !important;
      line-height: 1.6 !important;
    }
    .driver-popover-arrow-side-left .driver-popover-arrow {
      border-right-color: #111827 !important;
    }
    .driver-popover-arrow-side-right .driver-popover-arrow {
      border-left-color: #111827 !important;
    }
    .driver-popover-arrow-side-top .driver-popover-arrow {
      border-bottom-color: #111827 !important;
    }
    .driver-popover-arrow-side-bottom .driver-popover-arrow {
      border-top-color: #111827 !important;
    }
    .driver-popover-footer {
      margin-top: 16px !important;
      gap: 8px !important;
    }
    .driver-popover-prev-btn {
      background: transparent !important;
      border: 1px solid #334155 !important;
      color: #94a3b8 !important;
      border-radius: 8px !important;
      padding: 7px 14px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
    }
    .driver-popover-prev-btn:hover {
      border-color: #475569 !important;
      color: #cbd5e1 !important;
    }
    .driver-popover-next-btn {
      background: #6366f1 !important;
      border: none !important;
      color: #ffffff !important;
      border-radius: 8px !important;
      padding: 7px 14px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }
    .driver-popover-next-btn:hover {
      background: #4f46e5 !important;
    }
    .driver-popover-close-btn {
      color: #64748b !important;
      font-size: 18px !important;
    }
    .driver-popover-close-btn:hover {
      color: #94a3b8 !important;
    }
    .driver-popover-progress-text {
      color: #64748b !important;
      font-size: 12px !important;
    }
    .driver-overlay {
      background: rgba(0,0,0,0.55) !important;
    }
  `
  document.head.appendChild(style)
}

export default function OnboardingTour({ onReady }) {
  const driverRef = useRef(null)

  const startTour = useCallback(() => {
    injectStyles()

    if (driverRef.current) {
      driverRef.current.destroy()
    }

    const steps = [
      // Step 1: Welcome (centered, no element)
      {
        popover: {
          title: 'Welcome to StudyEdge',
          description: "Let's show you around. This takes about 60 seconds.",
          showButtons: ['next', 'close'],
        },
      },
      // Step 2: Dashboard / Courses
      {
        element: '#tour-nav-dashboard',
        popover: {
          title: 'Start Here: Your Courses',
          description: 'Add your courses, exam dates, and target grades. Everything else builds from your course list.',
          side: 'right',
          align: 'center',
        },
      },
      // Step 3: Calendar
      {
        element: '#tour-nav-calendar',
        popover: {
          title: 'Your Study Schedule',
          description: 'Your study sessions live here. They are automatically built around your courses and deadlines.',
          side: 'right',
          align: 'center',
        },
      },
      // Step 4: Study Coach (centered — opened from Dashboard)
      {
        popover: {
          title: 'Study Coach',
          description: 'Generate a full week-by-week AI study plan for any course. Just tell it your goal and exam date.',
        },
      },
      // Step 5: Session Blueprint (centered)
      {
        popover: {
          title: 'Session Blueprint',
          description: 'Before every study session, generate a minute-by-minute AI plan for exactly what to work on.',
        },
      },
      // Step 6: Focus Mode (centered)
      {
        popover: {
          title: 'Focus Mode',
          description: 'Hit Start Session and StudyEdge runs the clock. Flashcards, active recall, and a structured timer built in.',
        },
      },
      // Step 7: Study Tools
      {
        element: '#tour-nav-tools',
        popover: {
          title: 'Study Tools',
          description: 'Upload your notes or slides and instantly generate flashcards and quizzes.',
          side: 'right',
          align: 'center',
        },
      },
      // Step 8: Done (centered)
      {
        popover: {
          title: "That's it.",
          description: 'Start by adding your first course. Takes 30 seconds.',
          showButtons: ['previous', 'next'],
          nextBtnText: "Let's go",
        },
      },
    ]

    const driverInstance = driver({
      animate: true,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      allowClose: true,
      overlayOpacity: 0.55,
      nextBtnText: 'Next',
      prevBtnText: 'Previous',
      steps,
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, '1')
        driverInstance.destroy()
      },
    })

    driverRef.current = driverInstance
    driverInstance.drive()
  }, [])

  useEffect(() => {
    onReady?.(startTour)

    // Auto-start on first visit
    if (!localStorage.getItem(TOUR_KEY)) {
      // Short delay so the app finishes rendering before the tour kicks in
      const timer = setTimeout(startTour, 800)
      return () => clearTimeout(timer)
    }
  }, [startTour, onReady])

  return null
}
