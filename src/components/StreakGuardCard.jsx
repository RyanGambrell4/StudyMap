import { useEffect, useMemo, useState } from 'react'
import { track } from '../lib/analytics'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  orange:  '#EA580C',
  amber:   '#D97706',
}

function hoursUntilMidnight() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 3600000))
}

// Show only when: streak >= 3, no session completed today, and it's afternoon
// (after 3pm). This is the loss-aversion trigger — early morning is too soon
// to nag someone.
export default function StreakGuardCard({
  streak = 0,
  completedToday = false,
  todaySessions = [],
  freezeCount = 0,
  onUseFreeze,
  onStartFocus,
}) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    const today = new Date().toISOString().slice(0, 10)
    return sessionStorage.getItem(`se_streak_guard_dismissed_${today}`) === '1'
  })
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(t)
  }, [])

  const hoursLeft = useMemo(() => hoursUntilMidnight(), [hour])

  if (dismissed) return null
  if (streak < 3) return null
  if (completedToday) return null
  if (hour < 15) return null // too early to nag

  const isUrgent = hoursLeft <= 4
  const color = isUrgent ? D.orange : D.amber
  const nextSession = (todaySessions ?? []).find(s => s && s.id)

  const handleDismiss = () => {
    const today = new Date().toISOString().slice(0, 10)
    try { sessionStorage.setItem(`se_streak_guard_dismissed_${today}`, '1') } catch {}
    track('streak_guard_dismiss', { streak, hoursLeft })
    setDismissed(true)
  }

  const handleStart = () => {
    track('streak_guard_start', { streak, hoursLeft, hasScheduled: Boolean(nextSession) })
    onStartFocus?.(nextSession ?? undefined)
  }

  return (
    <div style={{
      gridColumn: 'span 12',
      background: `linear-gradient(135deg, ${D.bg} 0%, ${color}0D 100%)`,
      border: `1px solid ${color}30`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: `0 2px 8px ${color}12, 0 1px 3px rgba(0,0,0,0.04)`,
      display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
      position: 'relative',
    }}>
      <style>{`
        @keyframes sg-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sg-flame { 0%,100% { transform: scale(1) rotate(-2deg); } 50% { transform: scale(1.06) rotate(2deg); } }
        .sg-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .sg-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px ${color}35; }
        .sg-btn:active { transform: scale(0.97); }
        .sg-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${color}45; }
        .sg-ghost:hover { background: rgba(0,0,0,0.05); }
        .sg-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px ${color}30; }
        .sg-dismiss:hover { background: rgba(0,0,0,0.05); }
        .sg-dismiss:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
      `}</style>

      <div style={{ animation: 'sg-fade 400ms cubic-bezier(0.16,1,0.3,1) both', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
        {/* Flame icon with streak number */}
        <div style={{
          flexShrink: 0,
          minWidth: 62, minHeight: 62,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 14px ${color}45`,
          padding: '6px 10px',
          position: 'relative',
        }}>
          <div style={{ animation: 'sg-flame 2.2s ease-in-out infinite', fontSize: 22, lineHeight: 1 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', marginTop: 2, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
            {streak}
          </div>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isUrgent ? 'Streak at risk' : 'Streak guard'}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: D.text, letterSpacing: '-0.015em', lineHeight: 1.35, marginBottom: 4 }}>
            {isUrgent
              ? `Your ${streak}-day streak ends in ${hoursLeft}h.`
              : `Protect your ${streak}-day streak.`}
          </div>
          <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, maxWidth: 480 }}>
            {isUrgent
              ? `A 10-minute recall session keeps it alive. You've come too far to reset now.`
              : `${hoursLeft}h until midnight. Any session — even 10 minutes — locks in the day.`}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center', alignItems: 'center' }}>
          {freezeCount > 0 && (
            <button
              className="sg-ghost"
              onClick={() => { track('streak_guard_freeze', { streak, freezeCount }); onUseFreeze?.() }}
              style={{
                minHeight: 40, padding: '0 12px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'transparent', color: D.muted,
                border: `1px solid rgba(0,0,0,0.09)`, borderRadius: 10,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)',
              }}
              title={`Use a freeze (${freezeCount} left)`}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/>
              </svg>
              Freeze · {freezeCount}
            </button>
          )}
          <button
            className="sg-btn"
            onClick={handleStart}
            style={{
              minHeight: 42, padding: '0 16px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `linear-gradient(135deg, ${color}, ${color}dd)`,
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: `0 3px 12px ${color}40`,
              letterSpacing: '-0.005em', whiteSpace: 'nowrap',
            }}
          >
            {isUrgent ? 'Protect it now' : 'Start 10-min session'}
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button
            className="sg-dismiss"
            onClick={handleDismiss}
            title="Hide until tomorrow"
            style={{
              width: 32, height: 32, minHeight: 32,
              background: 'transparent', border: 'none', borderRadius: 8,
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              color: D.dim,
              transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)',
            }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
