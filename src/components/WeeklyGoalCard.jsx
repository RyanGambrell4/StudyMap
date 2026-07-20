import { useEffect, useMemo, useState } from 'react'
import { computeWeeklyProgress, getWeeklyGoal, setWeeklyGoal } from '../lib/weeklyGoal'
import { track } from '../lib/analytics'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  border:  'rgba(0,0,0,0.07)',
  brand:   '#3B61C4',
  green:   '#16A34A',
  amber:   '#D97706',
  crimson: '#DC2626',
}

const PRESETS = [3, 5, 8, 12]

function fmtMinutes(min) {
  if (min < 60) return `${min}m`
  const h = min / 60
  const rounded = Math.round(h * 10) / 10
  return `${rounded}h`
}

function dayOfWeekLabel(todayStr) {
  const d = new Date(todayStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function daysRemainingInWeek(todayStr) {
  const d = new Date(todayStr + 'T12:00:00')
  const dow = d.getDay() // 0=Sun
  // Days remaining including today, week ends Sunday.
  return dow === 0 ? 1 : 8 - dow
}

export default function WeeklyGoalCard({ completedSessionLog = [], todayStr, onQuickStart }) {
  const [tick, setTick] = useState(0)
  const goal = useMemo(() => getWeeklyGoal(todayStr), [todayStr, tick])
  const progress = useMemo(
    () => computeWeeklyProgress(completedSessionLog, todayStr),
    [completedSessionLog, todayStr],
  )
  const [editing, setEditing] = useState(false)

  const goalMinutes = goal.hours * 60
  const pct = Math.min(100, Math.round((progress.minutes / goalMinutes) * 100))
  const remainingMin = Math.max(0, goalMinutes - progress.minutes)
  const daysLeft = daysRemainingInWeek(todayStr)
  const paceMinPerDay = daysLeft > 0 ? Math.ceil(remainingMin / daysLeft) : 0

  const state =
    pct >= 100 ? 'crushed'
    : pct >= 70 ? 'ahead'
    : pct >= 40 ? 'ontrack'
    : pct >= 20 ? 'behind'
    : 'atrisk'

  const color =
    state === 'crushed' || state === 'ahead' ? D.green
    : state === 'ontrack' ? D.brand
    : state === 'behind' ? D.amber
    : D.crimson

  const insight = (() => {
    if (state === 'crushed') return `Goal crushed. ${fmtMinutes(progress.minutes - goalMinutes)} above target and the week isn't over.`
    if (state === 'ahead')   return `${pct}% of the way there. Coast is in sight.`
    if (state === 'ontrack') return `Right on pace. ${fmtMinutes(remainingMin)} to go across ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`
    if (state === 'behind')  return `About ${fmtMinutes(paceMinPerDay)}/day to reach ${goal.hours}h this week.`
    return `Behind pace. ${fmtMinutes(paceMinPerDay)} today closes the gap.`
  })()

  useEffect(() => {
    if (!goal.declared) {
      track('weekly_goal_default_shown', { defaultHours: goal.hours })
    }
  }, [goal.declared, goal.hours])

  const handleSet = (h) => {
    setWeeklyGoal(todayStr, h)
    track('weekly_goal_set', { hours: h })
    setEditing(false)
    setTick(t => t + 1)
  }

  return (
    <div className="wg-card" style={{
      gridColumn: 'span 12',
      background: D.bg,
      border: `1px solid ${D.border}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)',
      position: 'relative',
    }}>
      <style>{`
        @keyframes wg-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wg-fill { from { width: 0%; } }
        .wg-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .wg-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px ${color}30; }
        .wg-btn:active { transform: scale(0.97); }
        .wg-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${color}45; }
        .wg-ghost:hover { background: rgba(0,0,0,0.04); }
        .wg-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
        .wg-preset { transition: background 150ms, color 150ms, border-color 150ms; }
        .wg-preset:hover { background: ${color}12; border-color: ${color}55; color: ${color}; }
        .wg-preset:focus-visible { outline: none; box-shadow: 0 0 0 3px ${color}40; }
        @media (max-width: 480px) {
          .wg-card { padding: 14px 16px !important; }
          .wg-head { gap: 8px !important; }
          .wg-cta-row { flex-direction: column !important; align-items: stretch !important; }
          .wg-cta-row > * { width: 100% !important; }
        }
      `}</style>

      <div style={{ animation: 'wg-fade 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Header */}
        <div className="wg-head" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
              Weekly goal · {dayOfWeekLabel(todayStr)}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMinutes(progress.minutes)}</span>
              <span style={{ fontSize: 14, color: D.muted, fontWeight: 600 }}> / {goal.hours}h</span>
            </div>
          </div>
          <button
            className="wg-ghost"
            onClick={() => setEditing(v => !v)}
            style={{
              minHeight: 32, padding: '0 12px',
              background: 'transparent', color: D.muted,
              border: `1px solid ${D.border}`, borderRadius: 8,
              fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', letterSpacing: '-0.005em',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'background 150ms',
            }}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            {editing ? 'Cancel' : 'Change goal'}
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 10, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden', marginBottom: 10, position: 'relative' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 999,
            transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)',
            animation: 'wg-fill 700ms cubic-bezier(0.16,1,0.3,1)',
          }}/>
        </div>

        <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, marginBottom: editing ? 12 : 14, maxWidth: 520 }}>
          {insight}
        </div>

        {/* Editing panel */}
        {editing && (
          <div style={{
            padding: '12px 14px', marginBottom: 12,
            background: '#FAFAF8',
            border: `1px solid ${D.border}`,
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Pick a target for this week
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map(h => (
                <button
                  key={h}
                  className="wg-preset"
                  onClick={() => handleSet(h)}
                  style={{
                    minHeight: 36, padding: '0 14px',
                    background: h === goal.hours ? `${color}18` : '#FFFFFF',
                    color: h === goal.hours ? color : D.text,
                    border: `1px solid ${h === goal.hours ? `${color}55` : D.border}`,
                    borderRadius: 8,
                    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                    cursor: 'pointer', letterSpacing: '-0.005em',
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CTA row */}
        {!editing && pct < 100 && (
          <div className="wg-cta-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="wg-btn"
              onClick={() => { track('weekly_goal_start_click'); onQuickStart?.() }}
              style={{
                minHeight: 40, padding: '0 16px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                color: '#FFFFFF', border: 'none', borderRadius: 10,
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer',
                boxShadow: `0 3px 12px ${color}35`,
                letterSpacing: '-0.005em', whiteSpace: 'nowrap',
              }}
            >
              Start {paceMinPerDay > 0 && paceMinPerDay <= 60 ? `${paceMinPerDay} min` : 'a session'}
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <span style={{ fontSize: 11.5, color: D.dim, fontWeight: 600 }}>
              {progress.sessions} session{progress.sessions !== 1 ? 's' : ''} logged this week
            </span>
          </div>
        )}
        {!editing && pct >= 100 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: `${color}12`, border: `1px solid ${color}30`,
            borderRadius: 10, fontSize: 12.5, fontWeight: 700, color,
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
            Weekly goal cleared. Every session past this is a bonus.
          </div>
        )}
      </div>
    </div>
  )
}
