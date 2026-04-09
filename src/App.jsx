import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { initUserData, clearUserData, savePlan } from './lib/db'
import { getActivePlan, canAddCourse } from './lib/subscription'
import { useTheme } from './utils/useTheme'
import AuthScreen from './components/AuthScreen'
import Onboarding from './components/Onboarding'
import OutputView from './components/OutputView'
import PaywallModal from './components/PaywallModal'
import './index.css'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [session, setSession]   = useState(undefined) // undefined = still checking
  const [dbReady, setDbReady]   = useState(false)
  const [showOutput, setShowOutput]   = useState(false)
  const [courses, setCourses]         = useState([])
  const [schedule, setSchedule]       = useState({ hoursPerWeek: 15, preferredTime: 'Morning' })
  const [learningStyle, setLearningStyle]   = useState(null)
  const [yearLevel, setYearLevel]           = useState(null)
  const [assignments, setAssignments]       = useState([])
  const [initialCompletedIds, setInitialCompletedIds] = useState(null)

  // ── Paywall state ──────────────────────────────────────────────────────────
  const [paywallOpen, setPaywallOpen]     = useState(false)
  const [paywallTrigger, setPaywallTrigger] = useState('courses')

  const openPaywall = useCallback((trigger = 'courses') => {
    setPaywallTrigger(trigger)
    setPaywallOpen(true)
  }, [])

  // Tracks the latest completedIds/assignments so handleAddCourse can save immediately
  const latestPlanRef = useRef({ completedIds: [], assignments: [] })

  // ── Auth listener ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        clearUserData()
        setDbReady(false)
        setShowOutput(false)
        setCourses([])
        setYearLevel(null)
        setLearningStyle(null)
        setAssignments([])
        setInitialCompletedIds(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Load data after login ──────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return
    initUserData(session.user.id).then(data => {
      const plan = data.plan
      if (plan) {
        setCourses(plan.courses ?? [])
        setSchedule(plan.schedule ?? { hoursPerWeek: 15, preferredTime: 'Morning' })
        setLearningStyle(plan.learningStyle ?? null)
        setYearLevel(plan.yearLevel ?? '1st Year')
        setAssignments(plan.assignments ?? [])
        setInitialCompletedIds(new Set(plan.completedIds ?? []))
        setShowOutput(true)
      }
      setDbReady(true)
    })
  }, [session?.user?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSignOut = () => supabase.auth.signOut()

  const handleOnboardingComplete = ({ yearLevel: yl, learningStyle: ls, preferredTime }) => {
    setYearLevel(yl)
    setLearningStyle(ls)
    setSchedule({ hoursPerWeek: 15, preferredTime })
    setCourses([])
    setInitialCompletedIds(new Set())
    setShowOutput(true)
  }

  const handleSavePlan = (completedIds, updatedAssignments) => {
    const resolvedAssignments = updatedAssignments ?? assignments
    latestPlanRef.current = { completedIds: [...completedIds], assignments: resolvedAssignments }
    savePlan({
      courses,
      schedule,
      learningStyle,
      yearLevel,
      completedIds: [...completedIds],
      assignments: resolvedAssignments,
      savedAt: Date.now(),
    })
  }

  const handleAddCourse = (course) => {
    // Check course limit before adding
    if (!canAddCourse(courses.length)) {
      openPaywall('courses')
      return
    }
    const newCourses = [...courses, course]
    setCourses(newCourses)
    savePlan({
      courses: newCourses,
      schedule,
      learningStyle,
      yearLevel,
      completedIds: latestPlanRef.current.completedIds,
      assignments: latestPlanRef.current.assignments,
      savedAt: Date.now(),
    })
  }

  const handleEditPlan = () => {
    savePlan(null)
    setInitialCompletedIds(null)
    setAssignments([])
    setShowOutput(false)
    setCourses([])
    setYearLevel(null)
    setLearningStyle(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (session === undefined || (session && !dbReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="w-8 h-8 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
      </div>
    )
  }

  if (!session) return <AuthScreen />

  return (
    <>
      {showOutput ? (
        <OutputView
          courses={courses}
          schedule={schedule}
          learningStyle={learningStyle}
          yearLevel={yearLevel ?? '1st Year'}
          initialCompletedIds={initialCompletedIds ?? new Set()}
          initialAssignments={assignments}
          onSavePlan={handleSavePlan}
          onEditPlan={handleEditPlan}
          onSignOut={handleSignOut}
          onAddCourse={handleAddCourse}
          onToggleTheme={toggleTheme}
          theme={theme}
          userEmail={session.user.email}
          userId={session.user.id}
          onShowPaywall={openPaywall}
        />
      ) : (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}

      {/* Global paywall modal — rendered at App level so any component can trigger it */}
      {paywallOpen && (
        <PaywallModal
          trigger={paywallTrigger}
          onClose={() => setPaywallOpen(false)}
          userEmail={session?.user?.email}
          userId={session?.user?.id}
        />
      )}
    </>
  )
}
