import { useEffect, useState } from 'react'
import { track } from '../lib/analytics'

const LS_KEY = 'se_welcome_shown_v1'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  brand:   '#3B61C4',
  green:   '#16A34A',
  amber:   '#D97706',
}

// One-time welcome moment shown to a brand-new user after onboarding
// completes. Warmer than the utilitarian empty state — celebrates the setup,
// previews the first meaningful action, and only appears once.
export default function WelcomeOverlay({ firstName, isExamMode = false, onStart, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(LS_KEY) === '1') return
    setMounted(true)
    // Two-frame delay so the entry transition plays.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setVisible(true)
      track('welcome_overlay_shown', { hasName: Boolean(firstName) })
    }))
  }, [firstName])

  if (!mounted) return null

  const close = (source) => {
    track('welcome_overlay_dismiss', { source })
    try { localStorage.setItem(LS_KEY, '1') } catch {}
    setVisible(false)
    setTimeout(() => { setMounted(false); onDismiss?.() }, 220)
  }

  const start = () => {
    track('welcome_overlay_start')
    try { localStorage.setItem(LS_KEY, '1') } catch {}
    setVisible(false)
    setTimeout(() => { setMounted(false); onStart?.() }, 180)
  }

  const greeting = firstName ? `Welcome, ${firstName}.` : 'Welcome to StudyEdge.'

  const promises = isExamMode
    ? [
        { icon: 'target',   text: 'A prep plan built around your test date' },
        { icon: 'zap',      text: 'Focus sessions that build stamina, not stress' },
        { icon: 'trending', text: 'A weakness map that gets sharper every week' },
      ]
    : [
        { icon: 'target',   text: 'A weekly plan built around your exams' },
        { icon: 'zap',      text: 'One-tap Focus sessions with recall + review' },
        { icon: 'trending', text: 'Grade tracking that catches drops early' },
      ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: `rgba(0,0,0,${visible ? 0.35 : 0})`,
        backdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
        transition: 'background 220ms ease, backdrop-filter 220ms ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => close('backdrop')}
    >
      <style>{`
        @keyframes wo-glow {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        .wo-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .wo-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px ${D.brand}45; }
        .wo-btn:active { transform: scale(0.97); }
        .wo-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${D.brand}55; }
        .wo-ghost:hover { color: ${D.text}; }
        .wo-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wo-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 480,
          background: D.bg,
          border: '1px solid rgba(0,0,0,0.07)',
          borderRadius: 20,
          padding: '32px 28px 26px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'opacity 220ms ease, transform 260ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Close button */}
        <button
          className="wo-ghost"
          onClick={() => close('close_button')}
          aria-label="Close welcome"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, minHeight: 32,
            background: 'transparent', border: 'none', borderRadius: 8,
            display: 'grid', placeItems: 'center', cursor: 'pointer',
            color: '#9B9B9B',
            transition: 'color 150ms ease',
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        {/* Celebration icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            <div style={{
              position: 'absolute', inset: -6, borderRadius: '50%',
              background: `radial-gradient(circle, ${D.brand}30 0%, transparent 65%)`,
              animation: 'wo-glow 3s ease-in-out infinite',
            }}/>
            <div style={{
              position: 'relative', width: 72, height: 72, borderRadius: 20,
              background: `linear-gradient(135deg, ${D.brand}, #2D4EB3)`,
              display: 'grid', placeItems: 'center',
              boxShadow: `0 8px 24px ${D.brand}55`,
            }}>
              <svg width="34" height="34" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
        </div>

        <h2 id="wo-title" style={{
          margin: '0 0 6px', textAlign: 'center',
          fontSize: 22, fontWeight: 800, color: D.text,
          letterSpacing: '-0.02em', lineHeight: 1.25,
        }}>
          {greeting}
        </h2>
        <p style={{ margin: '0 0 22px', textAlign: 'center', fontSize: 14.5, color: D.muted, lineHeight: 1.55 }}>
          Your account is ready. One course, one exam date — that's all it takes to get your first plan.
        </p>

        {/* What you get */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '14px 16px', marginBottom: 22,
          background: '#FAFAF8',
          border: '1px solid rgba(0,0,0,0.05)',
          borderRadius: 14,
        }}>
          {promises.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: `${D.brand}12`, border: `1px solid ${D.brand}22`,
                display: 'grid', placeItems: 'center',
              }}>
                <PromiseIcon kind={p.icon} color={D.brand}/>
              </div>
              <span style={{ fontSize: 13, color: D.text, lineHeight: 1.45, fontWeight: 500 }}>{p.text}</span>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <button
          className="wo-btn"
          onClick={start}
          style={{
            width: '100%',
            minHeight: 50,
            padding: '0 24px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: `linear-gradient(135deg, ${D.brand}, #2D4EB3)`,
            color: '#FFFFFF', border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer',
            boxShadow: `0 6px 20px ${D.brand}40`,
            letterSpacing: '-0.01em',
          }}
        >
          {isExamMode ? 'Add your first section' : 'Add your first course'}
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 11.5, color: '#9B9B9B' }}>
          Takes about 60 seconds. You can edit anything later.
        </p>
      </div>
    </div>
  )
}

function PromiseIcon({ kind, color }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (kind === 'zap') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={color} stroke="none"/>
      </svg>
    )
  }
  if (kind === 'trending') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
      </svg>
    )
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/>
    </svg>
  )
}
