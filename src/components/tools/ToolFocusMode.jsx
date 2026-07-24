import { SANS, T } from '../../theme/tokens'

// Full-screen focus mode chrome.
// - Thin top bar: tool + course (left), progress pills / step label (center), End session (right)
// - Children render centered in the body area.
// Used for every active session (Quiz Burst, Topic Drill, Brain Dump, etc.).
export default function ToolFocusMode({
  toolName,
  courseName,
  stepLabel,       // "Question 3 of 5", "0:42 left", etc.
  progressPills,   // { current, total } — renders N pills
  onEnd,
  children,
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${toolName} session`}
      style={{
        position: 'fixed', inset: 0, zIndex: 550,
        background: T.card, fontFamily: SANS,
        display: 'flex', flexDirection: 'column',
        animation: 'fm-in 220ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <style>{`
        @keyframes fm-in { from { opacity: 0 } to { opacity: 1 } }
        .fm-end { transition: color 0.15s }
        .fm-end:hover { color: ${T.text} !important }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', padding: '14px 24px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        {/* Left: tool · course */}
        <div style={{ minWidth: 0, fontSize: 13, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700 }}>{toolName}</span>
          {courseName && (
            <>
              <span style={{ color: T.dim }}>·</span>
              <span style={{ color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {courseName}
              </span>
            </>
          )}
        </div>

        {/* Center: step label + progress pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          {stepLabel && (
            <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{stepLabel}</span>
          )}
          {progressPills && (
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: progressPills.total }).map((_, i) => (
                <span key={i} style={{
                  width: 22, height: 5, borderRadius: 999,
                  background: i < progressPills.current ? T.blue
                    : i === progressPills.current ? T.blue
                    : T.neutralBg,
                  opacity: i === progressPills.current ? 1 : i < progressPills.current ? 1 : 1,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Right: End session */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onEnd}
            className="fm-end"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: T.muted, fontFamily: 'inherit', padding: '4px 8px',
            }}
          >
            End session
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '48px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 720 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
