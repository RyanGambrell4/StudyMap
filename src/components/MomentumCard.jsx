import { useMemo } from 'react'
import { computeMomentum, computeMomentumLastWeek, momentumLabel, momentumColor } from '../lib/momentum'
import { track } from '../lib/analytics'

const D = {
  bgCard:  '#FFFFFF',
  border:  'rgba(0,0,0,0.07)',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  green:   '#16A34A',
  amber:   '#D97706',
  red:     '#DC2626',
  blue:    '#3B61C4',
}

function MomentumRing({ score, color, size = 108 }) {
  const stroke = 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`mm-grad-${score}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.75"/>
        </linearGradient>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={stroke}/>
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={`url(#mm-grad-${score})`}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)' }}
      />
      <text x="50%" y="47%" dominantBaseline="middle" textAnchor="middle"
        style={{ fontSize: size * 0.29, fontWeight: 800, fill: D.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </text>
      <text x="50%" y="66%" dominantBaseline="middle" textAnchor="middle"
        style={{ fontSize: 9.5, fontWeight: 700, fill: D.muted, letterSpacing: '0.08em' }}>
        MOMENTUM
      </text>
    </svg>
  )
}

function Bar({ label, value, color }) {
  const pct = Math.max(3, value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: D.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: D.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }}/>
      </div>
    </div>
  )
}

export default function MomentumCard({ completedSessionLog = [], allSessions = [], completedIds, todayStr, onOpenProgress }) {
  const { current, previous } = useMemo(() => ({
    current: computeMomentum({ completedSessionLog, allSessions, completedIds, todayStr }),
    previous: computeMomentumLastWeek({ completedSessionLog, allSessions, completedIds, todayStr }),
  }), [completedSessionLog, allSessions, completedIds, todayStr])

  // Hide if we truly have no signal to compute against.
  if (!completedSessionLog.length && !allSessions.length) return null

  const delta = current.score - previous.score
  const label = momentumLabel(current.score)
  const color = momentumColor(current.score)

  const deltaColor = delta > 0 ? D.green : delta < 0 ? D.red : D.dim
  const deltaIcon = delta > 0
    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-7 7h4v7h6v-7h4z"/></svg>
    : delta < 0
    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 19l7-7h-4V5H9v7H5z"/></svg>
    : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="11" width="14" height="2" rx="1"/></svg>

  const insight = (() => {
    if (current.score >= 80) return 'You are locked in. Protect the streak.'
    if (delta >= 8)          return `Up ${delta} this week. Momentum is building.`
    if (delta <= -8)         return `Down ${Math.abs(delta)} this week. One session today resets it.`
    if (current.consistency < 40) return 'Consistency is the fastest lever. Aim for a session today.'
    if (current.velocity < 40)    return 'Scores are dipping. A short recall drill lifts velocity fast.'
    if (current.completion < 50)  return 'Sessions are getting skipped. Try a smaller block first.'
    return 'Steady week. Small wins compound.'
  })()

  return (
    <div className="mm-card" style={{
      gridColumn: 'span 12',
      background: D.bgCard,
      border: `1px solid ${D.border}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex',
      alignItems: 'center',
      gap: 22,
      flexWrap: 'wrap',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes mm-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .mm-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .mm-btn:hover { transform: translateY(-1px); }
        .mm-btn:active { transform: scale(0.97); }
        .mm-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${color}40; }
        @media (max-width: 480px) {
          .mm-card { gap: 12px !important; padding: 14px 16px !important; }
          .mm-body { min-width: 0 !important; flex: 1 1 100% !important; }
          .mm-cta  { width: 100%; justify-content: center; align-self: stretch !important; }
        }
      `}</style>

      {/* Ring */}
      <div style={{ animation: 'mm-fade 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <MomentumRing score={current.score} color={color}/>
      </div>

      {/* Header + insight */}
      <div className="mm-body" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, animation: 'mm-fade 400ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '80ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color, letterSpacing: '-0.01em' }}>{label}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 700, color: deltaColor,
            background: `${deltaColor}12`, border: `1px solid ${deltaColor}25`,
            padding: '3px 7px', borderRadius: 6, letterSpacing: '-0.005em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {deltaIcon}
            {delta > 0 ? '+' : ''}{delta} vs last week
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, maxWidth: 460 }}>
          {insight}
        </div>

        {/* Component breakdown */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <Bar label="Consistency" value={current.consistency} color={D.blue}/>
          <Bar label="Velocity"    value={current.velocity}    color={D.green}/>
          <Bar label="Completion"  value={current.completion}  color={D.amber}/>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start', flexShrink: 0 }}>
        {onOpenProgress && (
          <button
            className="mm-btn mm-cta"
            onClick={() => { track('momentum_progress_clicked', { score: current.score }); onOpenProgress() }}
            style={{
              minHeight: 40,
              padding: '0 14px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 700, color: '#fff',
              background: color, border: 'none', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: `0 2px 8px ${color}30`,
              letterSpacing: '-0.005em',
            }}
          >
            View progress
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}
