import { useEffect, useState } from 'react'
import { createCheckoutSession, hasUsedTrial, isTrialActive } from '../lib/subscription'
import { track } from '../lib/analytics'

// ── Config ────────────────────────────────────────────────────────────────────

const BILLING_PERIODS = [
  { id: 'weekly',  label: 'Weekly',  badge: null,        best: false },
  { id: 'monthly', label: 'Monthly', badge: 'Save 17%',  best: false },
  { id: 'yearly',  label: 'Annual',  badge: 'Save 55%',  best: true  },
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
      monthly: 'Billed monthly · $2.31/wk equivalent',
      yearly:  'Billed annually · $1.35/wk equivalent',
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
      monthly: 'Billed monthly · $3.46/wk equivalent',
      yearly:  'Billed annually · $2.31/wk equivalent',
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
    body: 'Stop juggling apps. Your full semester — every course, every exam — planned in one place.',
  },
  ai: {
    tag: 'Unlock AI tutoring',
    title: 'Get AI help anytime, for every course.',
    body: 'Pro gives you 100 AI actions/month — your always-on tutor for every concept you\'re stuck on.',
  },
  tutorMemory: {
    tag: 'Unlimited only · Tutor memory',
    title: 'AI Tutor with full session memory.',
    body: 'Your tutor remembers everything from your conversation — no more re-explaining context every message. Available on Unlimited.',
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
    body: 'A full breakdown before every study block — what to learn, in what order, with practice prompts ready to go.',
  },
  focus: {
    tag: 'Study without a timer cap',
    title: 'Unlock unlimited Focus sessions.',
    body: 'Lock in for as long as you need. Pro removes the 60-min cap so you can finish what you started.',
  },
  brainDump: {
    tag: 'Train recall on every topic',
    title: 'Unlock unlimited Brain Dumps.',
    body: 'Recall practice is the #1 evidence-based study technique. Pro lets you brain dump anything, anytime.',
  },
  quizBurst: {
    tag: 'Test yourself anytime',
    title: 'Unlock unlimited Quiz Bursts.',
    body: 'Quick mastery checks for any topic — Pro lets you generate them on demand, all semester.',
  },
  examRescue: {
    tag: 'Behind on an exam? Rebound fast',
    title: 'Unlock unlimited Exam Rescues.',
    body: 'Pro builds a targeted rescue plan for any exam — figure out exactly what to study and when.',
  },
  tools: {
    tag: 'Your AI-built study materials',
    title: 'Unlock Flashcards, quizzes, and more.',
    body: 'Pro auto-generates flashcards and practice quizzes from your own course content — no manual setup.',
  },
  grade_recovery: {
    tag: 'Hit the grade you need',
    title: 'Unlock Grade Recovery.',
    body: 'See exactly how many points you need to hit your target, then get a study plan built to get you there.',
  },
}

const TESTIMONIALS = [
  { quote: 'finally consistent with my studying for the first time ever', name: 'Andy G.', detail: 'University, 2nd year' },
  { quote: 'finished top of my cohort last semester. I genuinely could not have done it without this', name: 'Danny K.', detail: 'Pre-med, 3.8 GPA' },
  { quote: 'one app. all semester. I don\'t need anything else.', name: 'Charlotte B.', detail: 'Law school prep' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaywallModal({ trigger, onClose, userEmail, userId, currentPlan = 'free', onTrialActivated }) {
  const [billingPeriod, setBillingPeriod] = useState('weekly')
  const [loading, setLoading] = useState(null)
  const [testimonialIdx, setTestimonialIdx] = useState(0)
  const [trialLoading, setTrialLoading] = useState(false)
  const [trialError, setTrialError] = useState(null)

  const trialUsed = hasUsedTrial()
  const trialActive = isTrialActive()
  const isUnlimitedTrigger = UNLIMITED_ONLY_TRIGGERS.has(trigger)

  // Trial card only shows for free users, never for Unlimited-only triggers
  // (the trial unlocks Pro features, not Unlimited features).
  const showTrialCard = currentPlan === 'free' && !trialUsed && !trialActive && !isUnlimitedTrigger

  const msg = LIMIT_MESSAGES[trigger] ?? LIMIT_MESSAGES.ai
  const visiblePlanIds = currentPlan === 'pro' ? ['unlimited'] : Object.keys(PLANS)

  // Rotate testimonials every 4 seconds
  useEffect(() => {
    const t = setInterval(() => setTestimonialIdx(i => (i + 1) % TESTIMONIALS.length), 4000)
    return () => clearInterval(t)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleStartTrial = async () => {
    // Card-required Stripe trial — auto-converts to weekly Pro after 3 days
    // unless the user cancels. Replaces the prior no-card trial which had ~0%
    // conversion to paid because no payment method was ever collected.
    track('trial_start_clicked', { trigger, plan: 'pro', billingPeriod: 'weekly' })
    setTrialLoading(true)
    setTrialError(null)
    try {
      const url = await createCheckoutSession('pro', 'weekly', userEmail, userId, { trial: true })
      if (!url) {
        setTrialError('Something went wrong. Please try again.')
        return
      }
      if (url?.alreadySubscribed) { onClose(); return }
      window.location.href = url
    } catch {
      setTrialError('Something went wrong. Please try again.')
    } finally {
      setTrialLoading(false)
    }
  }

  const handleSelectPlan = async (planId) => {
    track('upgrade_clicked', { planId, billingPeriod, trigger })
    setLoading(planId)
    const url = await createCheckoutSession(planId, billingPeriod, userEmail, userId)
    setLoading(null)
    if (!url) { alert('Something went wrong. Please try again.'); return }
    if (url?.alreadySubscribed) { onClose(); return }
    window.location.href = url
  }

  const isAnnual = billingPeriod === 'yearly'
  const t = TESTIMONIALS[testimonialIdx]

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
        overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
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
              {isUnlimitedTrigger ? msg.title : 'Unlock everything for less than a coffee'}
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: '0.875rem', lineHeight: 1.55, margin: 0, maxWidth: 420 }}>
              {isUnlimitedTrigger ? msg.body : '$2.99/week · Cancel anytime'}
            </p>
          </div>
          <button
            onClick={onClose}
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
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          minHeight: 62,
        }}>
          <svg style={{ width: 16, height: 16, color: '#3B61C4', flexShrink: 0, marginTop: 2 }} fill="currentColor" viewBox="0 0 24 24">
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
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 6 }}>
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
              3 days free · cancel anytime
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A1A1A', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              Try every Pro feature free for 3 days.
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#6B6B6B', margin: '0 0 16px', lineHeight: 1.5 }}>
              Full access for 3 days, then $2.99/week. Cancel anytime from your account — we'll email you 24 hours before billing.
            </p>
            {trialError && (
              <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 10px' }}>{trialError}</p>
            )}
            <button
              onClick={handleStartTrial}
              disabled={trialLoading}
              style={{
                width: '100%', padding: '13px',
                background: 'linear-gradient(135deg, #3B82F6, #10B981)',
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
              {trialLoading ? 'Loading…' : 'Start 3-day free trial →'}
            </button>
            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#9B9B9B' }}>
              Card required &nbsp;·&nbsp; $0 today &nbsp;·&nbsp; cancel anytime
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
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? '#fff' : 'transparent',
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
            // Highlight Unlimited card when trigger requires it; otherwise Pro is primary.
            const isPrimary = isUnlimitedTrigger ? planId === 'unlimited' : planId === 'pro'
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
              {/* Most popular / Required badge */}
              {isPrimary && visiblePlanIds.length > 1 && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: '0.62rem', fontWeight: 800, color: '#fff',
                  background: planId === 'pro'
                    ? 'linear-gradient(135deg, #4F7EF7, #7C5CFA)'
                    : 'linear-gradient(135deg, #10B981, #059669)',
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
                {planId === 'pro' && (
                  <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '4px', fontWeight: 700 }}>
                    Start with a 3-day free trial · cancel anytime
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
                {loading === planId ? 'Loading...' : `Get ${plan.name} →`}
              </button>
            </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', color: '#9B9B9B', fontSize: '0.75rem', margin: 0 }}>
          Secure checkout via Stripe · Cancel anytime · No hidden fees
        </p>
      </div>
    </div>
  )
}
