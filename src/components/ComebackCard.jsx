import { useMemo } from 'react'
import { clean } from '../utils/strings'
import { getWeakestTopics } from '../lib/masteryStore'
import { track } from '../lib/analytics'

const D = {
  text:  '#111111',
  muted: '#6B6B6B',
  dim:   '#9B9B9B',
  green: '#16A34A',
  border: 'rgba(0,0,0,0.07)',
}

// Warm re-entry card. Shown when the student has been away 3+ days.
// Deliberately guilt-free copy and a smaller session ask.
export default function ComebackCard({ daysAway, lastSessionDate, courses, onStartFocus, onOpenBrainDump, todaySessions = [] }) {
  const easiestTopic = useMemo(() => {
    // Prefer a topic they were doing well on — a confidence win.
    const weakest = getWeakestTopics(null, 20)
    return weakest.length > 0 ? weakest[weakest.length - 1] : null
  }, [])

  const primaryCourse = courses?.[0]

  const message = daysAway >= 10
    ? "It's been a while — that's okay. Getting back is the whole battle."
    : daysAway >= 7
    ? "A week off. No guilt — let's just start with something small."
    : "Life happens. Nothing lost. One small session and you're rolling again."

  const primary = todaySessions.length > 0
    ? { label: `Start ${todaySessions[0].sessionType ?? 'today\'s session'}`, action: () => onStartFocus?.(todaySessions[0]) }
    : { label: '15-min recall on your best topic', action: () => { track('comeback_micro_start'); onOpenBrainDump?.() } }

  return (
    <div className="cb-card" style={{
      gridColumn: 'span 12',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%)',
      border: '1px solid rgba(22,163,74,0.2)',
      borderLeft: '4px solid #16A34A',
      borderRadius: 16,
      padding: '20px 24px',
      boxShadow: '0 4px 16px rgba(22,163,74,0.08), 0 1px 3px rgba(0,0,0,0.04)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes cb-drift {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(-20%, -20%) rotate(360deg); }
        }
        @keyframes cb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .cb-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .cb-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(22,163,74,0.35); }
        .cb-btn:active { transform: scale(0.97); }
        .cb-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(22,163,74,0.4); }
        .cb-ghost:hover { background: rgba(22,163,74,0.06); }
        .cb-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(22,163,74,0.3); }
        @media (max-width: 480px) {
          .cb-card { padding: 16px 16px !important; }
          .cb-row  { gap: 12px !important; }
          .cb-body { min-width: 0 !important; flex: 1 1 100% !important; }
          .cb-actions { flex-direction: row !important; width: 100%; flex-wrap: wrap; }
          .cb-actions > * { flex: 1 1 100%; }
        }
      `}</style>

      {/* Ambient wash */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, right: 0, width: 240, height: 240,
        background: 'radial-gradient(circle at 30% 30%, rgba(22,163,74,0.10), transparent 65%)',
        pointerEvents: 'none',
        animation: 'cb-drift 40s linear infinite',
      }}/>

      <div className="cb-row" style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', animation: 'cb-fade 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #16A34A, #15803D)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          boxShadow: '0 6px 18px rgba(22,163,74,0.35)',
        }}>
          <svg width="28" height="28" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M20 12a8 8 0 10-3.5 6.6"/>
            <polyline points="20 4 20 12 12 12"/>
          </svg>
        </div>

        {/* Text */}
        <div className="cb-body" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#15803D', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Welcome back
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {daysAway} days is nothing. Let's ease back in.
          </h3>
          <p style={{ margin: 0, fontSize: 13.5, color: D.muted, lineHeight: 1.55, maxWidth: 520 }}>
            {message}
          </p>

          {(primaryCourse || easiestTopic) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {primaryCourse && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D', background: 'rgba(22,163,74,0.1)', padding: '3px 9px', borderRadius: 6 }}>
                  {clean(primaryCourse.name)}
                </span>
              )}
              {easiestTopic && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D', background: 'rgba(22,163,74,0.1)', padding: '3px 9px', borderRadius: 6 }}>
                  Start with: {easiestTopic.topic}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="cb-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignItems: 'stretch' }}>
          <button
            className="cb-btn"
            onClick={() => { track('comeback_primary_cta', { daysAway }); primary.action() }}
            style={{
              minHeight: 48,
              padding: '0 20px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'linear-gradient(135deg, #16A34A, #15803D)',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(22,163,74,0.35)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            {primary.label}
          </button>
          <button
            className="cb-btn cb-ghost"
            onClick={() => { track('comeback_secondary_skip'); onOpenBrainDump?.() }}
            style={{
              minHeight: 36,
              padding: '0 14px',
              background: 'transparent',
              color: '#15803D', border: '1px solid rgba(22,163,74,0.3)',
              borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Just 5-minute recall
          </button>
        </div>
      </div>
    </div>
  )
}
