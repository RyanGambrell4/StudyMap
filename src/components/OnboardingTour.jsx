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
      text-shadow: none !important;
      -webkit-font-smoothing: antialiased !important;
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
      text-shadow: none !important;
      -webkit-font-smoothing: antialiased !important;
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
    .driver-popover-next-btn::after {
      content: '' !important;
    }
    .driver-popover-prev-btn::before {
      content: '' !important;
    }
    .driver-overlay {
      background: rgba(0,0,0,0.3) !important;
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
          title: 'Welcome to StudyEdge AI',
          description: "Let's show you around in 60 seconds. You can skip this any time.",
          showButtons: ['next', 'close'],
        },
      },
      // Step 2: Dashboard
      {
        element: '#tour-nav-dashboard',
        popover: {
          title: 'Your Daily Dashboard',
          description: "See what's up next today, track your streak, and get an AI-generated study brief every morning.",
          side: 'bottom',
          align: 'start',
        },
      },
      // Step 3: Calendar / Schedule
      {
        element: '#tour-nav-calendar',
        popover: {
          title: 'Your Study Schedule',
          description: 'Your sessions are auto-scheduled around your courses and deadlines. Add sessions manually or let the AI fill your week.',
          side: 'bottom',
          align: 'start',
        },
      },
      // Step 4: Strategy hub (Study Coach, Grades, AI Tutor)
      {
        element: '#tour-nav-coach',
        popover: {
          title: 'Strategy Hub',
          description: 'Hover here to access the AI Study Coach, Grade Tracker, and AI Tutor. Generate a full week-by-week study plan, track your grades, or get help on any topic.',
          side: 'bottom',
          align: 'start',
        },
      },
      // Step 5: Brain Training hub
      {
        element: '#tour-nav-tools',
        popover: {
          title: 'Brain Training Hub',
          description: 'Hover here for Flashcards, Quizzes, Brain Dump, Quiz Burst, and Exam Rescue. Upload your notes and instantly generate study materials.',
          side: 'bottom',
          align: 'start',
        },
      },
      // Step 6: Done (centered)
      {
        popover: {
          title: "You're all set.",
          description: 'Start by adding your first course — press the + Course button on the dashboard. It takes 30 seconds.',
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
      overlayOpacity: 0.3,
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
