import { useEffect, useRef, useState } from 'react'
import { createCheckoutSession, activateTrial, hasUsedTrial, isTrialActive, getActivePlan, getFeatureUsage } from '../lib/subscription'
import { track } from '../lib/analytics'
import { getAccessToken } from '../lib/supabase'
import PaywallExitGift from './PaywallExitGift'
import PrePaywall from './PrePaywall'

// Session flag so the 3-screen value stack only fires on the FIRST paywall
// open per session for eligible free users.
const PREPAYWALL_SESSION_KEY = 'se_prepaywall_seen_v1'

// ── Config ────────────────────────────────────────────────────────────────────

const BILLING_PERIODS = [
  { id: 'weekly',  label: 'Weekly',  badge: null,          best: false },
  { id: 'monthly', label: 'Monthly', badge: 'Save 17%',    best: false },
  { id: 'yearly',  label: 'Annual',  badge: 'Best Value ✦', best: true  },
]

// Plan tier → billing period → display price.
// Source of truth for Pro: weekly $2.99 / monthly $9.99 / annual $69.99.
// Unlimited: weekly $4.99 / monthly $14.99 / annual $119.99.
const PLANS = {
  pro: {
    name: 'Pro',
    color: '#7C5CFA',
    gradient: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
    prices: {
      weekly:  '$2.99/wk',
      monthly: '$9.99/mo',
      yearly:  '$69.99/yr',
    },
    subPrices: {
      weekly:  'Less than a coffee · billed weekly',
      monthly: '$2.31/week · billed monthly',
      yearly:  'Just $1.35/week · billed once a year',
    },
    monthlySavingsBadge: 'Save 17%',
    annualSavingsBadge: 'Save 55%',
    features: [
      '5 courses',
      '100 AI actions/month',
      'AI Study Coach',
      'Unlimited Session Blueprints',
      'Unlimited Focus sessions',
      'Unlimited brain training',
      'Flashcards & quizzes',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    color: '#34D399',
    gradient: null,
    prices: {
      weekly:  '$4.99/wk',
      monthly: '$14.99/mo',
      yearly:  '$119.99/yr',
    },
    subPrices: {
      weekly:  'Billed weekly',
      monthly: '$3.46/week · billed monthly',
      yearly:  'Just $2.31/week · billed once a year',
    },
    monthlySavingsBadge: 'Save 25%',
    annualSavingsBadge: 'Save 53%',
    features: [
      'Everything in Pro',
      'Unlimited courses',
      'Unlimited AI actions',
      'AI Tutor with session memory',
      'Advanced Practice Exam analytics',
      'Predicted exam score',
      'Priority support',
    ],
  },
}

// Triggers that require Unlimited specifically (vs Pro).
const UNLIMITED_ONLY_TRIGGERS = new Set(['tutorMemory', 'practiceExamAnalytics', 'unlimited'])

const LIMIT_MESSAGES = {
  courses: {
    tag: 'Manage your full semester',
    title: 'Add up to 5 courses with Pro.',
    body: 'Stop juggling apps. Your full semester (every course, every exam) planned in one place.',
  },
  ai: {
    tag: 'Unlock AI tutoring',
    title: 'Get AI help anytime, for every course.',
    body: 'Pro gives you 100 AI actions a month. Your always-on tutor for every concept you\'re stuck on.',
  },
  'ai-struggle': {
    tag: 'Close your knowledge gaps',
    title: 'Your AI coach can fix this.',
    body: 'You\'re struggling with a flagged topic. Pro unlocks unlimited AI coaching sessions to drill exactly what you\'re missing before your exam.',
  },
  'ai-exhausted': {
    tag: "You've used your free AI actions",
    title: 'Keep your tutor on tap.',
    body: "Pro gives you 100 AI actions a month. Your tutor for every concept this semester. Start the 3-day free trial and pick up exactly where you left off.",
  },
  tutorMemory: {
    tag: 'Unlimited only · Tutor memory',
    title: 'AI Tutor with full session memory.',
    body: 'Your tutor remembers everything from your conversation. No more re-explaining context every message. Available on Unlimited.',
  },
  practiceExamAnalytics: {
    tag: 'Unlimited only · Advanced analytics',
    title: 'See your trend. Predict your real score.',
    body: 'Unlimited unlocks score trend graphs across all your practice exams plus an AI-predicted real exam score.',
  },
  coach: {
    tag: 'Replan as life happens',
    title: 'Rebuild your study plan anytime.',
    body: 'Exams shift. Life happens. Pro lets you regenerate your coach plan whenever your schedule changes.',
  },
  blueprint: {
    tag: 'A plan for every session',
    title: 'Unlock unlimited Session Blueprints.',
    body: 'A full breakdown before every study block. What to learn, in what order, with practice prompts ready to go.',
  },
  focus: {
    tag: 'Study without a timer cap',
    title: 'Unlock unlimited Focus sessions.',
    body: 'Lock in for as long as you need. Pro removes the 30-min cap so you can finish what you started.',
  },
  'focus-limit': {
    tag: "You've hit your daily focus limit",
    title: 'Unlock unlimited Focus sessions.',
    body: "You just hit your 30-min free cap. Pro removes it entirely. Study as long as you need, every day.",
  },
  brainDump: {
    tag: 'Train recall on every topic',
    title: 'Unlock unlimited Brain Dumps.',
    body: 'Recall practice is the #1 evidence-based study technique. Pro lets you brain dump anything, anytime.',
  },
  quizBurst: {
    tag: 'Test yourself anytime',
    title: 'Unlock unlimited Quiz Bursts.',
    body: 'Quick mastery checks for any topic. Pro lets you generate them on demand, all semester.',
  },
  examRescue: {
    tag: 'Behind on an exam? Rebound fast',
    title: 'Unlock unlimited Exam Rescues.',
    body: 'Pro builds a targeted rescue plan for any exam. Figure out exactly what to study and when.',
  },
  tools: {
    tag: 'Your AI-built study materials',
    title: 'Unlock Flashcards, quizzes, and more.',
    body: 'Pro auto-generates flashcards and practice quizzes from your own course content. No manual setup.',
  },
  grade_recovery: {
    tag: 'Hit the grade you need',
    title: 'Unlock Grade Recovery.',
    body: 'See exactly how many points you need to hit your target, then get a study plan built to get you there.',
  },
  'coach-plan-result': {
    tag: 'Adapt your plan as things change',
    title: 'Rebuild your plan anytime.',
    body: 'Your free plan is locked after generation. Pro lets you rebuild it anytime. New exam dates, topic changes, schedule shifts - all covered.',
  },
  'practice_exam': {
    tag: 'Practice more, score higher',
    title: 'Unlock unlimited practice exams.',
    body: 'Free includes 1 exam total. Pro gives you unlimited practice, score trend tracking, and weak-topic targeting.',
  },
  'practice-exam-results': {
    tag: "You've used your free exam",
    title: 'Unlock unlimited practice exams.',
    body: 'Consistent practice is what moves the needle. Pro gives you unlimited exams with detailed score tracking.',
  },
  'brain-dump-result': {
    tag: 'Keep training your recall',
    title: 'Unlock unlimited Brain Dumps.',
    body: "You've used your free brain dump. Pro removes the limit. Dump and score any topic, anytime you need it.",
  },
  'quiz-burst-result': {
    tag: 'Quiz yourself every session',
    title: 'Unlock unlimited Quiz Bursts.',
    body: "Daily self-testing is one of the fastest ways to lock in material. Pro gives you unlimited quiz bursts.",
  },
  'exam-rescue-result': {
    tag: 'Next time, come back ready',
    title: 'Unlock unlimited Exam Rescues.',
    body: "Pro builds a rescue plan for any exam, any time. Never go into a test unprepared again.",
  },
  'focus-complete': {
    tag: 'Keep your momentum going',
    title: 'Unlock unlimited focus time.',
    body: "Great session. Free caps you at 30 min/day. Pro removes that entirely so you can study as long as you need.",
  },
  adapt: {
    tag: 'Your plan just got smarter',
    title: 'Let your schedule adapt automatically.',
    body: "Based on your recall score, your plan should shift. Pro applies these adjustments automatically so you always study the right thing next.",
  },
  grades: {
    tag: 'Know your grade before finals',
    title: 'Unlock full Grade Hub.',
    body: "Track every assignment, run what-if scenarios, and know exactly what you need on your final to hit your target grade. Pro and Unlimited plans only.",
  },
  'study-hacks': {
    tag: 'Unlock your full study toolkit',
    title: 'Get every AI study tool.',
    body: 'Pro unlocks Cheat Sheets, Exam Rescues, unlimited Brain Dumps, and more. One toolkit for your entire semester.',
  },
  flashcardDecks: {
    tag: 'More decks, more mastery',
    title: 'Unlock unlimited flashcard decks.',
    body: 'Free includes 1 deck. Pro gives you unlimited decks with unlimited cards. One deck per course, or go deeper on any topic.',
  },
  'cheat-sheet': {
    tag: 'See every high-priority topic',
    title: 'Unlock all 10 exam topics.',
    body: "Free shows the #1 ranked topic. Pro unlocks all 10, ranked by AI-estimated exam likelihood and your current readiness, so you know exactly where to spend the time you have left.",
  },
  'prep-blast': {
    tag: 'Smarter session briefs',
    title: 'Unlock exam-focused and goal-based modes.',
    body: "Pro uses your exam dates and coach plan to pick the highest-leverage focus question for your next session. Free mode only covers general weak areas.",
  },
  'quiz-result': {
    tag: 'Keep testing yourself',
    title: 'Unlimited quizzes, any topic.',
    body: "Self-testing is the most effective study technique. Pro generates unlimited quizzes from any topic or your uploaded notes, on demand, all semester.",
  },
  'streak-milestone': {
    tag: 'Your streak is worth protecting',
    title: 'Keep your streak going with Pro.',
    body: "You've built a real habit. Pro gives you unlimited AI tutoring, blueprints, and focus sessions. Nothing slows you down.",
  },
  'drill-result': {
    tag: 'Keep drilling weak spots',
    title: 'Unlimited Topic Drills, all semester.',
    body: "Drilling is how knowledge sticks. Pro gives you unlimited topic drills so you can target every weak area before exam day.",
  },
  'nav-upgrade': {
    tag: 'Ready to go back to Unlimited?',
    title: 'Everything you had during your trial.',
    body: "$4.99/wk. Unlimited courses, unlimited AI, AI Tutor with session memory, advanced analytics, and every study tool. Cancel anytime.",
  },
  'nav-trial': {
    tag: 'Try Unlimited free for 3 days',
    title: 'Full access. No restrictions.',
    body: "Unlimited courses, unlimited AI actions, AI Tutor with session memory, advanced exam analytics, and every study tool. $4.99/wk after. Cancel anytime.",
  },
}

const TESTIMONIALS = [
  { quote: 'finished top of my cohort last semester. I genuinely could not have done it without this', name: 'Danny K.', detail: 'Pre-med, 3.8 GPA' },
  { quote: 'finally consistent with my studying for the first time ever', name: 'Andy G.', detail: 'University, 2nd year' },
  { quote: 'one app. all semester. I don\'t need anything else.', name: 'Charlotte B.', detail: 'Law school prep' },
  { quote: 'went from a C to a B+ in Orgo after using Exam Rescue the week before my midterm', name: 'Priya S.', detail: 'Chemistry major' },
  { quote: 'the AI study coach actually understands my schedule. worth every penny', name: 'Marcus T.', detail: 'Engineering, 3rd year' },
]

// Maps each trigger to the most contextually relevant testimonial index.
// Danny (0) = academic outcomes. Andy (1) = consistency/habit. Charlotte (2) = all-in-one.
// Priya (3) = exam rescue/rescue scenarios. Marcus (4) = coach, focus, blueprints.
const TRIGGER_TESTIMONIAL_IDX = {
  'practice-exam-results': 0, 'practice_exam': 0, 'practiceExamAnalytics': 0,
  'grades': 0, 'grade_recovery': 0, 'ai-exhausted': 0, 'ai': 0,
  'brain-dump-result': 1, 'brainDump': 1, 'quiz-burst-result': 1, 'quizBurst': 1,
  'streak-milestone': 1, 'drill-result': 1,
  'courses': 2, 'nav-trial': 2, 'nav-upgrade': 2, 'tools': 2, 'flashcardDecks': 2,
  'exam-rescue-result': 3, 'examRescue': 3, 'cheat-sheet': 3, 'prep-blast': 3,
  'focus-limit': 4, 'focus-complete': 4, 'focus': 4,
  'coach': 4, 'coach-plan-result': 4, 'blueprint': 4, 'adapt': 4,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaywallModal({ trigger, onClose, userEmail, userId, currentPlan = 'free', onTrialActivated, sessionsCompleted = 0, coursesCount = 0, primaryCourseName = null }) {
  // Default to yearly — largest weekly-equivalent discount and highest LTV.
  // Users can still switch via the toggle; we're just picking the anchor.
  const [billingPeriod, setBillingPeriod] = useState('yearly')
  const [loading, setLoading] = useState(null)
  const [testimonialIdx, setTestimonialIdx] = useState(() => TRIGGER_TESTIMONIAL_IDX[trigger] ?? 0)
  const [trialLoading, setTrialLoading] = useState(false)
  const [trialError, setTrialError] = useState(null)
  const [planError, setPlanError] = useState(null)
  const openedAtRef = useRef(Date.now())

  // Screen state: 'stats' (trial-expired), 'commitment' (free+seen PrePaywall),
  // 'plans' (main pricing), 'trust' (pre-Stripe trust interstitial)
  const [screen, setScreen] = useState(() => {
    const used = hasUsedTrial()
    const active = isTrialActive()
    if (used && !active) return 'stats'
    if (!used && !active && currentPlan === 'free' && !UNLIMITED_ONLY_TRIGGERS.has(trigger)) {
      try { if (window.sessionStorage.getItem(PREPAYWALL_SESSION_KEY)) return 'commitment' } catch {}
    }
    return 'plans'
  })
  const [pendingPlan, setPendingPlan] = useState(null) // { planId, billingPeriod } for trust screen

  const trialUsed = hasUsedTrial()
  const trialActive = isTrialActive()
  const isUnlimitedTrigger = UNLIMITED_ONLY_TRIGGERS.has(trigger)

  // 3-screen value stack: shown once per session for eligible free users.
  // Eligibility: free plan, trial not yet used, not on a "hard" Unlimited-only
  // trigger (those users landed here because they need a specific paid feature —
  // don't slow them down with a benefits pitch).
  const prePaywallEligible = (
    currentPlan === 'free'
    && !trialUsed
    && !trialActive
    && !isUnlimitedTrigger
  )
  const [showPrePaywall, setShowPrePaywall] = useState(() => {
    if (!prePaywallEligible) return false
    try {
      return typeof window !== 'undefined' && !window.sessionStorage.getItem(PREPAYWALL_SESSION_KEY)
    } catch { return false }
  })

  // Trial card only shows for free users, never for Unlimited-only triggers.
  const showTrialCard = currentPlan === 'free' && !trialUsed && !trialActive && !isUnlimitedTrigger
  // Win-back card shows for users whose trial expired and haven't subscribed.
  const showWinBackCard = currentPlan === 'free' && trialUsed && !trialActive && !isUnlimitedTrigger

  const msg = LIMIT_MESSAGES[trigger] ?? LIMIT_MESSAGES.ai
  const visiblePlanIds = currentPlan === 'pro' ? ['unlimited'] : Object.keys(PLANS)

  // Track modal open — this is the funnel entry event for paywall conversion analysis
  useEffect(() => {
    track('paywall_opened', {
      trigger_feature: trigger,
      current_plan: currentPlan,
      trial_used: trialUsed,
      is_unlimited_trigger: isUnlimitedTrigger,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rotate testimonials every 4 seconds
  useEffect(() => {
    const t = setInterval(() => setTestimonialIdx(i => (i + 1) % TESTIMONIALS.length), 4000)
    return () => clearInterval(t)
  }, [])

  // Paywall-exit gift: on the FIRST dismiss for a free user, intercept and
  // show the "5 free AI actions + rate us" screen instead of closing. The
  // server-side /api/claim-paywall-exit-gift enforces one-shot per user
  // globally — this flag just prevents re-showing the intercept once the
  // user has already dismissed it in this open of the paywall.
  const [exitGiftOpen, setExitGiftOpen] = useState(false)
  const [exitGiftShown, setExitGiftShown] = useState(false)

  const handleDismiss = (reason) => {
    track('paywall_dismissed', {
      trigger_feature: trigger,
      reason,
      dwell_ms: Date.now() - openedAtRef.current,
      current_plan: currentPlan,
    })
    // Fire behavioral email while intent is hot — free users only, fire-and-forget
    if (currentPlan === 'free' && userId) {
      getAccessToken().then(token => {
        fetch('/api/paywall-hit-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ trigger }),
        }).catch(() => {})
      }).catch(() => {})
    }

    // Show the exit gift once — only for free users who have not yet seen
    // it this open. Escape key and outside-click both go through here.
    const shouldOfferGift = currentPlan === 'free' && !!userId && !exitGiftShown
    if (shouldOfferGift) {
      setExitGiftShown(true)
      setExitGiftOpen(true)
      return  // hold the paywall behind the gift; onClose fires once the gift closes
    }
    onClose()
  }

  // Called by the gift modal on any close. Fires the real onClose so the
  // paywall goes away and control returns to the parent.
  const handleGiftDismiss = () => {
    setExitGiftOpen(false)
    onClose()
  }

  // Close on Escape — but not while the pre-paywall is up; it owns its own
  // Escape handler and firing both would trigger the exit-gift flow prematurely.
  useEffect(() => {
    if (showPrePaywall) return
    const handler = e => { if (e.key === 'Escape') handleDismiss('escape') }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, trigger, showPrePaywall])

  const handleStartTrial = async () => {
    track('paywall_cta_click', { plan_clicked: 'unlimited', billing_period: 'weekly', trigger_feature: trigger, is_trial: true })
    track('trial_started', { plan: 'unlimited', billing_period: 'weekly', source: trigger })
    setTrialLoading(true)
    setTrialError(null)
    try {
      const url = await activateTrial(userId, userEmail)
      if (!url) { setTrialError('Something went wrong. Please try again.'); return }
      window.location.href = url
    } catch {
      setTrialError('Something went wrong. Please try again.')
    } finally {
      setTrialLoading(false)
    }
  }

  // Route paid plan clicks through the trust interstitial (Feature 3).
  // Actual Stripe call happens in handleConfirmCheckout after user sees trust screen.
  const handleSelectPlan = (planId) => {
    track('paywall_cta_click', { plan_clicked: planId, billing_period: billingPeriod, trigger_feature: trigger, is_trial: false })
    setPlanError(null)
    setPendingPlan({ planId, billingPeriod })
    setScreen('trust')
  }

  const handleConfirmCheckout = async () => {
    if (!pendingPlan) return
    track('trust_screen_confirmed', { plan: pendingPlan.planId, billing: pendingPlan.billingPeriod, trigger_feature: trigger })
    setLoading(pendingPlan.planId)
    const url = await createCheckoutSession(pendingPlan.planId, pendingPlan.billingPeriod, userEmail, userId)
    setLoading(null)
    if (!url) { setPlanError('Checkout failed. No charge was made. Please try again.'); setScreen('plans'); return }
    if (url?.alreadySubscribed) { onClose(); return }
    window.location.href = url
  }

  const isAnnual = billingPeriod === 'yearly'
  const t = TESTIMONIALS[testimonialIdx]

  const markPrePaywallSeen = () => {
    try { window.sessionStorage.setItem(PREPAYWALL_SESSION_KEY, '1') } catch {}
  }
  const handlePrePaywallContinue = () => {
    markPrePaywallSeen()
    setShowPrePaywall(false)
  }
  const handlePrePaywallDismiss = () => {
    markPrePaywallSeen()
    setShowPrePaywall(false)
  }

  // ── Shared backdrop/modal wrapper constants ──────────────────────────────────
  const BACKDROP = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }
  const MODAL_BASE = { background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '22px', padding: '32px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)', margin: 'auto', position: 'relative' }
  const CLOSE_BTN = { position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', color: '#9B9B9B', cursor: 'pointer', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const CloseX = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  const Checkmark = ({ color = '#059669' }) => <svg width="14" height="14" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>

  // ── Feature 1: Stats screen (trial-expired users) ────────────────────────────
  if (screen === 'stats') {
    const aiUsed = getFeatureUsage('aiTutor')?.count ?? 0
    const stats = [
      sessionsCompleted > 0 ? { n: sessionsCompleted, label: sessionsCompleted === 1 ? 'session completed' : 'sessions completed', color: '#3B61C4', bg: 'rgba(59,97,196,0.08)', border: 'rgba(59,97,196,0.18)' } : null,
      aiUsed > 0 ? { n: aiUsed, label: aiUsed === 1 ? 'AI question answered' : 'AI questions answered', color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.18)' } : null,
      coursesCount > 0 ? { n: coursesCount, label: coursesCount === 1 ? 'course set up' : 'courses set up', color: '#059669', bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.18)' } : null,
    ].filter(Boolean)
    return (
      <>
        <div style={BACKDROP} onClick={e => { if (e.target === e.currentTarget) handleDismiss('backdrop') }}>
          <div className="pw-modal" style={{ ...MODAL_BASE, maxWidth: 480 }}>
            <button onClick={() => handleDismiss('close_button')} style={CLOSE_BTN} aria-label="Close"><CloseX /></button>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.2)', borderRadius: 999, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#EA580C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                Trial ended
              </div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A1A1A', margin: '0 0 8px', letterSpacing: '-0.4px' }}>Don't lose your work.</h2>
              <p style={{ fontSize: '0.875rem', color: '#6B6B6B', margin: 0, lineHeight: 1.5 }}>Here's what you built during your trial:</p>
            </div>
            {stats.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: '18px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 34, fontWeight: 800, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.n}</div>
                    <div style={{ fontSize: 11, color: '#6B6B6B', fontWeight: 600, marginTop: 6, lineHeight: 1.3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#F7F6F3', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'center', fontSize: '0.85rem', color: '#6B6B6B' }}>
                Your courses and study plan are saved and ready when you upgrade.
              </div>
            )}
            <p style={{ fontSize: '0.875rem', color: '#6B6B6B', margin: '0 0 20px', lineHeight: 1.55, textAlign: 'center' }}>
              Upgrade to keep full access. Your AI tutor, focus sessions, and everything you set up are still here.
            </p>
            <button onClick={() => setScreen('plans')} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3B61C4, #7C3AED)', border: 'none', borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.01em', marginBottom: 10, transition: 'opacity 0.15s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }} onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
              Keep everything →
            </button>
            <button onClick={() => handleDismiss('stats_skip')} style={{ width: '100%', background: 'none', border: 'none', padding: '8px', color: '#9B9B9B', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Not now
            </button>
          </div>
        </div>
        <PaywallExitGift open={exitGiftOpen} trigger={trigger} onDismiss={handleGiftDismiss} />
        <PrePaywall open={showPrePaywall} trigger={trigger} onContinue={handlePrePaywallContinue} onDismiss={handlePrePaywallDismiss} />
      </>
    )
  }

  // ── Feature 5: Commitment question (free users who've already seen PrePaywall) ─
  if (screen === 'commitment') {
    const question = primaryCourseName
      ? `Still studying for ${primaryCourseName}?`
      : 'Still working toward your study goals?'
    return (
      <>
        <div style={BACKDROP} onClick={e => { if (e.target === e.currentTarget) handleDismiss('backdrop') }}>
          <div className="pw-modal" style={{ ...MODAL_BASE, maxWidth: 420, textAlign: 'center' }}>
            <button onClick={() => handleDismiss('close_button')} style={CLOSE_BTN} aria-label="Close"><CloseX /></button>
            <div style={{ width: 60, height: 60, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A1A1A', margin: '0 0 10px', letterSpacing: '-0.4px', lineHeight: 1.2 }}>{question}</h2>
            <p style={{ fontSize: '0.875rem', color: '#6B6B6B', margin: '0 0 28px', lineHeight: 1.55 }}>
              {showTrialCard
                ? 'Your study plan is still running. Unlock everything - AI tutor, unlimited sessions, and your full schedule - free for 3 days.'
                : 'Your study plan is still running. Upgrade to keep your AI tutor, unlimited focus sessions, and full schedule. Everything you need to finish strong.'}
            </p>
            <button
              onClick={() => {
                track('commitment_yes', { trigger_feature: trigger, trial_eligible: showTrialCard })
                if (showTrialCard) { handleStartTrial() } else { setScreen('plans') }
              }}
              style={{ width: '100%', padding: '14px', background: '#3B61C4', border: 'none', borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: trialLoading ? 'not-allowed' : 'pointer', letterSpacing: '-0.01em', marginBottom: 10, transition: 'opacity 0.15s', opacity: trialLoading ? 0.75 : 1 }}
              onMouseEnter={e => { if (!trialLoading) e.currentTarget.style.opacity = '0.88' }} onMouseLeave={e => { e.currentTarget.style.opacity = trialLoading ? '0.75' : '1' }}
            >
              {trialLoading ? 'Loading…' : showTrialCard ? 'Start free 3-day trial →' : 'Yes, keep going →'}
            </button>
            {showTrialCard && (
              <p style={{ fontSize: '0.72rem', color: '#9B9B9B', margin: '-4px 0 10px' }}>Card required · $0 today · Cancel anytime</p>
            )}
            {trialError && (
              <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 8px' }}>{trialError}</p>
            )}
            {showTrialCard && (
              <button onClick={() => { track('commitment_see_plans', { trigger_feature: trigger }); setScreen('plans') }} style={{ width: '100%', background: 'none', border: 'none', padding: '6px', color: '#9B9B9B', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
                See all plans instead
              </button>
            )}
            <button onClick={() => { track('commitment_no', { trigger_feature: trigger }); handleDismiss('commitment_no') }} style={{ width: '100%', background: 'none', border: 'none', padding: '8px', color: '#C0C0C0', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Not right now
            </button>
          </div>
        </div>
        <PaywallExitGift open={exitGiftOpen} trigger={trigger} onDismiss={handleGiftDismiss} />
        <PrePaywall open={showPrePaywall} trigger={trigger} onContinue={handlePrePaywallContinue} onDismiss={handlePrePaywallDismiss} />
      </>
    )
  }

  // ── Feature 3: Trust interstitial (before Stripe checkout) ───────────────────
  if (screen === 'trust') {
    const plan = PLANS[pendingPlan?.planId]
    const price = plan?.prices?.[pendingPlan?.billingPeriod]
    const CardBadge = ({ label, bg, color = '#fff' }) => (
      <div style={{ background: bg, borderRadius: 6, padding: '5px 9px', fontSize: '10px', fontWeight: 900, color, fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 3 }}>{label}</div>
    )
    return (
      <>
        <div style={BACKDROP} onClick={e => { if (e.target === e.currentTarget) setScreen('plans') }}>
          <div className="pw-modal" style={{ ...MODAL_BASE, maxWidth: 420 }}>
            <button onClick={() => setScreen('plans')} style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: 'none', color: '#9B9B9B', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5m7-7l-7 7 7 7" /></svg>
              Back
            </button>
            <div style={{ textAlign: 'center', paddingTop: 20, marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="24" height="24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.4px' }}>Secure checkout</h2>
              <p style={{ fontSize: '0.82rem', color: '#6B6B6B', margin: 0 }}>Powered by Stripe, trusted by millions of businesses</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <CardBadge label="VISA" bg="#1A1F71" />
              <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#EB001B' }} />
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#F79E1B', marginLeft: -7, opacity: 0.9 }} />
              </div>
              <CardBadge label="AMEX" bg="#007BC1" />
              <div style={{ background: '#000', borderRadius: 6, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="11" height="13" viewBox="0 0 814 1000" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.8-170.3-135.8C63 465.9 50.9 364.3 50.9 264.2c0-154.9 101-236.8 199.2-236.8 74.3 0 136.3 47.3 183.3 47.3 44.3 0 114.3-50.2 196.6-50.2 30.5 0 109.3 2.6 166.3 74.1zM506.7 85.2C516.3 72.4 527 51.5 527 30.6c0-3.2-.3-6.5-.9-9.7-21.7 2.6-47.8 14.8-64 32.8-10.5 11.6-22.9 31.5-22.9 54.2 0 3.5.6 7 .9 8.1 1.3.3 3.2.6 5.2.6 19.7 0 44.3-12.3 61.4-31.4z" /></svg>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#fff', fontFamily: 'Arial, sans-serif' }}>Pay</span>
              </div>
            </div>
            <div style={{ background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['256-bit SSL encryption on all data', 'Cancel anytime in 2 clicks from your account', 'No surprise charges. Full control over your plan.'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#1A1A1A' }}>
                  <Checkmark />
                  {item}
                </div>
              ))}
            </div>
            {plan && (
              <div style={{ background: 'linear-gradient(135deg, rgba(59,97,196,0.06), rgba(124,58,237,0.06))', border: '1.5px solid rgba(59,97,196,0.15)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Starting plan</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px' }}>{plan.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#3B61C4' }}>{price}</div>
                  <div style={{ fontSize: '0.68rem', color: '#9B9B9B', fontWeight: 500 }}>billed {pendingPlan.billingPeriod}</div>
                </div>
              </div>
            )}
            <button
              onClick={handleConfirmCheckout}
              disabled={!!loading}
              style={{ width: '100%', padding: '14px', background: '#059669', border: 'none', borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.01em', marginBottom: 10, opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = loading ? '0.7' : '1' }}
            >
              {loading ? 'Loading…' : 'Continue to checkout →'}
            </button>
            {planError && <p style={{ textAlign: 'center', color: '#DC2626', fontSize: '0.78rem', margin: '0 0 8px', fontWeight: 500 }}>{planError}</p>}
            <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#9B9B9B', margin: 0 }}>
              You'll enter payment details on Stripe's secure checkout page
            </p>
          </div>
        </div>
        <PaywallExitGift open={exitGiftOpen} trigger={trigger} onDismiss={handleGiftDismiss} />
        <PrePaywall open={showPrePaywall} trigger={trigger} onContinue={handlePrePaywallContinue} onDismiss={handlePrePaywallDismiss} />
      </>
    )
  }

  return (
    <>
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
        overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleDismiss('backdrop') }}
    >
      <style>{`
        @media (max-width: 600px) {
          .pw-modal { padding: 20px 16px !important; border-radius: 16px !important; }
          .pw-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div className="pw-modal" style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '22px',
        padding: '32px',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
        margin: 'auto',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)',
              borderRadius: '999px', padding: '4px 12px',
              fontSize: '0.72rem', fontWeight: 700, color: '#3B61C4',
              textTransform: 'uppercase', letterSpacing: '0.4px',
              marginBottom: '10px',
            }}>
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {msg.tag}
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.4px', color: '#1A1A1A', margin: '0 0 6px' }}>
              {msg.title}
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: '0.875rem', lineHeight: 1.55, margin: '0 0 4px', maxWidth: 420 }}>
              {msg.body}
            </p>
            {!isUnlimitedTrigger && (
              <p style={{ color: '#9B9B9B', fontSize: '0.78rem', margin: 0 }}>
                $0 today · From $2.31/week · Cancel with one tap
              </p>
            )}
          </div>
          <button
            onClick={() => handleDismiss('close_button')}
            style={{
              background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '8px', color: '#9B9B9B', cursor: 'pointer',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: '16px', fontSize: '14px',
            }}
            aria-label="Close"
          ><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>

        {/* ── Social proof bar ── */}
        <div style={{
          background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)',
          borderRadius: '12px', padding: '12px 16px', marginBottom: '18px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Star rating */}
            <div style={{ display: 'flex', gap: '2px' }}>
              {[1,2,3,4,5].map(s => (
                <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="#FBBF24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              ))}
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B6B6B' }}>
              Trusted by 500+ students
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <svg style={{ width: 14, height: 14, color: '#3B61C4', flexShrink: 0, marginTop: 3 }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.82rem', color: '#1A1A1A', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{t.quote}"
              </p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#9B9B9B', fontWeight: 600 }}>
                {t.name} · {t.detail}
              </p>
            </div>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 4 }}>
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTestimonialIdx(i)}
                  style={{
                    width: i === testimonialIdx ? 14 : 5, height: 5, borderRadius: 3,
                    background: i === testimonialIdx ? '#3B61C4' : 'rgba(0,0,0,0.12)',
                    border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Win-Back Card (trial used, now back on free) ── */}
        {showWinBackCard && (
          <div style={{
            background: 'linear-gradient(135deg, #fff8f0, #fff4e8)',
            border: '1.5px solid rgba(234,88,12,0.2)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.2)',
              borderRadius: '999px', padding: '3px 10px',
              fontSize: '0.68rem', fontWeight: 800, color: '#EA580C',
              textTransform: 'uppercase', letterSpacing: '0.5px',
              marginBottom: '10px',
            }}>
              Your trial ended
            </div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px', letterSpacing: '-0.2px' }}>
              Here's what you lost when your trial ended:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
              {['Unlimited focus sessions (30-min cap is back)', '100 AI actions/month (you now have 5 total)', '5 courses (you\'re back to 1)', 'Session Blueprints, Brain Dumps, Exam Rescues'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#6B6B6B' }}>
                  <span style={{ color: '#EA580C', fontSize: '0.75rem' }}>✕</span>
                  {item}
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6B6B6B', margin: '0 0 12px' }}>
              Get it all back from just $1.35/week on the annual plan. Cancel with one tap.
            </p>
          </div>
        )}

        {/* ── Free Trial Card (shown when trial not yet used) ── */}
        {showTrialCard && (
          <div style={{
            background: 'linear-gradient(135deg, #e8f4fd, #f0f9f4)',
            border: '1.5px solid rgba(59,130,246,0.25)',
            borderRadius: '16px',
            padding: '22px 20px',
            marginBottom: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '999px', padding: '3px 10px',
              fontSize: '0.68rem', fontWeight: 800, color: '#059669',
              textTransform: 'uppercase', letterSpacing: '0.5px',
              marginBottom: '10px',
            }}>
              3 days on us · No charge today
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A1A1A', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              Try Unlimited, free for 3 days.
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#6B6B6B', margin: '0 0 14px', lineHeight: 1.5 }}>
              Full access starting today. We'll email you the day before your trial ends so nothing catches you off guard.
            </p>
            {/* $0 today — the single most important reassurance on this screen. */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.22)',
              borderRadius: 10, padding: '8px 12px', marginBottom: 14,
              fontSize: '0.82rem', fontWeight: 700, color: '#047857',
            }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
              </svg>
              $0 charged today
            </div>
            {trialError && (
              <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 10px' }}>{trialError}</p>
            )}
            <button
              onClick={handleStartTrial}
              disabled={trialLoading}
              style={{
                width: '100%', padding: '13px',
                background: '#3B61C4',
                border: 'none', borderRadius: '10px',
                color: '#fff', fontFamily: 'inherit',
                fontSize: '0.95rem', fontWeight: 800,
                cursor: trialLoading ? 'not-allowed' : 'pointer',
                opacity: trialLoading ? 0.75 : 1,
                letterSpacing: '-0.2px',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!trialLoading) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = trialLoading ? '0.75' : '1' }}
            >
              {trialLoading ? 'Loading…' : 'Continue - free for 3 days'}
            </button>
            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#9B9B9B' }}>
              Card required · $0 today · Cancel anytime
            </p>
          </div>
        )}

        {/* ── "Or choose a plan" divider when trial card is shown ── */}
        {showTrialCard && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.07)' }} />
            <span style={{ fontSize: '0.72rem', color: '#C0C0C0', fontWeight: 600, whiteSpace: 'nowrap' }}>
              or choose a paid plan
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.07)' }} />
          </div>
        )}

        {/* ── Billing period toggle ── */}
        <div style={{
          display: 'flex', gap: '4px',
          background: '#F7F6F3',
          border: '1px solid rgba(0,0,0,0.07)',
          borderRadius: '12px', padding: '4px',
          marginBottom: '14px',
        }}>
          {BILLING_PERIODS.map(bp => {
            const isActive = billingPeriod === bp.id
            return (
              <button
                key={bp.id}
                onClick={() => setBillingPeriod(bp.id)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '9px',
                  border: bp.best && !isActive ? '1px solid rgba(5,150,105,0.35)' : 'none',
                  cursor: 'pointer',
                  background: isActive ? (bp.best ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : '#fff') : 'transparent',
                  color: isActive ? '#1A1A1A' : '#9B9B9B',
                  fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                  transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <span>{bp.label}</span>
                {bp.badge && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', letterSpacing: '0.3px' }}>
                    {bp.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Plan cards ── */}
        <div className="pw-cards" style={{ display: 'grid', gridTemplateColumns: visiblePlanIds.length === 1 ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {Object.entries(PLANS).filter(([planId]) => visiblePlanIds.includes(planId)).map(([planId, plan]) => {
            // Unlimited is always primary — 100% of paying users chose Unlimited.
            // Pro shown as the lower-commitment entry option.
            const isPrimary = planId === 'unlimited'
            const primaryColor = planId === 'pro' ? '#3B61C4' : '#059669'
            const primaryBorder = planId === 'pro' ? 'rgba(59,97,196,0.3)' : 'rgba(5,150,105,0.3)'
            return (
            <div
              key={planId}
              style={{
                background: '#fff',
                border: `1.5px solid ${primaryBorder}`,
                borderRadius: '16px', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
                position: 'relative', overflow: 'hidden',
                boxShadow: isPrimary ? '0 8px 24px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {/* Most popular / Required badge — always on Unlimited */}
              {isPrimary && visiblePlanIds.length > 1 && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: '0.62rem', fontWeight: 800, color: '#fff',
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  borderRadius: '999px', padding: '3px 9px',
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                }}>
                  {isUnlimitedTrigger ? 'Required' : 'Most popular'}
                </div>
              )}

              {/* Plan name + price */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: plan.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {plan.name}
                  </div>
                  {(() => {
                    const savings = billingPeriod === 'yearly' ? plan.annualSavingsBadge
                                  : billingPeriod === 'monthly' ? plan.monthlySavingsBadge
                                  : null
                    if (!savings) return null
                    return (
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 800, color: '#059669',
                        background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.25)',
                        borderRadius: '999px', padding: '2px 7px', letterSpacing: '0.3px',
                      }}>
                        {savings}
                      </span>
                    )
                  })()}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px' }}>
                  {plan.prices[billingPeriod]}
                </div>
                {plan.subPrices?.[billingPeriod] && (
                  <div style={{ fontSize: '0.7rem', color: '#6B6B6B', marginTop: '3px', fontWeight: 600 }}>
                    {plan.subPrices[billingPeriod]}
                  </div>
                )}
                {planId === 'unlimited' && !trialUsed && !trialActive && (
                  <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '4px', fontWeight: 700 }}>
                    $0 today · 3-day free trial · Cancel anytime
                  </div>
                )}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px', margin: 0, padding: 0, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.81rem', color: '#1A1A1A' }}>
                    <svg width="12" height="12" fill="none" stroke={plan.color} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleSelectPlan(planId)}
                disabled={loading === planId}
                style={{
                  width: '100%', padding: '12px',
                  background: isPrimary ? primaryColor : 'rgba(0,0,0,0.04)',
                  border: isPrimary ? 'none' : '1px solid rgba(0,0,0,0.10)',
                  borderRadius: '10px',
                  color: isPrimary ? 'white' : '#1A1A1A',
                  fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700,
                  cursor: loading === planId ? 'not-allowed' : 'pointer',
                  opacity: loading === planId ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { if (loading !== planId) e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = loading === planId ? '0.7' : '1' }}
              >
                {loading === planId ? 'Loading...' : `Continue with ${plan.name} →`}
              </button>
            </div>
            )
          })}
        </div>

        {planError && (
          <p style={{ textAlign: 'center', color: '#DC2626', fontSize: '0.78rem', margin: '0 0 8px', fontWeight: 500 }}>
            {planError}
          </p>
        )}

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', color: '#9B9B9B', fontSize: '0.75rem', margin: 0 }}>
          Secure checkout via Stripe · Cancel with one tap · No hidden fees
        </p>
      </div>
    </div>

    {/* Exit-intent gift — intercepts the first close for free users, offers
        5 bonus AI actions + review ask, then closes the paywall for real. */}
    <PaywallExitGift
      open={exitGiftOpen}
      trigger={trigger}
      onDismiss={handleGiftDismiss}
    />

    {/* Pre-paywall value stack — the 3-screen pitch shown once per session
        for eligible free users. Overlays the paywall (higher z-index) until
        the user Continues or Skips. */}
    <PrePaywall
      open={showPrePaywall}
      trigger={trigger}
      onContinue={handlePrePaywallContinue}
      onDismiss={handlePrePaywallDismiss}
    />
    </>
  )
}
