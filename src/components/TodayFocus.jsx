const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const SEP = '#D4D4D4'

export default function TodayFocus({ nextSession, onStartFocus }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
  })()

  const whenLabel = !nextSession ? null
    : nextSession.dateStr === todayStr    ? 'Today'
    : nextSession.dateStr === tomorrowStr ? 'Tomorrow'
    : new Date(nextSession.dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

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

  return (
    <div
      className="no-print"
      style={{ position: 'relative', overflow: 'hidden', background: '#FFFFFF', borderRadius: 16, marginBottom: 24, border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 80% 100% at 0% 50%, ${nextSession.color.dot}14, transparent 70%)` }} />
      <div style={{ position: 'relative', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Up Next · {whenLabel}</span>
            {isFinal && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                {nextSession.sessionType === 'Exam Cram' ? 'Exam Cram' : 'Final Review'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: nextSession.color.dot }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>{nextSession.courseName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED, flexWrap: 'wrap' }}>
            <span>{nextSession.sessionType}</span>
            <span style={{ color: SEP }}>·</span>
            {nextSession.startTime
              ? <span>{nextSession.startTime} - {nextSession.endTime}</span>
              : <span>{nextSession.duration} min</span>
            }
          </div>
        </div>

        <button
          onClick={() => onStartFocus(nextSession)}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px',
            borderRadius: 12, fontWeight: 700, color: '#fff', fontSize: 13.5, cursor: 'pointer',
            border: 'none', fontFamily: 'inherit', backgroundColor: nextSession.color.dot,
            boxShadow: `0 4px 16px ${nextSession.color.dot}40`,
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
