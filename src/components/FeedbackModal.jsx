import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

// Design tokens — kept in sync with AppShell / PaywallModal so the modal
// looks native to the rest of the app.
const ACCENT   = '#3B61C4'
const TEXT     = '#111111'
const MUTED    = '#6B6B6B'
const BORDER   = '#E5E5E5'
const BG_CARD  = '#FFFFFF'
const BG_INPUT = '#FAFAF8'

const MAX_LEN = 4000

/**
 * FeedbackModal — the "Send feedback" surface. Opened via the ⚙︎ settings
 * menu (or programmatically via window.dispatchEvent('studyedge:open-feedback')).
 *
 * Contract with the parent: `open` controls visibility, `onClose` is called
 * on backdrop click, Escape, or the Cancel button. Everything else — auth,
 * submit, success state — lives here.
 */
export default function FeedbackModal({ open, onClose }) {
  const [message, setMessage]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus]       = useState(null) // 'success' | 'error' | null
  const [errorMsg, setErrorMsg]   = useState('')
  const textareaRef               = useRef(null)

  // Focus the textarea on open so the user can just type.
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 60)
      track('feedback_modal_opened')
    }
  }, [open])

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  // Reset state whenever the modal reopens fresh.
  useEffect(() => {
    if (!open) {
      // Delay slightly so the close animation doesn't flash a reset state.
      const t = setTimeout(() => {
        setMessage('')
        setStatus(null)
        setErrorMsg('')
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_LEN) {
      setStatus('error')
      setErrorMsg(`Please keep it under ${MAX_LEN.toLocaleString()} characters.`)
      return
    }
    setSubmitting(true)
    setStatus(null)
    setErrorMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setStatus('error')
        setErrorMsg('You need to be signed in to send feedback.')
        setSubmitting(false)
        return
      }

      const route = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : null

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          route,
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : null,
          },
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setStatus('error')
        setErrorMsg(j.error || 'Could not send feedback. Please try again.')
        track('feedback_submit_failed', { reason: j.error ?? `http_${res.status}` })
        setSubmitting(false)
        return
      }

      setStatus('success')
      track('feedback_submitted', { length: trimmed.length })
      setSubmitting(false)
    } catch (err) {
      console.error('[feedback] submit error:', err)
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
      track('feedback_submit_failed', { reason: 'network_error' })
      setSubmitting(false)
    }
  }, [message])

  if (!open) return null

  const charsLeft = MAX_LEN - message.length
  const overLimit = charsLeft < 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.5)',
        zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '48px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        style={{
          width: '100%', maxWidth: 480, background: BG_CARD, borderRadius: 16,
          border: `1px solid ${BORDER}`, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          padding: 24,
        }}
      >
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '12px 4px 4px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: '#F0FDF4',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <svg width="24" height="24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 id="feedback-title" style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: '-0.3px' }}>
              Feedback sent. Thank you.
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: MUTED, lineHeight: 1.55 }}>
              I read every submission personally. If it's something I can fix, I'll get on it.
            </p>
            <button
              onClick={onClose}
              style={{
                background: ACCENT, color: '#fff', border: 'none', borderRadius: 10,
                padding: '10px 26px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <h2 id="feedback-title" style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: '-0.3px' }}>
                  Send feedback
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.55 }}>
                  What's confusing, broken, or missing? Every submission goes straight to Ryan.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', color: MUTED, cursor: 'pointer', borderRadius: 8,
                  flexShrink: 0, marginLeft: 8,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="One thing that would make StudyEdge better…"
              disabled={submitting}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 16, padding: '12px 14px',
                fontFamily: 'inherit', fontSize: 14, lineHeight: 1.55, color: TEXT,
                background: BG_INPUT, border: `1px solid ${overLimit ? '#DC2626' : BORDER}`, borderRadius: 10,
                resize: 'vertical', minHeight: 120, outline: 'none',
              }}
              onFocus={e => e.currentTarget.style.borderColor = overLimit ? '#DC2626' : ACCENT}
              onBlur={e  => e.currentTarget.style.borderColor = overLimit ? '#DC2626' : BORDER}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: overLimit ? '#DC2626' : MUTED }}>
              <span>{overLimit ? `Over limit by ${(-charsLeft).toLocaleString()}` : `${charsLeft.toLocaleString()} left`}</span>
              {status === 'error' && (
                <span style={{ color: '#DC2626', fontWeight: 500 }}>{errorMsg}</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={onClose}
                disabled={submitting}
                style={{
                  background: 'none', color: MUTED, border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 500,
                  cursor: submitting ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !message.trim() || overLimit}
                style={{
                  background: (submitting || !message.trim() || overLimit) ? '#B7C7EA' : ACCENT,
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '10px 22px', fontSize: 13, fontWeight: 600,
                  cursor: (submitting || !message.trim() || overLimit) ? 'default' : 'pointer',
                  minWidth: 96,
                }}
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
