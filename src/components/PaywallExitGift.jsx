import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

/**
 * PaywallExitGift — the intercept that fires when a free user closes the
 * paywall for the first time. Three sequential views inside one modal:
 *
 *   1. GIFT      — "wait, here are 5 free AI actions on us"
 *   2. RATING    — 5 stars. 4-5★ opens the public review URL, 1-3★ opens
 *                  the in-app feedback modal (existing).
 *   3. THANKS    — brief acknowledgement, then closes
 *
 * The parent (PaywallModal) owns the "should this show?" decision — this
 * component just runs the flow when mounted with `open`.
 *
 * Public review URL: `VITE_REVIEW_URL` env var. Falls back to the App Store
 * write-review link once the numeric ID is set. If neither works we still
 * record the rating and route to the thanks screen.
 */

const ACCENT   = '#E8531A'
const TEXT     = '#111111'
const MUTED    = '#6B6B6B'
const BORDER   = '#E5E5E5'
const BG_CARD  = '#FFFFFF'

const REVIEW_URL = import.meta.env?.VITE_REVIEW_URL
  || 'https://apps.apple.com/app/studyedge-ai/id6737843050?action=write-review'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

export default function PaywallExitGift({ open, trigger, onDismiss }) {
  const [view, setView]           = useState('gift')  // 'gift' | 'rating' | 'thanks'
  const [claiming, setClaiming]   = useState(false)
  const [claimError, setClaimError] = useState(null)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [selectedStar, setSelectedStar] = useState(0)
  const openedAtRef = useRef(null)

  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now()
      setView('gift')
      setClaimError(null)
      setSelectedStar(0)
      setHoveredStar(0)
      track('paywall_exit_gift_opened', { trigger: trigger ?? null })
    }
  }, [open, trigger])

  const claim = useCallback(async () => {
    if (claiming) return
    setClaiming(true)
    setClaimError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/claim-paywall-exit-gift', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409 already_claimed is not an error from the user's perspective —
        // skip forward to the rating step so we still get the review ask.
        if (data.code === 'already_claimed' || data.code === 'not_free') {
          track('paywall_exit_gift_skipped', { reason: data.code })
          setView('rating')
          setClaiming(false)
          return
        }
        setClaimError(data.error || 'Could not claim right now.')
        track('paywall_exit_gift_claim_failed', { reason: data.error ?? 'unknown' })
        setClaiming(false)
        return
      }
      track('paywall_exit_gift_claimed', { granted: data.granted ?? null })
      setView('rating')
      setClaiming(false)
    } catch (err) {
      console.error('[PaywallExitGift] claim error:', err)
      setClaimError('Network error. Please try again.')
      track('paywall_exit_gift_claim_failed', { reason: 'network' })
      setClaiming(false)
    }
  }, [claiming])

  const submitRating = useCallback(async (stars) => {
    setSelectedStar(stars)
    track('app_rating_star_selected', { stars, source: 'paywall_exit' })
    try {
      const headers = await authHeaders()
      // Fire-and-forget: the client experience should not wait on this write.
      fetch('/api/rate-app', {
        method: 'POST',
        headers,
        body: JSON.stringify({ stars, source: 'paywall_exit' }),
      }).catch(e => console.error('[PaywallExitGift] rating post failed:', e))
    } catch (err) {
      console.error('[PaywallExitGift] rating error:', err)
    }

    // Route based on rating: high ratings → public review, low ratings →
    // in-app feedback. This is the classic "rating gate" pattern and keeps
    // bad experiences out of the App Store review pile.
    if (stars >= 4) {
      try { window.open(REVIEW_URL, '_blank', 'noopener,noreferrer') } catch { /* popup blocked */ }
      setView('thanks')
    } else {
      // Dispatch to the existing FeedbackModal — same one that mounted in App.jsx.
      window.dispatchEvent(new CustomEvent('studyedge:open-feedback'))
      // Close this modal so the feedback modal has the screen.
      onDismiss?.()
    }
  }, [onDismiss])

  const done = useCallback(() => {
    const ms = openedAtRef.current ? Date.now() - openedAtRef.current : null
    track('paywall_exit_gift_closed', { view_at_close: view, ms_open: ms })
    onDismiss?.()
  }, [view, onDismiss])

  if (!open) return null

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.55)',
        zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: 440, background: BG_CARD, borderRadius: 20,
          border: `1px solid ${BORDER}`, boxShadow: '0 24px 64px rgba(0,0,0,0.20)',
          padding: 28, textAlign: 'center', position: 'relative',
        }}
      >
        {/* Close X */}
        <button
          onClick={done}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14, width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: '#9B9B9B', cursor: 'pointer',
            borderRadius: 8,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {view === 'gift' && (
          <>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#FFF6F0',
              border: `2px dashed ${ACCENT}`, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 14,
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
            </div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: ACCENT, textTransform: 'uppercase' }}>
              Before you go
            </p>
            <h2 style={{ margin: '6px 0 10px', fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: '-0.4px', lineHeight: 1.3 }}>
              Here are <span style={{ color: ACCENT }}>5 free AI actions</span> on us.
            </h2>
            <p style={{ margin: '0 0 10px', fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
              No card required. Five more study sessions to try blueprints, cheat sheets, and flashcards.
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: MUTED, lineHeight: 1.55, background: '#FFF6F0', border: `1px solid ${ACCENT}25`, borderRadius: 10, padding: '10px 14px' }}>
              Or skip the gift and start a <strong style={{ color: ACCENT }}>3-day free trial</strong>. $0 today, $2.99/wk after. Unlimited sessions, 5 courses, 100 AI actions/month. Cancel anytime.
            </p>
            {claimError && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#DC2626' }}>{claimError}</p>
            )}
            <button
              onClick={claim}
              disabled={claiming}
              style={{
                width: '100%', background: ACCENT, color: '#fff', border: 'none',
                borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700,
                cursor: claiming ? 'default' : 'pointer', marginBottom: 8,
              }}
            >
              {claiming ? 'Claiming…' : 'Claim my 5 free actions'}
            </button>
            <button
              onClick={done}
              style={{
                background: 'none', border: 'none', color: '#9B9B9B',
                fontSize: 12, cursor: 'pointer', padding: '6px',
              }}
            >
              No thanks
            </button>
          </>
        )}

        {view === 'rating' && (
          <>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#F0FDF4',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#22C55E', textTransform: 'uppercase' }}>
              Claimed · 5 actions added
            </p>
            <h2 style={{ margin: '6px 0 10px', fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '-0.3px', lineHeight: 1.35 }}>
              How would you rate StudyEdge so far?
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              One tap. It genuinely helps us know what to build next.
            </p>
            <div
              onMouseLeave={() => setHoveredStar(0)}
              style={{ display: 'inline-flex', gap: 6, marginBottom: 20 }}
            >
              {[1, 2, 3, 4, 5].map(n => {
                const filled = (hoveredStar || selectedStar) >= n
                return (
                  <button
                    key={n}
                    onClick={() => submitRating(n)}
                    onMouseEnter={() => setHoveredStar(n)}
                    aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 4, transition: 'transform 0.08s',
                      transform: hoveredStar === n ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    <svg width="34" height="34" viewBox="0 0 24 24"
                      fill={filled ? '#FBBF24' : 'none'}
                      stroke={filled ? '#FBBF24' : '#D4D4D4'}
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                )
              })}
            </div>
            <div>
              <button
                onClick={done}
                style={{
                  background: 'none', border: 'none', color: '#9B9B9B',
                  fontSize: 12, cursor: 'pointer', padding: '6px',
                }}
              >
                Skip
              </button>
            </div>
          </>
        )}

        {view === 'thanks' && (
          <>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#F0FDF4',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }} aria-hidden>
              <svg width="30" height="30" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ margin: '6px 0 10px', fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '-0.3px', lineHeight: 1.35 }}>
              Thanks. That helps a lot.
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
              A quick review on the App Store makes a real difference for a small team like ours. Opened it in a new tab.
            </p>
            <button
              onClick={done}
              style={{
                width: '100%', background: '#3B61C4', color: '#fff', border: 'none',
                borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
