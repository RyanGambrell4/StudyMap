import { T, SERIF, SANS } from '../../theme/tokens'

// Shared results screen shown at the end of every session.
// - Headline: "X of Y correct" in serif
// - Recall change line: "62% → 66%" with a small progress-bar visual
// - One coach line
// - "Go again" + "Done" buttons (Done → dashboard)
//
// Props:
//   toolName, topicName, courseName
//   score, total                 — headline
//   recallBefore, recallAfter    — numeric % (0-100); pass null to hide the bar
//   coachLine                    — one-line coach message (auto-generated if omitted)
//   onGoAgain, onDone
export default function ToolResultsScreen({
  toolName,
  topicName,
  courseName,
  score,
  total,
  recallBefore,
  recallAfter,
  coachLine,
  onGoAgain,
  onDone,
}) {
  const headline = total != null ? `${score} of ${total} correct` : score

  const hasBar = recallBefore != null && recallAfter != null
  const coach = coachLine ?? defaultCoachLine({ score, total, recallBefore, recallAfter, topicName })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${toolName} results`}
      style={{
        position: 'fixed', inset: 0, zIndex: 560,
        background: T.bg, fontFamily: SANS,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'rs-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <style>{`
        @keyframes rs-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .rs-primary { transition: background 0.15s, transform 0.1s }
        .rs-primary:hover { background: ${T.blueHov} !important }
        .rs-primary:active { transform: scale(0.98) }
        .rs-secondary { transition: border-color 0.15s, transform 0.1s }
        .rs-secondary:hover { border-color: ${T.text} !important; color: ${T.text} !important }
        .rs-secondary:active { transform: scale(0.98) }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 640, background: T.card,
        borderRadius: 20, border: `1px solid ${T.border}`,
        boxShadow: '0 24px 60px rgba(28,27,24,0.10)',
        padding: '40px 48px', textAlign: 'center',
      }}>
        {/* Eyebrow */}
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
          color: T.dim, textTransform: 'uppercase', marginBottom: 22,
        }}>
          {[toolName, topicName].filter(Boolean).join(' · ')}
        </div>

        {/* Headline */}
        <h1 style={{
          margin: 0, fontFamily: SERIF, fontSize: 48, fontWeight: 400,
          color: T.text, letterSpacing: '-0.01em', lineHeight: 1.05,
        }}>
          {headline}
        </h1>

        {/* Recall bar */}
        {hasBar && (
          <div style={{ marginTop: 30 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 13, marginBottom: 6,
            }}>
              <span style={{ color: T.muted }}>{courseName ? `${courseName} recall` : 'Recall'}</span>
              <span style={{ color: T.text }}>
                <span style={{ color: T.muted }}>{recallBefore}%</span>
                <span style={{ margin: '0 6px', color: T.dim }}>→</span>
                <span style={{ fontWeight: 700 }}>{recallAfter}%</span>
              </span>
            </div>
            <RecallBar before={recallBefore} after={recallAfter} />
          </div>
        )}

        {/* Coach line */}
        {coach && (
          <p style={{
            margin: '28px 0 32px', fontSize: 15, color: T.muted, lineHeight: 1.5,
            maxWidth: 460, marginLeft: 'auto', marginRight: 'auto',
          }}>
            {coach}
          </p>
        )}
        {!coach && <div style={{ height: 32 }} />}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            className="rs-primary"
            onClick={onGoAgain}
            style={{
              padding: '12px 28px', borderRadius: 12,
              background: T.blue, color: '#FFFFFF', border: 'none',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.005em',
              boxShadow: '0 6px 18px rgba(52,82,217,0.28)',
            }}
          >
            Go again
          </button>
          <button
            className="rs-secondary"
            onClick={onDone}
            style={{
              padding: '12px 28px', borderRadius: 12,
              background: T.card, color: T.muted,
              border: `1px solid ${T.border}`,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.005em',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function RecallBar({ before, after }) {
  const beforePct = Math.max(0, Math.min(100, before))
  const afterPct = Math.max(0, Math.min(100, after))
  const gained = Math.max(0, afterPct - beforePct)
  return (
    <div style={{
      position: 'relative', height: 10, background: T.neutralBg,
      borderRadius: 999, overflow: 'hidden',
    }}>
      {/* Baseline (before) */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${beforePct}%`, background: '#A0AEE8',
      }} />
      {/* Delta (after - before) */}
      <div style={{
        position: 'absolute', left: `${beforePct}%`, top: 0, bottom: 0,
        width: `${gained}%`, background: T.blue,
      }} />
    </div>
  )
}

function defaultCoachLine({ score, total, recallBefore, recallAfter, topicName }) {
  const pct = total ? Math.round((score / total) * 100) : null
  const label = topicName ? topicName : 'This topic'
  if (recallBefore != null && recallAfter != null) {
    const delta = recallAfter - recallBefore
    if (delta >= 8) return `${label} is clicking. Push it to a Teach It Back next.`
    if (delta > 0) return `${label} is still shaky. One more burst would lock it in.`
    return `${label} needs another pass. Try a Brain Dump to find the gaps.`
  }
  if (pct == null) return null
  if (pct >= 80) return `${label} is clicking. Push it to a Teach It Back next.`
  if (pct >= 60) return `${label} is still shaky. One more burst would lock it in.`
  return `${label} needs another pass. Try a Brain Dump to find the gaps.`
}
