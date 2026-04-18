import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { initUserData, clearUserData, savePlan } from './lib/db'
import { getActivePlan, canAddCourse, createCheckoutSession } from './lib/subscription'
import { useTheme } from './utils/useTheme'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
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

  // ── Landing / Auth screen state ─────────────────────────────────────────────
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('signup')

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
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

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

  const handleEditCourse = (idx, updatedCourse) => {
    const newCourses = courses.map((c, i) => i === idx ? updatedCourse : c)
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

  const handleDeleteCourse = (idx) => {
    const newCourses = courses.filter((_, i) => i !== idx)
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

  if (!session) {
    // The real landing page lives at / — the React app only hosts the
    // auth screen (?signup=1 / ?login=1) and OAuth error bouncebacks.
    const sp = new URLSearchParams(window.location.search)
    const urlSignup = sp.get('signup') === '1'
    const urlLogin = sp.get('login') === '1'
    const hasOAuthError = !!(sp.get('error') || sp.get('error_description'))
    if (showAuth || urlSignup || urlLogin || hasOAuthError) {
      const mode = urlSignup ? 'signup' : urlLogin ? 'login' : authMode
      return <AuthScreen initialMode={mode} onBack={() => { window.location.href = '/' }} />
    }
    // No auth intent — send them to the real landing page
    window.location.href = '/'
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="w-8 h-8 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
      </div>
    )
  }

  // ── Email verification gate ──────────────────────────────────────────────
  if (!session.user.email_confirmed_at) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-white font-medium">{session.user.email}</span>.
            <br />Click the link to verify your account and get started.
          </p>
          <button
            onClick={() => {
              supabase.auth.resend({ type: 'signup', email: session.user.email })
              alert('Confirmation email resent!')
            }}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Resend confirmation email
          </button>
          <div className="pt-2">
            <button
              onClick={handleSignOut}
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Paid plan checkout redirect ──────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search)
  const urlPlan = urlParams.get('plan')
  const urlBilling = ['monthly', 'semester', 'yearly'].includes(urlParams.get('billing')) ? urlParams.get('billing') : 'monthly'
  if (urlPlan && (urlPlan === 'pro' || urlPlan === 'unlimited') && getActivePlan() === 'free') {
    // Clear the URL param so we don't loop
    window.history.replaceState({}, '', window.location.pathname)
    createCheckoutSession(urlPlan, urlBilling, session.user.email, session.user.id).then(url => {
      if (url) window.location.href = url
    })
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="text-center space-y-4">
          <div className="w-8 h-8 mx-auto rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
          <p className="text-slate-400 text-sm">Redirecting to checkout…</p>
        </div>
      </div>
    )
  }

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
          onEditCourse={handleEditCourse}
          onDeleteCourse={handleDeleteCourse}
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
          currentPlan={getActivePlan()}
        />
      )}
    </>
  )
}
