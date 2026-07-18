import { useState } from 'react'
import { recordConfidence } from '../lib/confidenceStore'
import { track } from '../lib/analytics'

const D = {
  bgCard: '#FFFFFF',
  text:   '#111111',
  muted:  '#6B6B6B',
  dim:    '#9B9B9B',
  border: 'rgba(0,0,0,0.07)',
  blue:   '#3B61C4',
}

const RATINGS = [
  { value: 1, label: 'Lost',         emoji: 'Blank',  color: '#DC2626' },
  { value: 2, label: 'Fuzzy',        emoji: 'Foggy',  color: '#EA580C' },
  { value: 3, label: 'Getting it',   emoji: 'OK',     color: '#D97706' },
  { value: 4, label: 'Solid',        emoji: 'Clear',  color: '#16A34A' },
  { value: 5, label: 'Could teach it', emoji: 'Sharp', color: '#15803D' },
]

// A compact "how confident do you feel?" modal. Zero-friction: one tap and done.
// Feed with { topic, courseId, source, onClose, onSubmitted }.
export default function ConfidenceTapModal({ topic, courseId, source = 'session', onClose, onSubmitted }) {
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)

  const submit = (rating) => {
    recordConfidence({ rating, topic, courseId, source })
    track('confidence_recorded', { rating, source, hasTopic: !!topic })
    setSelected(rating)
    setTimeout(() => {
      onSubmitted?.(rating)
      onClose?.()
    }, 550)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 105,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
        display: 'grid', placeItems: 'center',
        padding: 20,
        animation: 'cf-fade-bg 200ms ease-out both',
      }}
    >
      <style>{`
        @keyframes cf-fade-bg { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cf-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes cf-check { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        .cf-btn { transition: all 150ms cubic-bezier(0.4,0,0.2,1); }
        .cf-btn:hover { transform: translateY(-2px); }
        .cf-btn:active { transform: scale(0.95); }
        .cf-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(59,97,196,0.35); }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: D.bgCard,
          border: `1px solid ${D.border}`,
          borderRadius: 20,
          padding: '28px 28px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          animation: 'cf-pop 300ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {selected != null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#16A34A',
              display: 'grid', placeItems: 'center',
              boxShadow: '0 8px 24px rgba(22,163,74,0.35)',
              animation: 'cf-check 400ms cubic-bezier(0.34,1.3,0.64,1) both',
              marginBottom: 14,
            }}>
              <svg width="28" height="28" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>Locked in</div>
            <div style={{ fontSize: 12.5, color: D.muted, marginTop: 4 }}>We'll show you if reality matches later.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: D.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Confidence check
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              How well do you know it?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: D.muted, lineHeight: 1.55 }}>
              {topic ? `Rate your grip on ${topic}. We'll check reality against this later.` : "Rate your grip on this material. We'll check reality later."}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {RATINGS.map(r => {
                const active = hovered === r.value
                return (
                  <button
                    key={r.value}
                    className="cf-btn"
                    onMouseEnter={() => setHovered(r.value)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => submit(r.value)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 6px 10px',
                      minHeight: 76,
                      background: active ? `${r.color}12` : 'rgba(0,0,0,0.02)',
                      border: `1.5px solid ${active ? r.color : D.border}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    aria-label={`${r.value} out of 5 — ${r.label}`}
                  >
                    <span style={{
                      fontSize: 16, fontWeight: 800,
                      color: active ? r.color : D.text,
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{r.value}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? r.color : D.dim, letterSpacing: '-0.005em' }}>
                      {r.label}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={onClose}
              style={{
                marginTop: 16, width: '100%',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: D.dim, fontFamily: 'inherit',
                padding: '8px 4px',
              }}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}
