const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const SEP = '#D4D4D4'

export default function StudyNowCard({ nextSession, completedIds, onStartFocus }) {
  if (!nextSession) {
    return (
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 16, padding: '18px 24px', marginBottom: 24 }}>
        <div style={{ color: '#16A34A', flexShrink: 0 }}>
          <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 15 }}>All sessions complete!</p>
          <p style={{ margin: '3px 0 0', fontSize: 13.5, color: MUTED }}>You've finished every scheduled session. Incredible work.</p>
        </div>
      </div>
    )
  }

  const isFinal = nextSession.sessionType === 'Final Review' || nextSession.sessionType === 'Exam Cram'
  const isToday = nextSession.dateStr === new Date().toISOString().split('T')[0]
  const isTomorrow = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1)
    return nextSession.dateStr === t.toISOString().split('T')[0]
  })()
  const whenLabel = isToday ? 'Scheduled today'
    : isTomorrow ? 'Scheduled tomorrow'
    : `Scheduled ${new Date(nextSession.dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`

  return (
    <div
      className="no-print"
      style={{ position: 'relative', overflow: 'hidden', background: '#FFFFFF', borderRadius: 16, padding: '18px 24px', marginBottom: 24, border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 80% 100% at 0% 50%, ${nextSession.color.dot}14, transparent 70%)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isFinal ? 'Priority Session' : 'Ready to get ahead?'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: nextSession.color.dot }} />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>{nextSession.courseName}</h3>
            {isFinal && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                {nextSession.sessionType === 'Exam Cram' ? 'Exam Cram' : 'Final Review'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: MUTED }}>{nextSession.sessionType}</span>
            <span style={{ color: SEP }}>·</span>
            {nextSession.startTime
              ? <span style={{ fontSize: 13, color: MUTED }}>{nextSession.startTime} - {nextSession.endTime}</span>
              : <span style={{ fontSize: 13, color: MUTED }}>{nextSession.duration} min</span>
            }
            <span style={{ color: SEP }}>·</span>
            <span style={{ fontSize: 13, color: DIM }}>{whenLabel}</span>
          </div>
        </div>

        <button
          onClick={() => onStartFocus(nextSession)}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
            borderRadius: 12, fontWeight: 700, color: '#fff', fontSize: 13.5, cursor: 'pointer',
            border: 'none', fontFamily: 'inherit', backgroundColor: nextSession.color.dot,
            boxShadow: `0 4px 20px ${nextSession.color.dot}40`,
          }}
        >
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          Start This Session Now
        </button>
      </div>
    </div>
  )
}
