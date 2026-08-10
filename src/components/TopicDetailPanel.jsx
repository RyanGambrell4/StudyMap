/**
 * TopicDetailPanel - the right-hand drawer on the Knowledge Map.
 *
 * Matches design/knowledge-map/"8 Topic Detail.dc.html": status word and
 * recorded-event count, an optional sparkline, the evidence trail newest
 * first, and one primary action.
 *
 * The evidence trail is the whole point of the panel: it is the receipt for
 * the status word at the top. Every row names a real recorded event and the
 * day it happened, and shows a score only where one exists.
 */

import { useEffect } from 'react'
import { KNOWLEDGE_MAP as C, KM_SERIF } from '../theme/tokens'
import { formatAge, sparklinePoints, SPARKLINE_MIN_POINTS } from '../utils/knowledgeMap'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

const EYEBROW = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: C.secondary,
}

const STATUS_WORD = { solid: 'Solid', shaky: 'Shaky', untested: 'Untested' }
const STATUS_COLOR = { solid: C.solid, shaky: C.shaky, untested: C.untested }

/** Absolute day for the evidence trail: "Today" for today, "Jul 28" beyond. */
function trailDate(at, now) {
  if (at == null) return 'Date not recorded'
  const age = formatAge(at, now)
  if (age === 'today') return 'Today'
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** The muted context line under a source name, built only from what the row
 *  actually carries. No filler when there is nothing to say. */
function trailDetail(event, now) {
  const parts = [trailDate(event.at, now)]
  if (event.questionCount) {
    parts.push(`${event.questionCount} ${event.questionCount === 1 ? 'question' : 'questions'}`)
  }
  if (event.score === null) parts.push('recorded, not scored')
  if (event.detail) parts.push(event.detail)
  return parts.join(', ')
}

/**
 * A 180x46 line with a dot per scored event, no axes and no decoration.
 * Only drawn at three or more scored events, because two points is a line
 * segment, not a trend.
 */
function Sparkline({ points }) {
  const W = 180
  const H = 46
  const PAD = 6
  const scores = points.map(p => p.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min || 1

  const xy = points.map((p, i) => {
    const x = PAD + (i * (W - PAD * 2)) / (points.length - 1)
    const y = PAD + (1 - (p.score - min) / span) * (H - PAD * 2)
    return { x: Math.round(x), y: Math.round(y) }
  })

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true">
      <polyline
        points={xy.map(p => `${p.x},${p.y}`).join(' ')}
        stroke={C.hollow} strokeWidth="1.5" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {xy.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y}
          r={i === xy.length - 1 ? 3.5 : 3}
          fill={i === xy.length - 1 ? C.ink : C.hollow}
        />
      ))}
    </svg>
  )
}

// `now` is supplied by the map, captured when evidence loaded, so the trail
// dates here and the evidence lines on the rows behind the panel agree.
export default function TopicDetailPanel({ entry, now, mobile, onClose, onStartDump, onUploadNotes }) {
  const { derived } = entry
  const { status, stale, events, scoredCount, eventCount } = derived
  const points = sparklinePoints(derived)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: C.scrim, zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label={`${entry.topic} evidence`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: mobile ? '100%' : 480, maxWidth: '100%',
          background: C.card, borderLeft: `1px solid ${C.cardBorder}`,
          boxShadow: C.panelShadow, zIndex: 61,
          padding: mobile ? '24px 20px 28px' : '40px 40px 44px',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ minWidth: 0 }}>
            {entry.courseName && <div style={EYEBROW}>{entry.courseName}</div>}
            <div style={{
              fontFamily: KM_SERIF, fontSize: mobile ? 26 : 30, fontWeight: 500,
              lineHeight: 1.2, margin: '10px 0 0', color: C.ink,
            }}>
              {entry.topic}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 0', flexWrap: 'wrap' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flex: 'none',
                ...(status === 'untested' || stale
                  ? { border: `1.5px solid ${status === 'untested' ? C.hollow : STATUS_COLOR[status]}` }
                  : { background: STATUS_COLOR[status] }),
              }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: STATUS_COLOR[status] }}>
                {STATUS_WORD[status]}
              </span>
              <span style={{ fontSize: 14, color: C.secondary }}>
                , {eventCount} recorded {eventCount === 1 ? 'event' : 'events'}
                {stale ? ', last one a while ago' : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              ...btnReset,
              width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.cardBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1l-9 9" stroke={C.secondary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {points && (
          <div style={{ margin: '26px 0 0', display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <Sparkline points={points} />
            <div style={{ fontSize: 13, color: C.secondary, paddingBottom: 4 }}>
              {points[0].score} to {points[points.length - 1].score} across {points.length} scored events
            </div>
          </div>
        )}

        <div style={{ height: 1, background: C.rowRule, margin: '24px 0 0' }} />
        <div style={{ ...EYEBROW, margin: '22px 0 0' }}>Evidence trail</div>

        {events.length === 0 ? (
          <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.6, color: C.secondary }}>
            Nothing recorded for this topic yet. A Brain Dump is the fastest way to put something here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', margin: '6px 0 0' }}>
            {events.map((event, i) => (
              <div
                key={`${event.signalType}-${event.at ?? i}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 20, padding: '16px 0', borderBottom: `1px solid ${C.rowRule}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{event.source}</div>
                  <div style={{ fontSize: 13, color: C.secondary, marginTop: 3 }}>{trailDetail(event, now)}</div>
                </div>
                {typeof event.score === 'number' && (
                  <div style={{ fontFamily: KM_SERIF, fontSize: 26, fontWeight: 500, lineHeight: 1, color: C.ink, flex: 'none' }}>
                    {event.score}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {scoredCount > 0 && scoredCount < SPARKLINE_MIN_POINTS && (
          <p style={{ margin: '16px 0 0', fontSize: 13, color: C.stale }}>
            {SPARKLINE_MIN_POINTS - scoredCount} more scored {SPARKLINE_MIN_POINTS - scoredCount === 1 ? 'event' : 'events'} and this topic gets a trend line.
          </p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 32 }}>
          <button
            type="button"
            onClick={onStartDump}
            style={{
              ...btnReset,
              display: 'block', width: '100%',
              background: C.blue, color: '#fff', fontSize: 14, fontWeight: 600,
              padding: '13px 22px', borderRadius: 10, textAlign: 'center',
            }}
          >
            Brain Dump this topic
          </button>
          {onUploadNotes && entry.courseId != null && (
            <button
              type="button"
              onClick={() => onUploadNotes(entry.courseId)}
              style={{ ...btnReset, display: 'block', width: '100%', margin: '14px 0 0', fontSize: 13, color: C.secondary, textAlign: 'center' }}
            >
              Upload notes for {entry.courseName}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
