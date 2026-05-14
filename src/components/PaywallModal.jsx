import { useEffect, useState } from 'react'
import { createCheckoutSession } from '../lib/subscription'

// ── Config ────────────────────────────────────────────────────────────────────

const BILLING_PERIODS = [
  { id: 'monthly',  label: 'Monthly',  badge: null,        best: false },
  { id: 'semester', label: 'Semester', badge: 'Save 23%',  best: false },
  { id: 'yearly',   label: 'Annual',   badge: 'Save 45%',  best: true  },
]

const PLANS = {
  pro: {
    name: 'Pro',
    color: '#7C5CFA',
    gradient: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
    prices: {
      monthly:  '$12.99/mo',
      semester: '$39.99/semester',
      yearly:   '$84.99/yr',
    },
    subPrices: {
      monthly:  null,
      semester: '$13.33/mo equivalent',
      yearly:   '$7.08/mo · billed annually',
    },
    features: [
      '5 courses',
      '75 study boosts / month',
      'AI study plans',
      'Flashcards & quizzes',
      'Focus sessions',
      'Study Coach',
      'Session Blueprints',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    color: '#34D399',
    gradient: null,
    prices: {
      monthly:  '$19.99/mo',
      semester: '$59.99/semester',
      yearly:   '$119.99/yr',
    },
    subPrices: {
      monthly:  null,
      semester: '$20.00/mo equivalent',
      yearly:   '$10.00/mo · billed annually',
    },
    features: [
      'Unlimited courses',
      'Unlimited study boosts',
      'AI study plans',
      'Flashcards & quizzes',
      'Focus sessions',
      'Study Coach',
      'Session Blueprints',
      'Priority support',
    ],
  },
}

const LIMIT_MESSAGES = {
  courses: {
    tag: 'Course limit reached',
    title: 'You\'re out of course slots.',
    body: 'Free plan holds 1 course. Pro gives you 5, enough for a full semester with room to spare.',
  },
  ai: {
    tag: 'Boost limit reached',
    title: 'You\'ve used all 10 study boosts.',
    body: 'Pro gets 75 boosts a month. That\'s enough to build a plan, run blueprints, and coach every session for the entire semester.',
  },
  coach: {
    tag: 'Pro feature',
    title: 'Study Coach is a Pro feature.',
    body: 'Get a personalized 8-week AI study plan built around your deadlines, courses, and learning style. Upgrade to unlock it.',
  },
  blueprint: {
    tag: 'Pro feature',
    title: 'Session Blueprints are a Pro feature.',
    body: 'Your session plan is built and ready to go. Upgrade to access it and every blueprint you generate from here on.',
  },
  focus: {
    tag: 'Pro feature',
    title: 'Focus sessions are a Pro feature.',
    body: 'Start a timed study session with your blueprint loaded. Upgrade to unlock focused, distraction-free study mode.',
  },
  tools: {
    tag: 'Pro feature',
    title: 'Study Tools are a Pro feature.',
    body: 'Flashcards, practice quizzes, and AI-generated study materials from your own course content. Upgrade to unlock.',
  },
}

const TESTIMONIALS = [
  { quote: 'finally consistent with my studying for the first time ever', name: 'Andy G.', detail: 'University, 2nd year' },
  { quote: 'finished top of my cohort last semester. I genuinely could not have done it without this', name: 'Danny K.', detail: 'Pre-med, 3.8 GPA' },
  { quote: 'one app. all semester. I don\'t need anything else.', name: 'Charlotte B.', detail: 'Law school prep' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaywallModal({ trigger, onClose, userEmail, userId, currentPlan = 'free' }) {
  const [billingPeriod, setBillingPeriod] = useState('yearly')
  const [loading, setLoading] = useState(null)
  const [testimonialIdx, setTestimonialIdx] = useState(0)

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

  const handleSelectPlan = async (planId, opts = {}) => {
    setLoading(planId)
    const url = await createCheckoutSession(planId, billingPeriod, userEmail, userId, opts)
    setLoading(null)
    if (!url) { alert('Something went wrong. Please try again.'); return }
    // Already subscribed — close the paywall, no redirect needed
    if (url?.alreadySubscribed) { onClose(); return }
    window.location.href = url
  }

  const isProMonthly = billingPeriod === 'monthly'
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
              {msg.title}
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: '0.875rem', lineHeight: 1.55, margin: 0, maxWidth: 420 }}>
              {msg.body}
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
          >✕</button>
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
          {Object.entries(PLANS).filter(([planId]) => visiblePlanIds.includes(planId)).map(([planId, plan], i) => (
            <div
              key={planId}
              style={{
                background: '#fff',
                border: i === 0 ? '1.5px solid rgba(59,97,196,0.3)' : '1.5px solid rgba(5,150,105,0.3)',
                borderRadius: '16px', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Most popular badge (Pro only when showing both) */}
              {planId === 'pro' && visiblePlanIds.length > 1 && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: '0.62rem', fontWeight: 800, color: '#fff',
                  background: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
                  borderRadius: '999px', padding: '3px 9px',
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                }}>
                  Most popular
                </div>
              )}

              {/* Plan name + price */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: plan.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {plan.name}
                  </div>
                  {planId === 'pro' && isProMonthly && (
                    <div style={{
                      fontSize: '0.62rem', fontWeight: 800, color: '#34d399',
                      background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
                      borderRadius: '999px', padding: '2px 8px', letterSpacing: '0.3px', textTransform: 'uppercase',
                    }}>
                      7-day free trial
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px' }}>
                  {plan.prices[billingPeriod]}
                </div>
                {plan.subPrices?.[billingPeriod] && (
                  <div style={{ fontSize: '0.7rem', color: '#34d399', marginTop: '3px', fontWeight: 600 }}>
                    {plan.subPrices[billingPeriod]}
                  </div>
                )}
                {planId === 'pro' && isProMonthly && (
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '3px' }}>
                    Card required · cancel before day 7, pay nothing
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
                onClick={() => handleSelectPlan(planId, planId === 'pro' && isProMonthly ? { trial: true } : {})}
                disabled={loading === planId}
                style={{
                  width: '100%', padding: '12px',
                  background: i === 0 ? '#3B61C4' : 'rgba(5,150,105,0.08)',
                  border: i === 0 ? 'none' : '1px solid rgba(5,150,105,0.3)',
                  borderRadius: '10px',
                  color: i === 0 ? 'white' : '#059669',
                  fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700,
                  cursor: loading === planId ? 'not-allowed' : 'pointer',
                  opacity: loading === planId ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { if (loading !== planId) e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = loading === planId ? '0.7' : '1' }}
              >
                {loading === planId
                  ? 'Loading...'
                  : planId === 'pro' && isProMonthly
                    ? 'Start free trial · 7 days →'
                    : planId === 'pro' && isAnnual
                      ? 'Get Pro Annual · best value →'
                      : `Get ${plan.name} →`}
              </button>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', color: '#9B9B9B', fontSize: '0.75rem', margin: 0 }}>
          Secure checkout via Stripe · Cancel anytime · No hidden fees
        </p>
      </div>
    </div>
  )
}
