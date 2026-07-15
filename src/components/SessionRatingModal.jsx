import { useState } from 'react'
import { getActivePlan, hasUsedTrial } from '../lib/subscription'

const D = {
  bg:     '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text:   '#111111',
  muted:  '#6B6B6B',
  dim:    '#9B9B9B',
  accent: '#3B61C4',
}

/**
 * SessionRatingModal
 * Slides up from the bottom after a session is marked complete.
 * Props:
 *   session     - { id, courseName, sessionType, courseId }
 *   onSave(rating, hardNotes) - called with rating (1-5) and optional struggle text
 *   onSkip()    - dismissed without rating
 */
export default function SessionRatingModal({ session, onSave, onSkip, onShowPaywall }) {
  const [rating, setRating] = useState(null)
  const [hardNotes, setHardNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const isFree = getActivePlan() === 'free'
  const trialUsed = hasUsedTrial()

  const handleSave = async () => {
    if (!rating) return
    setSaving(true)
    await onSave(rating, hardNotes.trim())
    setSaving(false)
  }

  const dot = session?.color?.dot ?? D.accent

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onSkip}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          padding: '16px 24px 40px',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.14)',
          border: '1px solid rgba(0,0,0,0.07)',
          animation: 'ratingSlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <style>{`
          @keyframes ratingSlideUp {
            from { transform: translateY(60px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)', margin: '0 auto 20px' }} />

        {/* Session chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: D.text }}>{session?.courseName}</span>
          {session?.sessionType && (
            <>
              <span style={{ color: D.dim, fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12.5, color: D.muted, fontWeight: 500 }}>{session.sessionType}</span>
            </>
          )}
          <div style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#16A34A',
            background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)',
            padding: '3px 9px', borderRadius: 999,
          }}>
            Session complete ✓
          </div>
        </div>

        {/* Rating label */}
        <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 4 }}>How was this session?</div>
        <div style={{ fontSize: 13, color: D.muted, marginBottom: 16 }}>Tap to rate · your plan adjusts automatically</div>

        {/* 5-dot rating */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map(n => {
            const labels = ['Rough', 'Hard', 'Okay', 'Good', 'Great']
            const colors = ['#DC2626', '#E8531A', '#D97706', '#2563EB', '#16A34A']
            const active = rating === n
            const color  = active ? colors[n - 1] : 'rgba(0,0,0,0.12)'
            return (
              <button
                key={n}
                onClick={() => setRating(n)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: 'pointer', background: 'none', border: 'none', padding: 0,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: active ? `${colors[n-1]}18` : 'rgba(0,0,0,0.03)',
                  border: `2.5px solid ${color}`,
                  transition: 'all 0.15s',
                  transform: active ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: active ? `0 4px 14px ${colors[n-1]}30` : 'none',
                }} />
                <span style={{
                  fontSize: 10.5, fontWeight: active ? 700 : 500,
                  color: active ? colors[n - 1] : D.dim,
                  transition: 'color 0.15s',
                }}>
                  {labels[n - 1]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Struggle text */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
            What was hard? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </label>
          <textarea
            value={hardNotes}
            onChange={e => setHardNotes(e.target.value)}
            placeholder="e.g. Couldn't remember reaction mechanisms, confusing slide 14..."
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#FAFAFA', border: '1px solid rgba(0,0,0,0.10)',
              borderRadius: 12, padding: '11px 14px',
              fontSize: 13.5, color: D.text, resize: 'none',
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(59,97,196,0.4)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={!rating || saving}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              background: rating ? '#3B61C4' : 'rgba(0,0,0,0.06)',
              color: rating ? '#fff' : D.dim,
              fontSize: 14.5, fontWeight: 700,
              cursor: rating ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onSkip}
            style={{ padding: '14px 18px', borderRadius: 12, border: 'none', background: 'transparent', color: D.dim, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}
          >
            Skip
          </button>
        </div>

        {isFree && (
          <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(59,97,196,0.05)', borderRadius: 12, border: '1px solid rgba(59,97,196,0.12)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12.5, color: D.muted, lineHeight: 1.5 }}>
              Keep the momentum going. Pro unlocks unlimited AI tutoring, brain dumps, cheat sheets, and more.
            </p>
            <button
              onClick={() => onShowPaywall?.('study-hacks')}
              style={{ fontSize: 13, fontWeight: 700, color: D.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {trialUsed ? 'Upgrade to Pro →' : 'Start 7-day free trial →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
