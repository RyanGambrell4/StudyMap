import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { initUserData, clearUserData, savePlan, refreshSubscription } from './lib/db'
import { getActivePlan, canAddCourse, createCheckoutSession } from './lib/subscription'
import { useTheme } from './utils/useTheme'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
import Onboarding from './components/Onboarding'
import OutputView from './components/OutputView'
import PaywallModal from './components/PaywallModal'
import './index.css'

export default function App() {
  useTheme()
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

  // ── Password recovery state ────────────────────────────────────────────────
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [newPassword, setNewPassword]           = useState('')
  const [confirmPassword, setConfirmPassword]   = useState('')
  const [pwState, setPwState]                   = useState('') // '' | 'loading' | 'success' | 'error'
  const [pwError, setPwError]                   = useState('')

  // ── Email verification resend state ────────────────────────────────────────
  const [resendState, setResendState] = useState('') // '' | 'sending' | 'sent' | 'error'

  // ── Paywall state ──────────────────────────────────────────────────────────
  const [paywallOpen, setPaywallOpen]     = useState(false)
  const [paywallTrigger, setPaywallTrigger] = useState('courses')

  // ── Checkout success banner ────────────────────────────────────────────────
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)

  // Capture checkout intent on mount before Supabase PKCE exchange clears the URL
  const [checkoutIntent] = useState(() => {
    const sp = new URLSearchParams(window.location.search)
    const plan = sp.get('plan')
    const billing = sp.get('billing')
    const trial = sp.get('trial') === '1'
    if (plan === 'pro' || plan === 'unlimited') {
      return { plan, billing: ['monthly', 'semester', 'yearly'].includes(billing) ? billing : 'monthly', trial }
    }
    return null
  })

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
      if (_event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
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

  // ── Checkout success handler ───────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !dbReady) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') !== 'success') return
    window.history.replaceState({}, '', window.location.pathname)
    refreshSubscription(session.user.id).then(() => setCheckoutSuccess(true))
  }, [session?.user?.id, dbReady])

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

    // Detect an in-progress OAuth callback so we don't redirect the user
    // away before Supabase has a chance to exchange the code for a session.
    const hasOAuthCode = !!sp.get('code')
    const hasOAuthHash = typeof window !== 'undefined' && window.location.hash.includes('access_token')
    const inOAuthCallback = hasOAuthCode || hasOAuthHash

    // Detect an existing Supabase session in localStorage. When the Supabase
    // client is still booting (before getSession resolves), `session` is
    // null/undefined even though a valid token is sitting in storage. If we
    // blindly redirect to '/', the landing-page bounce script sees the
    // session and redirects us right back to '/app' — creating an infinite
    // flip-flop that dumps the user on the marketing page.
    let hasStoredSession = false
    try {
      if (typeof window !== 'undefined') {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          if (!key) continue
          if (key.startsWith('sb-') && key.includes('-auth-token')) {
            const val = window.localStorage.getItem(key)
            if (val && val.includes('access_token')) { hasStoredSession = true; break }
          }
        }
      }
    } catch {}

    if (showAuth || urlSignup || urlLogin || hasOAuthError) {
      const mode = urlSignup ? 'signup' : urlLogin ? 'login' : authMode
      return <AuthScreen initialMode={mode} onBack={() => { window.location.href = '/' }} />
    }

    // Mid-OAuth callback OR Supabase still hydrating a stored session —
    // hold with a spinner. onAuthStateChange will fire and we'll render.
    if (inOAuthCallback || hasStoredSession) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
          <div className="text-center space-y-4">
            <div className="w-8 h-8 mx-auto rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
            <p className="text-slate-400 text-sm">Signing you in…</p>
          </div>
        </div>
      )
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
            disabled={resendState === 'sending'}
            onClick={async () => {
              setResendState('sending')
              try {
                const { error } = await supabase.auth.resend({ type: 'signup', email: session.user.email })
                if (error) throw error
                setResendState('sent')
                setTimeout(() => setResendState(''), 5000)
              } catch {
                setResendState('error')
                setTimeout(() => setResendState(''), 5000)
              }
            }}
            className="text-sm font-medium transition-colors disabled:opacity-50"
            style={{ color: resendState === 'sent' ? '#4ade80' : resendState === 'error' ? '#f87171' : '#818cf8' }}
          >
            {resendState === 'sending' ? 'Sending…' : resendState === 'sent' ? '✓ Email resent — check your inbox' : resendState === 'error' ? 'Failed to resend — try again' : 'Resend confirmation email'}
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

  // ── Password recovery screen ────────────────────────────────────────────
  if (passwordRecovery) {
    const handlePasswordUpdate = async (e) => {
      e.preventDefault()
      if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
      if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
      setPwError('')
      setPwState('loading')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { setPwError(error.message); setPwState('error') }
      else {
        setPwState('success')
        setTimeout(() => { setPasswordRecovery(false); setNewPassword(''); setConfirmPassword(''); setPwState('') }, 2000)
      }
    }
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <img src="/favicon.png" alt="StudyEdge AI" className="w-9 h-9 rounded-xl" style={{ objectFit: 'contain' }} />
            <span className="text-white font-bold text-xl tracking-tight">StudyEdge AI</span>
          </div>
          <div className="rounded-2xl p-7" style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}>
            <h1 className="text-white font-bold text-xl mb-1">Set a new password</h1>
            <p className="text-slate-500 text-sm mb-6">Choose a strong password for your account.</p>
            {pwState === 'success' ? (
              <div className="rounded-xl px-4 py-4 text-center text-emerald-300 text-sm font-medium" style={{ backgroundColor: '#052e16', border: '1px solid #14532d' }}>
                ✓ Password updated! Taking you to the app…
              </div>
            ) : (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-1.5">New password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8}
                    className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-sm"
                    style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-1.5">Confirm password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required minLength={8}
                    className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-sm"
                    style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }} />
                </div>
                {pwError && (
                  <div className="rounded-xl px-4 py-3 text-red-300 text-sm" style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d' }}>{pwError}</div>
                )}
                <button type="submit" disabled={pwState === 'loading'}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 0 24px #6366f130' }}>
                  {pwState === 'loading' ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Paid plan checkout redirect ──────────────────────────────────────────
  if (checkoutIntent && getActivePlan() === 'free') {
    window.history.replaceState({}, '', window.location.pathname)
    createCheckoutSession(checkoutIntent.plan, checkoutIntent.billing, session.user.email, session.user.id, { trial: checkoutIntent.trial }).then(url => {
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

      {/* Checkout success banner */}
      {checkoutSuccess && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111827', border: '1px solid #22c55e', borderRadius: 12,
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>You're on the plan, welcome!</span>
          <button
            onClick={() => setCheckoutSuccess(false)}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
      )}
    </>
  )
}
