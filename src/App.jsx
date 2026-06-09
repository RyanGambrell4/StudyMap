import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { initUserData, clearUserData, savePlan, refreshSubscription, saveEmailDigest } from './lib/db'
import { getActivePlan, canAddCourse, createCheckoutSession, hasUsedTrial, isTrialActive, getCachedSubscription, TRIAL_DURATION_DAYS } from './lib/subscription'
import { useTheme } from './utils/useTheme'
import { initAnalytics, identifyUser, resetUser, track, register, registerOnce } from './lib/analytics'
import { captureReferralParam, getStoredReferrer, clearStoredReferrer } from './lib/referral'
import SharedPlanView from './components/SharedPlanView'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
import Spinner from './components/ui/spinner'
import Onboarding from './components/Onboarding'
import OutputView from './components/OutputView'
import PaywallModal from './components/PaywallModal'
import './index.css'

export default function App() {
  useTheme()
  useEffect(() => {
    initAnalytics()
    captureReferralParam()
    // 'surface' must overwrite — if the user navigated from the marketing site,
    // PostHog's super-properties cache still has surface: 'marketing'.
    register({ surface: 'app' })
    // Stamp acquisition info onto the user permanently, even pre-signup,
    // so every later event can be sliced by source/UTM in PostHog.
    const sp = new URLSearchParams(window.location.search)
    registerOnce({
      utm_source: sp.get('utm_source'),
      utm_medium: sp.get('utm_medium'),
      utm_campaign: sp.get('utm_campaign'),
      utm_content: sp.get('utm_content'),
      utm_term: sp.get('utm_term'),
      referrer: document.referrer || null,
      landing_path: window.location.pathname,
    })
  }, [])
  const [session, setSession]   = useState(undefined) // undefined = still checking
  const [dbReady, setDbReady]   = useState(false)
  const [showOutput, setShowOutput]   = useState(false)
  const [courses, setCourses]         = useState([])
  const [schedule, setSchedule]       = useState({ hoursPerWeek: 15, preferredTime: 'Morning' })
  const [learningStyle, setLearningStyle]   = useState(null)
  const [yearLevel, setYearLevel]           = useState(null)
  const [schoolType, setSchoolType]         = useState(null)
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

  // ── Checkout cancel banner ─────────────────────────────────────────────────
  const [showCheckoutCancelBanner, setShowCheckoutCancelBanner] = useState(false)

  // Capture checkout intent on mount before Supabase PKCE exchange clears the URL
  const [checkoutIntent] = useState(() => {
    const sp = new URLSearchParams(window.location.search)
    const plan = sp.get('plan')
    const billing = sp.get('billing')
    const trial = sp.get('trial') === '1'
    if (plan === 'pro' || plan === 'unlimited') {
      return { plan, billing: ['weekly', 'monthly', 'yearly', 'semester'].includes(billing) ? billing : 'weekly', trial }
    }
    return null
  })

  const openPaywall = useCallback((trigger = 'courses') => {
    setPaywallTrigger(trigger)
    setPaywallOpen(true)
    const unlimitedTriggers = new Set(['tutorMemory', 'practiceExamAnalytics', 'unlimited'])
    track('paywall_shown', {
      trigger_feature: trigger,
      plan_required: unlimitedTriggers.has(trigger) ? 'unlimited' : 'pro',
      current_plan: getActivePlan(),
    })
  }, [])

  // Any component can open the paywall by dispatching `studyedge:open-paywall`
  // with `detail: { trigger: '...' }`. Used by PracticeExamResults upsell card.
  useEffect(() => {
    const handler = (e) => openPaywall(e.detail?.trigger ?? 'courses')
    window.addEventListener('studyedge:open-paywall', handler)
    return () => window.removeEventListener('studyedge:open-paywall', handler)
  }, [openPaywall])

  // Trial expiry tracking. When a user who used the trial returns and the
  // trial window has now passed (and they did not convert to paid), fire
  // trial_expired once per browser. Uses localStorage to debounce across
  // sessions so we never double-count a single trial expiry.
  useEffect(() => {
    const sub = getCachedSubscription()
    if (!sub?.trial_activated || !sub?.trial_start_date) return
    if (isTrialActive()) return
    const plan = getActivePlan()
    if (plan === 'pro' || plan === 'unlimited') return // converted
    const stamp = `studyedge_trial_expired_${sub.trial_start_date}`
    if (localStorage.getItem(stamp) === '1') return
    track('trial_expired', {
      days_used: TRIAL_DURATION_DAYS,
      trial_start_date: sub.trial_start_date,
    })
    localStorage.setItem(stamp, '1')
  }, [session])

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
      if (_event === 'SIGNED_IN' && session?.user) {
        const createdAtIso = session.user.created_at ? new Date(session.user.created_at).toISOString() : null
        const createdAtMs = session.user.created_at ? new Date(session.user.created_at).getTime() : 0
        const isFreshSignup = createdAtMs && Date.now() - createdAtMs < 10 * 60 * 1000 // 10 minutes
        identifyUser(session.user.id, {
          email: session.user.email,
          signup_date: createdAtIso,
          auth_provider: session.user.app_metadata?.provider ?? 'email',
          name: session.user.user_metadata?.name ?? null,
        })
        register({ auth_provider: session.user.app_metadata?.provider ?? 'email' })
        track('user_signed_in', { fresh_signup: !!isFreshSignup, auth_provider: session.user.app_metadata?.provider ?? 'email' })
        if (isFreshSignup) track('signup_completed', { auth_provider: session.user.app_metadata?.provider ?? 'email' })
        // Welcome email — only on actual signup, not every login.
        // Fresh signups have created_at within ~minutes of now AND have not received it before (localStorage flag).
        const welcomeKey = `studyedge_welcome_sent_${session.user.id}`
        if (isFreshSignup && !localStorage.getItem(welcomeKey)) {
          fetch('/api/welcome-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: session.user.email,
              userId: session.user.id,
              firstName: session.user.user_metadata?.name,
              createdAt: session.user.created_at,
            }),
          }).then(() => localStorage.setItem(welcomeKey, '1')).catch(() => {})
        }
        // Save referral — fire-and-forget, won't overwrite if already set
        const referrer = getStoredReferrer()
        if (referrer && referrer !== session.user.id) {
          supabase.from('user_data').select('subscription').eq('user_id', session.user.id).maybeSingle()
            .then(({ data }) => {
              if (data?.subscription?.referredBy) return // already saved
              const merged = { ...(data?.subscription ?? {}), referredBy: referrer }
              return supabase.from('user_data').upsert(
                { user_id: session.user.id, subscription: merged, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
              )
            })
            .then(() => clearStoredReferrer())
            .catch(() => {})
        }
      }
      setSession(session)
      if (!session) {
        resetUser()
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
        setSchoolType(plan.schoolType ?? null)
        setAssignments(plan.assignments ?? [])
        setInitialCompletedIds(new Set(plan.completedIds ?? []))
        setShowOutput(true)
      }
      // Attach the full user profile as super properties so every event is sliceable.
      register({
        active_plan: getActivePlan(),
        year_level: plan?.yearLevel ?? null,
        learning_style: plan?.learningStyle ?? null,
        school_type: plan?.schoolType ?? null,
        course_count: plan?.courses?.length ?? 0,
        has_onboarded: !!plan,
      })
      setDbReady(true)
    })
  }, [session?.user?.id])

  // ── Checkout success handler ───────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !dbReady) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') !== 'success') return
    window.history.replaceState({}, '', window.location.pathname)
    refreshSubscription(session.user.id).then(() => {
      const plan = getActivePlan()
      track('checkout_success', { plan })
      identifyUser(session.user.id, { plan })
      setCheckoutSuccess(true)
    })
  }, [session?.user?.id, dbReady])

  // ── Checkout cancel handler ────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !dbReady) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') !== 'cancelled') return
    window.history.replaceState({}, '', window.location.pathname)
    track('checkout_abandoned', { from: 'stripe_cancel_button' })
    setShowCheckoutCancelBanner(true)
  }, [session?.user?.id, dbReady])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleOnboardingComplete = ({ yearLevel: yl, learningStyle: ls, preferredTime, schoolType: st, emailDigest, durationMs, trialTaken }) => {
    setYearLevel(yl)
    setLearningStyle(ls)
    setSchoolType(st ?? null)
    setSchedule({ hoursPerWeek: 15, preferredTime })
    setCourses([])
    setInitialCompletedIds(new Set())
    setShowOutput(true)
    // Persist email digest preference so the weekly cron can read it
    if (emailDigest) {
      localStorage.setItem('studyedge_email_digest', '1')
    } else {
      localStorage.removeItem('studyedge_email_digest')
    }
    saveEmailDigest(!!emailDigest)
    // duration_ms captures total time from splash to onboarding finish.
    // n_courses is 0 here by definition (user lands in dashboard empty-state)
    // but kept for spec compliance and future flows that may pre-seed
    // courses. trial_taken differentiates trial-start vs. skip since both
    // call handleOnboardingComplete.
    track('onboarding_completed', {
      yearLevel: yl,
      learningStyle: ls,
      preferredTime,
      emailDigest: !!emailDigest,
      duration_ms: typeof durationMs === 'number' ? durationMs : null,
      n_courses: 0,
      n_assignments: 0,
      trial_taken: !!trialTaken,
      school_type: st ?? null,
    })
    // Post-onboarding email — fire once per user
    if (session?.user?.email) {
      const key = `studyedge_onboarding_email_${session.user.id}`
      if (!localStorage.getItem(key)) {
        fetch('/api/onboarding-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.user.email,
            firstName: session.user.user_metadata?.name,
            yearLevel: yl,
            learningStyle: ls,
            preferredTime,
          }),
        }).then(() => localStorage.setItem(key, '1')).catch(() => {})
      }
    }
  }

  const handleSavePlan = (completedIds, updatedAssignments) => {
    const resolvedAssignments = updatedAssignments ?? assignments
    latestPlanRef.current = { completedIds: [...completedIds], assignments: resolvedAssignments }
    savePlan({
      courses,
      schedule,
      learningStyle,
      yearLevel,
      schoolType,
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
    const isFirstCourse = courses.length === 0
    track('course_added', {
      first_course: isFirstCourse,
      total_courses: newCourses.length,
      has_exam_date: !!course.examDate,
      has_target_grade: !!course.targetGrade,
    })
    setCourses(newCourses)
    savePlan({
      courses: newCourses,
      schedule,
      learningStyle,
      yearLevel,
      schoolType,
      completedIds: latestPlanRef.current.completedIds,
      assignments: latestPlanRef.current.assignments,
      savedAt: Date.now(),
    })
    // First-plan email — only when user goes from zero courses to one
    if (isFirstCourse && session?.user?.email) {
      const key = `studyedge_first_plan_email_${session.user.id}`
      if (!localStorage.getItem(key)) {
        fetch('/api/first-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.user.email,
            firstName: session.user.user_metadata?.name,
            courses: newCourses.map(c => c.name).filter(Boolean),
          }),
        }).then(() => localStorage.setItem(key, '1')).catch(() => {})
      }
    }
  }

  const handleEditCourse = (idx, updatedCourse) => {
    const newCourses = courses.map((c, i) => i === idx ? updatedCourse : c)
    setCourses(newCourses)
    savePlan({
      courses: newCourses,
      schedule,
      learningStyle,
      yearLevel,
      schoolType,
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
      schoolType,
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
  }

  // ── Shared plan (public, no auth) ─────────────────────────────────────────
  if (window.location.pathname === '/shared-plan') {
    return <SharedPlanView />
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (session === undefined || (session && !dbReady)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F7F6F3', gap: 24,
      }}>
        <style>{`
          @keyframes se-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }
          @keyframes se-bar { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
          @keyframes se-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
          .se-dot { width:8px;height:8px;border-radius:50%;background:#3B61C4;animation:se-pulse 1.2s ease-in-out infinite; }
          .se-dot:nth-child(2){animation-delay:0.2s;background:#5577d4;}
          .se-dot:nth-child(3){animation-delay:0.4s;background:#E8531A;}
        `}</style>
        <div style={{ animation: 'se-fadein 0.5s ease forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #eef1fb 0%, #dce3f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(59,97,196,0.15)',
            }}>
              <img src="/favicon.png" alt="StudyEdge" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.3px' }}>StudyEdge AI</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Setting up your study system…</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <div className="se-dot" />
            <div className="se-dot" />
            <div className="se-dot" />
          </div>
          <div style={{
            width: 180, height: 3, borderRadius: 99,
            background: '#e8e7e3', overflow: 'hidden', marginTop: 4,
          }}>
            <div style={{
              width: '40%', height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #3B61C4, #E8531A)',
              animation: 'se-bar 1.6s ease-in-out infinite',
            }} />
          </div>
        </div>
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
    // Supabase email confirmation uses token_hash + type params (not OAuth code)
    const hasEmailToken = !!sp.get('token_hash')
    const inOAuthCallback = hasOAuthCode || hasOAuthHash || hasEmailToken

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
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F6F3' }}>
          <div className="text-center space-y-4">
            <Spinner size="md" className="mx-auto" />
            <p className="text-sm" style={{ color: '#6B6B6B' }}>Signing you in…</p>
          </div>
        </div>
      )
    }

    // No auth intent — send them to the real landing page
    window.location.href = '/'
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F6F3' }}>
        <Spinner size="md" />
      </div>
    )
  }

  // ── Email verification gate ──────────────────────────────────────────────
  if (!session.user.email_confirmed_at) {
    return (
      <EmailVerificationGate
        email={session.user.email}
        userId={session.user.id}
        resendState={resendState}
        onResend={async () => {
          track('email_confirmation_resend_clicked', { source: 'app_gate' })
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
        onSignOut={handleSignOut}
      />
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F6F3' }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <img src="/favicon.png" alt="StudyEdge AI" className="w-9 h-9 rounded-xl" style={{ objectFit: 'contain' }} />
            <span className="font-bold text-xl tracking-tight" style={{ color: '#111111' }}>StudyEdge AI</span>
          </div>
          <div className="rounded-2xl p-7" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h1 className="font-bold text-xl mb-1" style={{ color: '#111111' }}>Set a new password</h1>
            <p className="text-sm mb-6" style={{ color: '#6B6B6B' }}>Choose a strong password for your account.</p>
            {pwState === 'success' ? (
              <div className="rounded-xl px-4 py-4 text-center text-sm font-medium" style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }}>
                ✓ Password updated! Taking you to the app…
              </div>
            ) : (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold mb-1.5" style={{ color: '#9B9B9B' }}>New password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8}
                    className="w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 text-sm"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', color: '#111111' }} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold mb-1.5" style={{ color: '#9B9B9B' }}>Confirm password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required minLength={8}
                    className="w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 text-sm"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', color: '#111111' }} />
                </div>
                {pwError && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>{pwError}</div>
                )}
                <button type="submit" disabled={pwState === 'loading'}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#3B61C4', boxShadow: '0 4px 16px rgba(59,97,196,0.25)' }}>
                  {pwState === 'loading' ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Stripe checkout redirect (paid plans AND 3-day free trial) ───────────
  // REVENUE-CRITICAL. Read before changing the condition below.
  // Trial=1 MUST redirect to Stripe Checkout. The "trial" in this product is
  // card-required — `payment_method_collection: 'always'` in api/stripe.js
  // collects the card, and Stripe auto-bills after 3 days. Skipping this block
  // for trial signups (e.g. adding `!checkoutIntent.trial`) breaks the trial:
  // the user gets dropped into the app as free, no customer is created, no
  // subscription exists. That bug shipped 2026-05-25 (commit 2af08aa) and
  // produced 0 new customers for 9 days. Verify any change with
  // `node scripts/verify-trial-flow.mjs` BEFORE merging.
  if (checkoutIntent && getActivePlan() === 'free') {
    window.history.replaceState({}, '', window.location.pathname)
    createCheckoutSession(checkoutIntent.plan, checkoutIntent.billing, session.user.email, session.user.id, { trial: checkoutIntent.trial }).then(result => {
      if (!result || result.alreadySubscribed) return
      window.location.href = result
    })
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F6F3' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size="md" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ color: '#6B6B6B', fontSize: 14 }}>Redirecting to checkout…</p>
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
          schoolType={schoolType}
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
        <Onboarding onComplete={handleOnboardingComplete} userEmail={session.user.email} userId={session.user.id} />
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

      {/* Checkout cancel banner */}
      {showCheckoutCancelBanner && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'rgba(245,158,11,0.95)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 13.5, color: '#fff', fontWeight: 500 }}>
            Your 3-day trial is still available. No commitment until day 4.
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => {
                setShowCheckoutCancelBanner(false)
                openPaywall('pro')
              }}
              style={{ padding: '7px 14px', borderRadius: 7, background: '#fff', color: '#B45309', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none' }}
            >
              Try again
            </button>
            <button
              onClick={() => setShowCheckoutCancelBanner(false)}
              style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Checkout success banner */}
      {checkoutSuccess && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#FFFFFF', border: '1px solid #A7F3D0', borderRadius: 12,
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.10)', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#047857', fontSize: 14, fontWeight: 600 }}>You're on the plan. Welcome!</span>
          <button
            onClick={() => setCheckoutSuccess(false)}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: '#9B9B9B', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
      )}
    </>
  )
}

// Auto-polls every 5s for email confirmation. When confirmed, refreshSession
// triggers onAuthStateChange which re-renders the app past this gate.
function EmailVerificationGate({ email, userId, resendState, onResend, onSignOut }) {
  useEffect(() => {
    let cancelled = false
    let fired = false
    track('email_confirmation_screen_shown', { source: 'app_gate' })
    const interval = setInterval(async () => {
      if (cancelled) return
      try {
        await supabase.auth.refreshSession()
        const { data } = await supabase.auth.getUser()
        if (data?.user?.email_confirmed_at && !fired) {
          fired = true
          track('email_confirmed', { source: 'app_gate', user_id: userId ?? data.user.id })
        }
      } catch {}
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [userId])

  const PREVIEWS = [
    'AI Study Coach',
    'Session Blueprints',
    'Focus sessions + streak tracking',
  ]

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F6F3' }}>
      <style>{`@keyframes pulse-ring-app { 0%,100% { box-shadow: 0 0 0 0 rgba(59,97,196,0.4) } 50% { box-shadow: 0 0 0 8px rgba(59,97,196,0) } }`}</style>
      <div className="max-w-md w-full text-center space-y-5">
        <div
          className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center"
          style={{ animation: 'pulse-ring-app 1.8s ease-in-out infinite' }}
        >
          <svg className="w-8 h-8" style={{ color: '#3B61C4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#111111' }}>One click to unlock your study plan</h1>
          <p className="text-sm leading-relaxed mt-2" style={{ color: '#6B6B6B' }}>
            We sent a confirmation link to{' '}
            <span className="font-medium" style={{ color: '#111111' }}>{email}</span>.
          </p>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.15)',
          borderRadius: 999, padding: '5px 12px',
          fontSize: 12, color: '#3B61C4', fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B61C4', animation: 'pulse-ring-app 1.4s ease-in-out infinite' }} />
          Checking automatically. No need to refresh.
        </div>

        <div style={{
          backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)',
          borderRadius: 12, padding: '14px 18px', textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            What unlocks once you verify
          </p>
          {PREVIEWS.map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <svg width="12" height="12" fill="none" stroke="#3B61C4" strokeWidth="3" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>

        <button
          disabled={resendState === 'sending'}
          onClick={onResend}
          className="text-sm font-medium transition-colors disabled:opacity-50"
          style={{ color: resendState === 'sent' ? '#16A34A' : resendState === 'error' ? '#DC2626' : '#3B61C4' }}
        >
          {resendState === 'sending' ? 'Sending…' : resendState === 'sent' ? 'Email resent. Check your inbox.' : resendState === 'error' ? 'Failed to resend. Try again.' : 'Resend confirmation email'}
        </button>
        <div className="pt-1">
          <button
            onClick={onSignOut}
            className="text-xs transition-colors"
            style={{ color: '#9B9B9B' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#6B6B6B'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#9B9B9B'}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
