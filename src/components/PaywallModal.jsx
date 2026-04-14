import { useEffect, useState } from 'react'
import { createCheckoutSession } from '../lib/subscription'

// ── Config ────────────────────────────────────────────────────────────────────

const BILLING_PERIODS = [
  { id: 'monthly',  label: 'Monthly',  badge: null },
  { id: 'semester', label: 'Semester', badge: 'Save 23%' },
  { id: 'yearly',   label: 'Yearly',   badge: 'Save 45%' },
]

const PLANS = {
  pro: {
    name: 'Pro',
    color: '#7C5CFA',
    gradient: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
    prices: {
      monthly:  '$12.99/mo',
      semester: '$49.99/semester',
      yearly:   '$84.99/yr',
    },
    features: [
      '5 courses',
      '30 study boosts / month',
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
      semester: '$69.99/semester',
      yearly:   '$119.99/yr',
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
    title: 'Course limit reached',
    body: 'Free accounts are limited to 1 course. Upgrade to add more.',
  },
  ai: {
    title: 'Study boost limit reached',
    body: "You've used all your study boosts this month. Upgrade for more.",
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaywallModal({ trigger, onClose, userEmail, userId }) {
  const [billingPeriod, setBillingPeriod] = useState('monthly')
  const [loading, setLoading] = useState(null) // tracks which plan is loading
  const msg = LIMIT_MESSAGES[trigger] || LIMIT_MESSAGES.courses

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSelectPlan = async (planId) => {
    setLoading(planId)

    const url = await createCheckoutSession(planId, billingPeriod, userEmail, userId)

    setLoading(null)

    if (!url) {
      alert('Something went wrong — please try again.')
      return
    }

    window.location.href = url
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8,13,26,0.87)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#0D1425',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '22px',
        padding: '32px',
        maxWidth: '580px',
        width: '100%',
        boxShadow: '0 32px 64px rgba(0,0,0,0.7)',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(79,126,247,0.1)', border: '1px solid rgba(79,126,247,0.2)',
              borderRadius: '999px', padding: '4px 12px',
              fontSize: '0.75rem', fontWeight: 700, color: '#4F7EF7',
              marginBottom: '10px',
            }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade to continue
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#F1F5F9', margin: 0 }}>
              {msg.title}
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '0.88rem', marginTop: '6px' }}>{msg.body}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#94A3B8', cursor: 'pointer',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: '16px', fontSize: '14px',
            }}
          >✕</button>
        </div>

        {/* ── Billing period toggle ── */}
        <div style={{
          display: 'flex', gap: '4px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '4px',
          marginBottom: '20px',
        }}>
          {BILLING_PERIODS.map(bp => (
            <button
              key={bp.id}
              onClick={() => setBillingPeriod(bp.id)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '9px',
                border: 'none', cursor: 'pointer',
                background: billingPeriod === bp.id ? '#1E2D4A' : 'transparent',
                color: billingPeriod === bp.id ? '#F1F5F9' : '#64748B',
                fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              }}
            >
              <span>{bp.label}</span>
              {bp.badge && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#34D399', letterSpacing: '0.3px' }}>
                  {bp.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Plan cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {Object.entries(PLANS).map(([planId, plan], i) => (
            <div
              key={planId}
              style={{
                background: '#111C30',
                border: i === 0
                  ? '1px solid rgba(124,92,250,0.35)'
                  : '1px solid rgba(52,211,153,0.2)',
                borderRadius: '16px', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
              }}
            >
              {/* Plan name + price */}
              <div>
                <div style={{
                  fontSize: '0.75rem', fontWeight: 700, color: plan.color,
                  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#F1F5F9', letterSpacing: '-0.5px' }}>
                  {plan.prices[billingPeriod]}
                </div>
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px', margin: 0, padding: 0, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.81rem', color: '#CBD5E1' }}>
                    <svg width="12" height="12" fill="none" stroke={plan.color} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => handleSelectPlan(planId)}
                disabled={loading === planId}
                style={{
                  width: '100%', padding: '11px',
                  background: i === 0 ? plan.gradient : 'rgba(52,211,153,0.1)',
                  border: i === 0 ? 'none' : '1px solid rgba(52,211,153,0.3)',
                  borderRadius: '10px',
                  color: i === 0 ? 'white' : '#34D399',
                  fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700,
                  cursor: loading === planId ? 'not-allowed' : 'pointer',
                  opacity: loading === planId ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { if (loading !== planId) e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = loading === planId ? '0.7' : '1' }}
              >
                {loading === planId ? 'Loading...' : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.78rem', margin: 0 }}>
          Secure checkout · Cancel anytime · Powered by Stripe
        </p>
      </div>
    </div>
  )
}
