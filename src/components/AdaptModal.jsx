import { useState, useEffect } from 'react'
import { track } from '../lib/analytics'

/**
 * AdaptModal
 *
 * Shown on the dashboard when the AI has injected a review session.
 * Animated: calendar icon pulses in, then the session card "drops in."
 * Tone: warm and tutor-like, not robotic.
 *
 * Props:
 *   adaptation  - { injectedSession, reason, dayName }
 *   onAccept    - () => void
 *   onEdit      - (session) => void  (opens AddSessionModal prefilled for that day)
 *   onDismiss   - () => void  (removes the session from manual sessions)
 */
export default function AdaptModal({ adaptation, onAccept, onEdit, onDismiss }) {
  const [phase, setPhase] = useState(0) // 0=hidden, 1=icon, 2=card, 3=buttons

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 80)
    const t2 = setTimeout(() => setPhase(2), 480)
    const t3 = setTimeout(() => setPhase(3), 820)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const { injectedSession, reason } = adaptation
  const dot = injectedSession?.color?.dot ?? '#3B61C4'
  const dur = injectedSession?.duration ?? 45

  return (
    <div role="dialog" aria-modal="true" aria-label="Adapt plan" style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <style>{`
        @keyframes adapt-drop {
          0%   { opacity: 0; transform: translateY(-18px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes adapt-icon-in {
          0%   { opacity: 0; transform: scale(0.7); }
          60%  { transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes adapt-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
      `}</style>

      <div style={{
        background: '#FFFFFF',
        borderRadius: 22,
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>
        {/* Color accent top bar */}
        <div style={{ height: 4, background: `linear-gradient(90deg, ${dot}, ${dot}99)` }} />

        <div style={{ padding: '28px 24px 24px' }}>

          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `${dot}14`,
            border: `1px solid ${dot}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            opacity: phase >= 1 ? 1 : 0,
            animation: phase >= 1 ? 'adapt-icon-in 0.4s ease forwards' : 'none',
          }}>
            <svg width="24" height="24" fill="none" stroke={dot} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h2m2 0h2M8 17h2" />
            </svg>
          </div>

          {/* Heading + reason */}
          <div style={{
            opacity: phase >= 1 ? 1 : 0,
            animation: phase >= 1 ? 'adapt-fade 0.3s ease 0.1s both' : 'none',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#111111', letterSpacing: -0.3 }}>
              We updated your plan
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B6B6B', lineHeight: 1.55 }}>
              {reason}
            </p>
          </div>

          {/* Animated session card */}
          {phase >= 2 && (
            <div style={{
              animation: 'adapt-drop 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards',
              marginBottom: 24,
            }}>
              <div style={{
                borderRadius: 12,
                border: `1px solid ${dot}30`,
                background: `linear-gradient(135deg, ${dot}0d 0%, #ffffff 80%)`,
                padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                {/* Color bar */}
                <div style={{ width: 4, height: 44, borderRadius: 2, background: dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: dot, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                    Added to your schedule
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {injectedSession?.courseName ?? 'Review Session'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B6B6B' }}>
                    {injectedSession?.sessionType ?? 'Review'} &middot; {dur} min &middot; {adaptation.dayName}
                  </div>
                </div>
                {/* AI badge */}
                <div style={{
                  flexShrink: 0,
                  fontSize: 10, fontWeight: 700,
                  color: dot, background: `${dot}12`,
                  border: `1px solid ${dot}25`,
                  borderRadius: 6, padding: '3px 8px',
                  letterSpacing: '0.05em',
                }}>
                  AI
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          {phase >= 3 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              animation: 'adapt-fade 0.3s ease forwards',
            }}>
              <button
                onClick={() => { track('adapt_accepted', { courseName: injectedSession?.courseName ?? null, sessionType: injectedSession?.sessionType ?? null }); onAccept() }}
                style={{
                  width: '100%', padding: '12px 0',
                  background: dot, color: '#fff',
                  border: 'none', borderRadius: 11,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: `0 4px 14px ${dot}40`,
                  transition: 'transform 0.1s, box-shadow 0.1s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${dot}55` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${dot}40` }}
              >
                Looks good
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { track('adapt_edited', { courseName: injectedSession?.courseName ?? null }); onEdit(injectedSession) }}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: '#F7F6F3',
                    border: '1px solid rgba(0,0,0,0.09)',
                    borderRadius: 11, fontSize: 13, fontWeight: 600,
                    color: '#4B4B4B', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EFEDE9' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F7F6F3' }}
                >
                  Edit session
                </button>
                <button
                  onClick={() => { track('adapt_dismissed', { courseName: injectedSession?.courseName ?? null }); onDismiss() }}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: 'transparent',
                    border: '1px solid rgba(0,0,0,0.09)',
                    borderRadius: 11, fontSize: 13, fontWeight: 600,
                    color: '#9B9B9B', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'color 0.12s, background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.05)'; e.currentTarget.style.color = '#DC2626' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9B9B' }}
                >
                  Remove it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
