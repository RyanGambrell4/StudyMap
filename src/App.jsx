import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { initUserData, clearUserData, savePlan, refreshSubscription, saveEmailDigest } from './lib/db'
import { getActivePlan, canAddCourse, createCheckoutSession, activateTrial, hasUsedTrial, isTrialActive, getCachedSubscription, TRIAL_DURATION_DAYS } from './lib/subscription'
import { useTheme } from './utils/useTheme'
import { initAnalytics, identifyUser, resetUser, track, register, registerOnce } from './lib/analytics'
import { captureReferralParam, getStoredReferrer, clearStoredReferrer } from './lib/referral'
import { captureUtmForOnboarding } from './lib/utmPersonalize'
import SharedPlanView from './components/SharedPlanView'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
import Spinner from './components/ui/spinner'
import Onboarding from './components/Onboarding'
import OutputView from './components/OutputView'
import PaywallModal from './components/PaywallModal'
import FeedbackModal from './components/FeedbackModal'
import './index.css'

export default function App() {
  useTheme()
  useEffect(() => {
    initAnalytics()
    captureReferralParam()
    // Snapshot utm params before Supabase's PKCE flow clears the query
    // string. Onboarding reads this back to pre-select schoolType/yearLevel
    // for users coming from targeted campaigns (e.g. r/mcat, r/premed).
    captureUtmForOnboarding()
    // 'surface' must overwrite - if the user navigated from the marketing site,
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
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(
    () => sessionStorage.getItem('studyedge_email_banner_dismissed') === '1'
  )

  // ── Floating trial nudge (appears 2 min after entering app) ───────────────
  const [trialNudgeDismissed, setTrialNudgeDismissed] = useState(
    () => sessionStorage.getItem('studyedge_trial_nudge_dismissed') === '1'
  )
  const [trialNudgeVisible, setTrialNudgeVisible] = useState(false)

  useEffect(() => {
    if (!showOutput) return
    if (getActivePlan() !== 'free' || hasUsedTrial()) return
    const t = setTimeout(() => setTrialNudgeVisible(true), 120000)
    return () => clearTimeout(t)
  }, [showOutput])

  // ── Paywall state ──────────────────────────────────────────────────────────
  const [paywallOpen, setPaywallOpen]     = useState(false)
  const [paywallTrigger, setPaywallTrigger] = useState('courses')

  // ── Feedback modal state ───────────────────────────────────────────────────
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // ── Checkout success banner ────────────────────────────────────────────────
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [checkoutProcessing, setCheckoutProcessing] = useState(false)

  // ── Checkout cancel banner ─────────────────────────────────────────────────
  const [showCheckoutCancelBanner, setShowCheckoutCancelBanner] = useState(false)

  // Capture checkout intent on mount before Supabase PKCE exchange clears the URL.
  // `promo` is used by the trial-cancel comeback offer email — that link deep-links
  // straight into checkout with a one-time discount code auto-applied.
  const [checkoutIntent, setCheckoutIntent] = useState(() => {
    const sp = new URLSearchParams(window.location.search)
    const plan = sp.get('plan')
    const billing = sp.get('billing')
    const trial = sp.get('trial') === '1'
    const rawPromo = sp.get('promo')
    // Only forward well-formed codes (uppercase alphanumeric, 6–24 chars). Blocks
    // arbitrary URL crud from ever reaching Stripe as a promotion code.
    const promo = rawPromo && /^[A-Z0-9]{6,24}$/.test(rawPromo) ? rawPromo : null
    if (plan === 'pro' || plan === 'unlimited') {
      return { plan, billing: ['weekly', 'monthly', 'yearly', 'semester'].includes(billing) ? billing : 'weekly', trial, promo }
    }
    return null
  })

  const openPaywall = useCallback((trigger = 'courses') => {
    setPaywallTrigger(trigger)
    setPaywallOpen(true)
    const unlimitedTriggers = new Set(['tutorMemory', 'practiceExamAnalytics', 'unlimited'])
    track('paywall_shown', {
      trigger,
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

  // Same pattern for the feedback modal — AppShell settings menu, empty
  // states, and any surface can trigger it via a global event.
  useEffect(() => {
    const handler = () => setFeedbackOpen(true)
    window.addEventListener('studyedge:open-feedback', handler)
    return () => window.removeEventListener('studyedge:open-feedback', handler)
  }, [])

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
        const lastSignInMs = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0
        // Supabase sets created_at and last_sign_in_at simultaneously on signup (<30s apart).
        // On every subsequent sign-in last_sign_in_at is bumped to now, widening the gap.
        const isFreshSignup = createdAtMs > 0 && lastSignInMs > 0 && (lastSignInMs - createdAtMs) < 30 * 1000
        identifyUser(session.user.id, {
          email: session.user.email,
          signup_date: createdAtIso,
          auth_provider: session.user.app_metadata?.provider ?? 'email',
          name: session.user.user_metadata?.name ?? null,
        })
        register({ auth_provider: session.user.app_metadata?.provider ?? 'email' })
        track('user_signed_in', { fresh_signup: !!isFreshSignup, auth_provider: session.user.app_metadata?.provider ?? 'email' })
        if (isFreshSignup) track('signup_completed', { auth_provider: session.user.app_metadata?.provider ?? 'email' })
        // Welcome email - only on actual signup, not every login.
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
        // Save referral - fire-and-forget, won't overwrite if already set
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

  // ── Background-poll for email confirmation when user is unconfirmed ────────
  useEffect(() => {
    if (!session?.user?.id || session.user.email_confirmed_at) return
    let cancelled = false
    let fired = false
    const interval = setInterval(async () => {
      if (cancelled || fired) return
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.email_confirmed_at) {
          fired = true
          track('email_confirmed', { source: 'app_banner', user_id: session.user.id })
          await supabase.auth.refreshSession()
        }
      } catch {}
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session?.user?.id, session?.user?.email_confirmed_at])

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
  // Stripe webhooks are async: the DB may not reflect the new plan for a few
  // seconds after redirect. Poll until plan != 'free' (up to 10s) so the UI
  // shows the correct plan instead of 'free' while the webhook is in-flight.
  useEffect(() => {
    if (!session?.user || !dbReady) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') !== 'success') return
    window.history.replaceState({}, '', window.location.pathname)

    let attempts = 0
    const MAX_ATTEMPTS = 20
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try { await refreshSubscription(session.user.id) } catch (e) { console.error('[checkout success] refresh failed:', e) }
      const plan = getActivePlan()
      if (plan !== 'free') {
        track('checkout_success', { plan })
        identifyUser(session.user.id, { plan })
        setCheckoutProcessing(false)
        setCheckoutSuccess(true)
        return
      }
      if (attempts >= MAX_ATTEMPTS) {
        // Webhook hasn't arrived yet — show a processing state instead of false success
        setCheckoutProcessing(true)
        return
      }
      attempts++
      setTimeout(poll, 1500)
    }
    poll()
    return () => { cancelled = true }
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
    // Post-onboarding email - fire once per user
    if (session?.user?.email) {
      const key = `studyedge_onboarding_email_${session.user.id}`
      if (!localStorage.getItem(key)) {
        fetch('/api/onboarding-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.user.email,
            userId: session.user.id,
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
      track('course_limit_reached', { plan: getActivePlan(), courseCount: courses.length })
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
    // First-plan email - only when user goes from zero courses to one
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
            userId: session.user.id,
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
    // The real landing page lives at / - the React app only hosts the
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
    // session and redirects us right back to '/app' - creating an infinite
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

    // Mid-OAuth callback OR Supabase still hydrating a stored session -
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

    // No auth intent - send them to the real landing page
    window.location.href = '/'
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F6F3' }}>
        <Spinner size="md" />
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

  // ── Checkout intent handler (all paths go through Stripe) ───────────────
  if (checkoutIntent && getActivePlan() === 'free') {
    window.history.replaceState({}, '', window.location.pathname)
    if (checkoutIntent.trial) {
      createCheckoutSession('pro', 'weekly', session.user.email, session.user.id, { trial: true }).then(result => {
        if (result?.alreadySubscribed) { setCheckoutIntent(null); return }
        if (!result) { setCheckoutIntent(null); return }
        window.location.href = result
      })
    } else {
      createCheckoutSession(checkoutIntent.plan, checkoutIntent.billing, session.user.email, session.user.id, { promo: checkoutIntent.promo }).then(result => {
        if (result?.alreadySubscribed) { setCheckoutIntent(null); return }
        if (!result) { setCheckoutIntent(null); return }
        window.location.href = result
      })
    }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F6F3' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size="md" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ color: '#6B6B6B', fontSize: 14 }}>{checkoutIntent.trial ? 'Activating your free trial…' : 'Redirecting to checkout…'}</p>
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
          userCreatedAt={session.user.created_at ?? null}
          onShowPaywall={openPaywall}
        />
      ) : (
        <Onboarding onComplete={handleOnboardingComplete} userEmail={session.user.email} userId={session.user.id} />
      )}

      {/* Global paywall modal - rendered at App level so any component can trigger it */}
      {paywallOpen && (
        <PaywallModal
          trigger={paywallTrigger}
          onClose={() => setPaywallOpen(false)}
          userEmail={session?.user?.email}
          userId={session?.user?.id}
          currentPlan={getActivePlan()}
          sessionsCompleted={initialCompletedIds?.size ?? 0}
          coursesCount={courses.length}
          primaryCourseName={courses[0]?.name ?? null}
        />
      )}

      {/* Global feedback modal — opened via ⚙︎ menu or `studyedge:open-feedback` event */}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* Email confirmation banner — shown in the main app after onboarding */}
      {showOutput && session?.user && !session.user.email_confirmed_at && !emailBannerDismissed && (() => {
        // Track once per mount
        if (typeof window !== 'undefined' && !window.__emailBannerTracked) {
          window.__emailBannerTracked = true
          track('email_banner_shown', { user_id: session.user.id })
        }
        return true
      })() && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
          background: '#3B61C4', padding: '9px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
            📧 Confirm your email to secure your account. Check <strong>{session.user.email}</strong>
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <button
              onClick={async () => {
                if (resendState === 'sending' || resendState === 'sent') return
                track('email_confirmation_resend_clicked', { source: 'app_banner' })
                setResendState('sending')
                try {
                  await supabase.auth.resend({ type: 'signup', email: session.user.email })
                  setResendState('sent')
                  setTimeout(() => setResendState(''), 5000)
                } catch {
                  setResendState('error')
                  setTimeout(() => setResendState(''), 5000)
                }
              }}
              style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {resendState === 'sending' ? 'Sending…' : resendState === 'sent' ? '✓ Sent' : resendState === 'error' ? 'Failed, retry' : 'Resend email'}
            </button>
            <button
              onClick={() => { sessionStorage.setItem('studyedge_email_banner_dismissed', '1'); setEmailBannerDismissed(true); track('email_banner_dismissed', { user_id: session.user.id }) }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Floating trial nudge — appears 2 min in for free users who haven't trialed */}
      {showOutput && trialNudgeVisible && !trialNudgeDismissed && getActivePlan() === 'free' && !hasUsedTrial() && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 998,
          background: '#3B61C4',
          borderRadius: 14, padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(59,97,196,.45), 0 2px 8px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 300,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#fff' }}>Unlock unlimited sessions</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,.65)' }}>7-day trial · $4.99/wk after</p>
          </div>
          <button
            onClick={() => { track('trial_nudge_clicked', { source: 'floating_pill' }); openPaywall('trial_nudge') }}
            style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit' }}
          >
            Start free trial →
          </button>
          <button
            onClick={() => { sessionStorage.setItem('studyedge_trial_nudge_dismissed', '1'); setTrialNudgeDismissed(true); track('trial_nudge_dismissed') }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.45)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
            aria-label="Dismiss"
          >×</button>
        </div>
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
            {hasUsedTrial()
              ? 'Pick up where you left off. No hidden fees.'
              : '7-day free trial. Card required. Cancel before day 8 and you won\'t be charged.'}
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
      {checkoutProcessing && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: 12,
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.10)', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}>Payment received. Activating your plan…</span>
          <button
            onClick={() => setCheckoutProcessing(false)}
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
  const [secondsWaited, setSecondsWaited] = useState(0)

  useEffect(() => {
    let cancelled = false
    let fired = false
    track('email_confirmation_screen_shown', { source: 'app_gate' })

    const pollInterval = setInterval(async () => {
      if (cancelled) return
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.email_confirmed_at && !fired) {
          fired = true
          track('email_confirmed', { source: 'app_gate', user_id: userId ?? data.user.id })
          await supabase.auth.refreshSession()
        }
      } catch {}
    }, 5000)

    // Tick a visible "waiting" counter so users know something is happening
    const tickInterval = setInterval(() => {
      if (!cancelled) setSecondsWaited(s => s + 1)
    }, 1000)

    return () => { cancelled = true; clearInterval(pollInterval); clearInterval(tickInterval) }
  }, [userId])

  const domain = email ? email.split('@')[1] : null
  const waitLabel = secondsWaited < 60
    ? `Waiting… ${secondsWaited}s`
    : `Waiting… ${Math.floor(secondsWaited / 60)}m ${secondsWaited % 60}s`

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080C18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes evg-spin    { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes evg-orb     { 0%,100% { opacity:.3; transform:scale(1) } 50% { opacity:.6; transform:scale(1.08) } }
        @keyframes evg-fade-up { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Background glow */}
      <div style={{ position:'absolute', top:'-100px', left:'50%', transform:'translateX(-50%)', width:500, height:400, background:'radial-gradient(ellipse, rgba(107,143,255,.1) 0%, transparent 70%)', animation:'evg-orb 5s ease-in-out infinite', pointerEvents:'none' }} />

      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', animation: 'evg-fade-up 400ms ease both', position: 'relative', zIndex: 1 }}>

        {/* Brand pill */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:9, padding:'7px 16px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.09)', borderRadius:999, marginBottom:28 }}>
          <img src="/favicon.png" alt="" style={{ width:20, height:20, borderRadius:5, objectFit:'contain' }} />
          <span style={{ color:'rgba(255,255,255,.65)', fontWeight:600, fontSize:'0.82rem', letterSpacing:'-0.2px' }}>StudyEdge AI</span>
        </div>

        {/* Email icon */}
        <div style={{
          width:64, height:64, margin:'0 auto 22px',
          borderRadius:18,
          background:'linear-gradient(135deg, rgba(107,143,255,.15), rgba(59,97,196,0.12))',
          border:'1px solid rgba(107,143,255,.25)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 32px rgba(107,143,255,.2)',
        }}>
          <svg width="28" height="28" fill="none" stroke="#8AABFF" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize:'1.55rem', fontWeight:800, letterSpacing:'-0.035em', marginBottom:8, background:'linear-gradient(160deg, #fff 30%, rgba(255,255,255,.6))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
          Check your inbox
        </h1>
        <p style={{ fontSize:'0.88rem', color:'rgba(255,255,255,.4)', lineHeight:1.65, marginBottom:5 }}>
          We sent a confirmation link to
        </p>
        <p style={{ fontSize:'0.93rem', fontWeight:700, color:'rgba(255,255,255,.75)', marginBottom:24, wordBreak:'break-all' }}>
          {email}
        </p>

        {/* Auto-checking pill */}
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          background:'rgba(107,143,255,.1)', border:'1px solid rgba(107,143,255,.25)',
          borderRadius:999, padding:'6px 14px',
          fontSize:12, color:'#8AABFF', fontWeight:600,
          marginBottom:24,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8AABFF" strokeWidth="2.5"
            style={{ animation:'evg-spin 1.6s linear infinite', flexShrink:0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {waitLabel} · Checking automatically
        </div>

        {/* Tips card */}
        <div style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, padding:'18px 20px', marginBottom:18, textAlign:'left' }}>
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
            Can't find it?
          </p>
          {[
            { icon: '📁', text: 'Check your spam or junk folder' },
            { icon: '⏱',  text: 'It can take up to 2 minutes to arrive' },
            { icon: '📧', text: 'Look for an email from StudyEdge AI' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
              <span style={{ fontSize:13, color:'rgba(255,255,255,.55)' }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Resend */}
        <button
          disabled={resendState === 'sending' || resendState === 'sent'}
          onClick={onResend}
          style={{
            width:'100%', padding:'13px',
            background: resendState === 'sent' ? 'rgba(52,211,153,.1)' : 'rgba(255,255,255,.06)',
            border: resendState === 'sent' ? '1px solid rgba(52,211,153,.3)' : '1px solid rgba(255,255,255,.1)',
            borderRadius:12,
            color: resendState === 'sent' ? '#34D399' : resendState === 'error' ? '#F87171' : 'rgba(255,255,255,.6)',
            fontFamily:'inherit', fontSize:'0.88rem', fontWeight:600,
            cursor:(resendState === 'sending' || resendState === 'sent') ? 'default' : 'pointer',
            transition:'all .15s', marginBottom:12,
            opacity: resendState === 'sending' ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!resendState) { e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.color='rgba(255,255,255,.9)' } }}
          onMouseLeave={e => { if (!resendState) { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='rgba(255,255,255,.6)' } }}
        >
          {resendState === 'sending' ? 'Sending…'
            : resendState === 'sent'  ? '✓ Resent. Check inbox and spam folder.'
            : resendState === 'error' ? 'Failed to resend. Try again.'
            : 'Resend confirmation email'}
        </button>

        <button
          onClick={async () => {
            track('google_signin_from_gate_clicked')
            await supabase.auth.signOut()
            await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: `${window.location.origin}/app` },
            })
          }}
          style={{
            width:'100%', padding:'12px',
            background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:12, color:'rgba(255,255,255,.7)',
            fontFamily:'inherit', fontSize:'0.88rem', fontWeight:600,
            cursor:'pointer', transition:'all .15s', marginBottom:12,
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.color='rgba(255,255,255,.9)' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='rgba(255,255,255,.7)' }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google instead. No verification needed.
        </button>

        <button
          onClick={onSignOut}
          style={{ background:'none', border:'none', color:'rgba(255,255,255,.2)', fontSize:'0.76rem', cursor:'pointer', padding:4, transition:'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,.5)'}
          onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,.2)'}
        >
          Wrong email? Sign out and try again
        </button>

      </div>
    </div>
  )
}
