import { useEffect } from 'react'

const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    price: '$12.99',
    per: '/mo',
    color: '#7C5CFA',
    features: ['5 courses', '50 AI queries / month', 'Smart calendar', 'Focus Mode timer', 'Push notifications'],
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: '$19.99',
    per: '/mo',
    color: '#34D399',
    features: ['Unlimited courses', 'Unlimited AI queries', 'Smart calendar', 'Focus Mode timer', 'Priority support'],
  },
]

const LIMIT_MESSAGES = {
  courses: {
    title: 'Course limit reached',
    body: 'Free accounts are limited to 1 course. Upgrade to add more.',
  },
  ai: {
    title: 'AI query limit reached',
    body: 'You\'ve used all 10 free AI queries this month. Upgrade for more.',
  },
}

export default function PaywallModal({ trigger, onClose }) {
  const msg = LIMIT_MESSAGES[trigger] || LIMIT_MESSAGES.courses

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8,13,26,0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#0D1425',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
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
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.8px', color: '#F1F5F9', margin: 0 }}>
              {msg.title}
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginTop: '6px' }}>{msg.body}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#94A3B8', cursor: 'pointer',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: '16px',
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {PLANS.map((plan, i) => (
            <div
              key={plan.id}
              style={{
                background: '#111C30',
                border: i === 0 ? '1px solid rgba(124,92,250,0.3)' : '1px solid rgba(52,211,153,0.2)',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: plan.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F1F5F9', letterSpacing: '-1px' }}>{plan.price}</span>
                  <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{plan.per}</span>
                </div>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', color: '#CBD5E1' }}>
                    <svg width="13" height="13" fill="none" stroke={plan.color} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { location.href = `/signup?plan=${plan.id}` }}
                style={{
                  width: '100%', padding: '10px',
                  background: i === 0
                    ? 'linear-gradient(135deg, #4F7EF7, #7C5CFA)'
                    : 'rgba(52,211,153,0.12)',
                  border: i === 0 ? 'none' : '1px solid rgba(52,211,153,0.35)',
                  borderRadius: '9px',
                  color: i === 0 ? 'white' : '#34D399',
                  fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Get {plan.name}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <a
            href="/#pricing"
            style={{ color: '#94A3B8', fontSize: '0.82rem', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F1F5F9' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8' }}
          >
            Compare all plans →
          </a>
        </div>
      </div>
    </div>
  )
}
