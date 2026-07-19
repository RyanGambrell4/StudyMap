import { useMemo, useState } from 'react'
import { computeWeeklyRecap } from '../lib/weeklyRecap'
import { track } from '../lib/analytics'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  brand:   '#3B61C4',
  brandSoft: 'rgba(59,97,196,0.08)',
  green:   '#16A34A',
  amber:   '#D97706',
  crimson: '#DC2626',
}

function fmtHours(mins) {
  const h = mins / 60
  if (h < 1) return `${mins}m`
  const rounded = Math.round(h * 10) / 10
  return `${rounded}h`
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Stat({ label, value, color = D.text }) {
  return (
    <div className="wr-stat" style={{
      flex: '1 1 90px', minWidth: 0,
      padding: '10px 12px',
      background: '#FAFAF8',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: 12,
      textAlign: 'left',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.01em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

// Determines the "vibe" line — one sentence summing up the week.
function vibeLine({ sessionCount, activeDayCount, deltaMinutes, avgRecall }) {
  if (sessionCount === 0) return null
  if (activeDayCount >= 6) return `Almost every day. That's the sustainable version of hard work.`
  if (activeDayCount >= 4 && deltaMinutes > 30) return `Up ${fmtHours(deltaMinutes)} from the week before. Momentum is compounding.`
  if (activeDayCount >= 4) return `Four+ active days. Consistency is the whole game.`
  if (avgRecall !== null && avgRecall >= 75) return `Fewer sessions, but quality recall. Depth over quantity worked this week.`
  if (deltaMinutes < -30) return `Down ${fmtHours(Math.abs(deltaMinutes))} from the week before. This week is a fresh start.`
  if (activeDayCount <= 2) return `Two days in. A short daily session beats one big weekend push.`
  return `You showed up. Now compound it — one more day this week.`
}

export default function WeeklyRecapCard({ completedSessionLog = [], todayStr, onStartFocus, onOpenProgress, onOpenTeachItBack }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    // Dismissed key is per-week so the card doesn't re-appear after dismissal
    // within the same recap window.
    return sessionStorage.getItem('se_weekly_recap_dismissed') === weekKey(todayStr)
  })

  const recap = useMemo(
    () => computeWeeklyRecap(completedSessionLog, todayStr),
    [completedSessionLog, todayStr],
  )

  if (!recap || dismissed) return null

  const vibe = vibeLine(recap)
  const deltaColor = recap.deltaMinutes > 0 ? D.green : recap.deltaMinutes < 0 ? D.crimson : D.muted
  const deltaLabel = recap.deltaMinutes === 0
    ? '± 0'
    : `${recap.deltaMinutes > 0 ? '+' : ''}${fmtHours(Math.abs(recap.deltaMinutes))}`

  const handleDismiss = () => {
    try { sessionStorage.setItem('se_weekly_recap_dismissed', weekKey(todayStr)) } catch {}
    track('weekly_recap_dismiss', { sessions: recap.sessionCount })
    setDismissed(true)
  }

  return (
    <div className="wr-card" style={{
      gridColumn: 'span 12',
      background: `linear-gradient(135deg, ${D.bg} 0%, ${D.brandSoft} 100%)`,
      border: `1px solid ${D.brand}22`,
      borderLeft: `4px solid ${D.brand}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: `0 2px 8px ${D.brand}0F, 0 1px 3px rgba(0,0,0,0.04)`,
      position: 'relative',
    }}>
      <style>{`
        @keyframes wr-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .wr-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .wr-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px ${D.brand}30; }
        .wr-btn:active { transform: scale(0.97); }
        .wr-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${D.brand}45; }
        .wr-ghost:hover { background: rgba(0,0,0,0.04); }
        .wr-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px ${D.brand}30; }
        .wr-dismiss:hover { background: rgba(0,0,0,0.05); }
        .wr-dismiss:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
        .wr-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        @media (max-width: 640px) {
          .wr-stats { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 480px) {
          .wr-card { padding: 14px 16px !important; }
          .wr-stats { grid-template-columns: repeat(2, 1fr); }
          .wr-head-body { min-width: 0 !important; flex: 1 1 100% !important; }
          .wr-foot { flex-direction: column !important; align-items: stretch !important; }
          .wr-foot .wr-copy { width: 100%; min-width: 0 !important; }
          .wr-foot .wr-cta-group { width: 100%; flex-wrap: wrap; }
          .wr-foot .wr-cta-group > * { flex: 1; justify-content: center; }
        }
      `}</style>

      <div style={{ animation: 'wr-fade 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="wr-head-body" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: D.brand, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Weekly recap · {fmtDateShort(recap.weekStart)} – {fmtDateShort(recap.weekEnd)}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: D.text, letterSpacing: '-0.015em', lineHeight: 1.35 }}>
              {vibe ?? 'Here is your week in one card.'}
            </div>
          </div>
          <button
            className="wr-dismiss"
            onClick={handleDismiss}
            title="Dismiss for this week"
            style={{
              width: 30, height: 30, minHeight: 30,
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

        {/* Stat row */}
        <div className="wr-stats" style={{ marginBottom: 14 }}>
          <Stat label="Sessions" value={recap.sessionCount} />
          <Stat label="Time studied" value={fmtHours(recap.totalMinutes)} />
          <Stat label="Active days" value={`${recap.activeDayCount}/7`} />
          {recap.avgRecall !== null && (
            <Stat label="Avg recall" value={`${recap.avgRecall}%`} color={recap.avgRecall >= 70 ? D.green : recap.avgRecall >= 50 ? D.amber : D.crimson} />
          )}
          <Stat label="vs. prior week" value={deltaLabel} color={deltaColor} />
        </div>

        {/* Top course + CTAs */}
        <div className="wr-foot" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="wr-copy" style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, flex: 1, minWidth: 0 }}>
            {recap.topCourse
              ? <>Most time in <span style={{ color: D.text, fontWeight: 700 }}>{recap.topCourse.name}</span> · {fmtHours(recap.topCourse.minutes)}</>
              : `Every session counted this week.`}
          </div>
          <div className="wr-cta-group" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {recap.avgRecall !== null && recap.avgRecall < 60 && onOpenTeachItBack && (
              <button
                className="wr-ghost"
                onClick={() => { track('weekly_recap_teach_it_back', { avgRecall: recap.avgRecall }); onOpenTeachItBack({}) }}
                style={{
                  minHeight: 40, padding: '0 12px',
                  background: 'rgba(124,58,237,0.07)', color: '#7C3AED',
                  border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10,
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                Teach It Back
              </button>
            )}
            {onOpenProgress && (
              <button
                className="wr-ghost"
                onClick={() => { track('weekly_recap_open_progress'); onOpenProgress() }}
                style={{
                  minHeight: 40, padding: '0 14px',
                  background: 'transparent', color: D.brand,
                  border: `1px solid ${D.brand}30`, borderRadius: 10,
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                  cursor: 'pointer', letterSpacing: '-0.005em',
                  transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                See full progress
              </button>
            )}
            <button
              className="wr-btn"
              onClick={() => { track('weekly_recap_start_focus'); onStartFocus?.() }}
              style={{
                minHeight: 40, padding: '0 16px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: `linear-gradient(135deg, ${D.brand}, #2D4EB3)`,
                color: '#FFFFFF', border: 'none', borderRadius: 10,
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer',
                boxShadow: `0 3px 12px ${D.brand}35`,
                letterSpacing: '-0.005em', whiteSpace: 'nowrap',
              }}
            >
              Start this week
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function weekKey(todayStr) {
  // ISO-week-ish key so dismissing this Monday's recap doesn't hide next Monday's.
  const d = new Date(todayStr + 'T12:00:00')
  const dow = d.getDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - offset)
  return monday.toISOString().slice(0, 10)
}
