/**
 * StudyCoachPlanView - the Study Coach plan screen.
 *
 * Rebuilt to match the approved design export in design/study-coach/ (canvas
 * turn 3: 3a fresh, 3b mid-plan pushed, 3c behind, 3d complete, 3e mobile).
 * Where this file and the export disagree, the export is right.
 *
 * Every number on this screen comes from computePlanMath over the stored plan,
 * and every number appears exactly once. The component holds no plan state of
 * its own: completion, catch-up and pushed status all live in the stored plan,
 * which is what keeps this screen, the Schedule page and the calendar blocks
 * from drifting apart.
 */

import { useState, useEffect, useMemo } from 'react'
import { STUDY_COACH as C, SC_SERIF, SANS, courseColor } from '../theme/tokens'
import {
  computePlanMath, progressSegments, formatHours,
  flattenSessions, nextSession, parseISO,
} from '../../lib/shared/coachPlan.js'

// The mobile artboard (3e) restructures rather than reflows: header actions
// collapse into the overflow, the hero button goes full width, rows drop to two
// lines and Push moves below the plan. Different tree, so the breakpoint is JS.
function useIsMobile(bp = 760) {
  const query = `(max-width:${bp}px)`
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const onChange = e => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const shortDate = (iso) => {
  const d = parseISO(iso)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

// ── Progress bar ─────────────────────────────────────────────────────────────

const SEGMENT_COLOR = {
  done: C.done,
  behind: C.behind,
  stillScheduled: C.stillScheduled,
  remaining: C.stillScheduled,
}

function ProgressBar({ math, mobile }) {
  const segs = progressSegments(math)
  const h = mobile ? 8 : 10
  const single = segs.length === 1

  // Legend counts appear only where they appear nowhere else on the page:
  // "Behind 3" in the behind state, "Done 12 of 12" when complete.
  const legend = math.complete
    ? [{ key: 'done', label: 'Done', count: `${math.done} of ${math.total}` }]
    : math.isBehind
      ? [
          { key: 'done', label: 'Done' },
          { key: 'behind', label: 'Behind', count: String(math.behind) },
          { key: 'stillScheduled', label: 'Still scheduled' },
        ]
      : [
          { key: 'done', label: 'Done' },
          { key: 'remaining', label: 'Remaining' },
        ]

  return (
    <div style={{ marginTop: mobile ? 20 : (math.isBehind ? 24 : 26), maxWidth: mobile ? '100%' : 720 }}>
      <div style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', gap: single ? 0 : 2 }}>
        {segs.map(s => (
          <div
            key={s.key}
            style={{
              width: `${s.pct}%`,
              background: SEGMENT_COLOR[s.key],
              borderRadius: single ? h / 2 : 0,
            }}
          />
        ))}
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: mobile ? '4px 16px' : '4px 24px',
        marginTop: mobile ? 9 : 10, fontSize: mobile ? 11.5 : 12.5, color: C.body,
      }}>
        {legend.map(l => (
          <span key={l.key} style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 7 }}>
            <span style={{
              width: mobile ? 7 : 8, height: mobile ? 7 : 8, borderRadius: 2,
              background: SEGMENT_COLOR[l.key], flex: 'none',
            }} />
            {l.label}
            {l.count && <span style={{ fontWeight: 600, color: C.ink }}>{l.count}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Hero footer stats ────────────────────────────────────────────────────────

function Stat({ label, value, mobile }) {
  return (
    <div>
      <div style={{
        fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.08em',
        color: C.label, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: SC_SERIF, fontSize: mobile ? 19 : 22, fontWeight: 500,
        color: C.ink, marginTop: mobile ? 3 : 4,
      }}>{value}</div>
    </div>
  )
}

// ── Week accordion ───────────────────────────────────────────────────────────

function SessionRow({ entry, isUpNext, mobile }) {
  const { session, ordinal } = entry
  const meta = [session.studyMethod, `${session.duration} min`].filter(Boolean).join(' · ')

  if (session.done) {
    const doneOn = session.doneAt ? shortDate(session.doneAt.split('T')[0]) : shortDate(session.scheduledDate)
    return (
      <div style={{
        display: 'flex', alignItems: mobile ? 'flex-start' : 'center', gap: mobile ? 10 : 16,
        padding: mobile ? '14px 18px' : '16px 28px', borderBottom: `1px solid ${C.rowRule}`,
      }}>
        <span style={{ flex: 'none', width: mobile ? 'auto' : 26, display: 'flex', justifyContent: 'center' }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%', background: C.green, color: '#fff',
            fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} aria-hidden="true">✓</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: mobile ? 13.5 : 14.5, fontWeight: 600, color: C.label,
            textDecoration: 'line-through', textDecorationColor: C.strike,
          }}>{session.focusArea}</div>
          <div style={{ fontSize: mobile ? 12.5 : 13, color: C.faint, marginTop: mobile ? 3 : 2 }}>
            {doneOn ? `Done ${doneOn} · ` : ''}{meta}
          </div>
        </div>
      </div>
    )
  }

  const number = (
    <span style={{
      flex: 'none', width: mobile ? 'auto' : 26, fontFamily: SC_SERIF,
      fontSize: mobile ? 16 : 18, fontWeight: 500,
      color: isUpNext ? C.done : C.label,
    }}>{ordinal}</span>
  )
  const upNextTag = isUpNext && (
    <span style={{
      flex: 'none', fontSize: mobile ? 10 : 11, fontWeight: 600, letterSpacing: '.08em',
      color: C.done, textTransform: 'uppercase',
      ...(mobile ? { marginLeft: 'auto' } : {}),
    }}>Up next</span>
  )

  // Mobile drops to two lines: title row, then "focus · method · min".
  if (mobile) {
    return (
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${C.rowRule}`,
        background: isUpNext ? C.upNextBg : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          {number}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{session.focusArea}</span>
          {upNextTag}
        </div>
        <div style={{ fontSize: 12.5, color: C.body, marginTop: 3 }}>
          {[session.goal, meta].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '16px 28px',
      borderBottom: `1px solid ${C.rowRule}`,
      background: isUpNext ? C.upNextBg : 'transparent',
    }}>
      {number}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{session.focusArea}</div>
        <div style={{ fontSize: 13, color: C.body, marginTop: 2 }}>{session.goal}</div>
      </div>
      <span style={{ flex: 'none', fontSize: 12.5, color: C.label }}>{meta}</span>
      {upNextTag}
    </div>
  )
}

function WeekCard({ week, entries, index, expanded, onToggle, upNextId, mobile, first }) {
  const total = entries.length
  const done = entries.filter(e => e.session.done).length
  const hours = formatHours(entries.reduce((s, e) => s + (Number(e.session.duration) || 0), 0) / 60)
  const complete = total > 0 && done === total

  // Collapsed weeks that have not started show their topic theme; started ones
  // show progress instead. Straight from the spec.
  const themeTail = !expanded && !done && week.theme ? ` · ${week.theme}` : ''
  const summary = done > 0
    ? `${done} of ${total} done · ${hours} hrs`
    : `${total} session${total === 1 ? '' : 's'} · ${hours} hrs${themeTail}`

  const title = week.week || `Week ${index + 1}`

  const right = complete
    ? (
      <span style={{
        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 12.5, color: C.green, fontWeight: 600,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green }} />
        Complete
      </span>
    )
    : <span style={{ marginLeft: 'auto', fontSize: 11, color: C.label }}>{expanded ? '▴' : '▾'}</span>

  const card = {
    background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16,
    boxShadow: C.cardShadow, overflow: 'hidden',
    marginTop: first ? (mobile ? 0 : 0) : (mobile ? 12 : 14),
  }

  const header = (
    <button
      type="button"
      onClick={complete ? undefined : onToggle}
      aria-expanded={expanded}
      style={{
        ...btnReset, width: '100%', textAlign: 'left', fontFamily: SANS,
        padding: mobile ? '16px 18px' : '20px 28px',
        cursor: complete ? 'default' : 'pointer',
        borderBottom: expanded ? `1px solid ${C.rowRule}` : 'none',
        display: mobile ? 'block' : 'flex',
        alignItems: 'baseline', gap: 14,
      }}
    >
      {mobile ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{title}</span>
            {right}
          </div>
          <div style={{ fontSize: 12, color: C.label, marginTop: 2 }}>{summary}</div>
        </>
      ) : (
        <>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</span>
          <span style={{ fontSize: 13, color: C.label }}>{summary}</span>
          {right}
        </>
      )}
    </button>
  )

  return (
    <div style={card}>
      {header}
      {expanded && entries.map(entry => (
        <SessionRow
          key={entry.session.id}
          entry={entry}
          isUpNext={entry.session.id === upNextId}
          mobile={mobile}
        />
      ))}
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function StudyCoachPlanView({
  plan,
  course,
  courseIdx = 0,
  pushed = false,
  onBack,
  onStart,
  onCatchUp,
  onPush,
  onRefine,
  onExport,
  onOpenStruggleTracker,
  onOpenGradeHub,
  catchUpBusy = false,
  pushBusy = false,
  notice = null,
}) {
  const mobile = useIsMobile()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const today = todayISO()
  const examDate = plan?.examDate ?? null

  const math = useMemo(
    () => computePlanMath(plan, { today, examDate }),
    [plan, today, examDate]
  )
  const flat = useMemo(() => flattenSessions(plan), [plan])
  const upNext = useMemo(() => nextSession(plan), [plan])

  // The week that holds the next session opens by default.
  const currentWeekIdx = upNext ? upNext.wi : 0
  const [expandedWeek, setExpandedWeek] = useState(currentWeekIdx)
  useEffect(() => { setExpandedWeek(currentWeekIdx) }, [currentWeekIdx])

  // The topics strip is driven entirely by session provenance: a topic only
  // gets an amber marker because a session says it came from the Struggle
  // Tracker. No provenance, no marker.
  const topics = useMemo(() => {
    const seen = new Map()
    for (const { session } of flat) {
      const p = session.provenance
      if (!p?.id || seen.has(p.id)) continue
      seen.set(p.id, { id: p.id, label: p.label, fromStruggle: p.kind === 'struggle' })
    }
    return [...seen.values()]
  }, [flat])
  const hasStruggleTopics = topics.some(t => t.fromStruggle)

  const dot = (course?.color?.dot) || courseColor(courseIdx).dot
  const examLabel = examDate ? ` · Exam ${shortDate(examDate)}` : ''

  const pad = mobile ? '24px 20px 56px' : '40px 40px 72px'

  // ── Header actions ──
  const refineLink = (
    <button type="button" onClick={onRefine} style={{
      ...btnReset, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.blue,
    }}>Refine inputs</button>
  )

  const pushControl = pushed ? (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13.5, fontWeight: 500, color: C.secondary,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green }} />
      On your schedule
      {!math.complete && (
        <>
          {' · '}
          <button type="button" onClick={onPush} disabled={pushBusy} style={{
            ...btnReset, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.blue,
            opacity: pushBusy ? 0.6 : 1,
          }}>Update</button>
        </>
      )}
    </span>
  ) : (
    <button type="button" onClick={onPush} disabled={pushBusy} style={{
      ...btnReset, fontFamily: SANS,
      display: 'flex', alignItems: 'center', gap: 8,
      border: `1.5px solid ${C.blue}`, color: C.blue, borderRadius: 10,
      padding: '8px 16px', fontSize: 14, fontWeight: 600, opacity: pushBusy ? 0.6 : 1,
    }}>Push to Schedule</button>
  )

  const overflow = (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOverflowOpen(o => !o)}
        aria-label="More plan actions"
        aria-expanded={overflowOpen}
        style={{
          ...btnReset, fontFamily: SANS, fontSize: mobile ? 15 : 16, fontWeight: 600,
          color: C.label, letterSpacing: '.05em', lineHeight: 1,
        }}
      >···</button>
      {overflowOpen && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 8, zIndex: 20,
          background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12,
          boxShadow: '0 8px 24px rgba(28,27,24,.10)', padding: 6, minWidth: 172,
        }}>
          <button type="button" onClick={() => { setOverflowOpen(false); onExport?.() }} style={{
            ...btnReset, fontFamily: SANS, display: 'block', width: '100%', textAlign: 'left',
            padding: '9px 12px', borderRadius: 8, fontSize: 13.5, color: C.ink,
          }}>Export plan</button>
          {mobile && (
            <button type="button" onClick={() => { setOverflowOpen(false); onRefine?.() }} style={{
              ...btnReset, fontFamily: SANS, display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 12px', borderRadius: 8, fontSize: 13.5, color: C.ink,
            }}>Refine inputs</button>
          )}
        </div>
      )}
    </div>
  )

  // ── Hero content, per state ──
  const heroEyebrow = math.complete ? 'Plan complete' : 'Up next'

  const heroTitle = math.complete
    ? `All ${math.total} sessions done${math.daysToExam ? `, ${math.daysToExam} day${math.daysToExam === 1 ? '' : 's'} early.` : '.'}`
    : upNext
      ? `Session ${upNext.ordinal} · ${upNext.session.focusArea}`
      : 'No sessions left in this plan.'

  const primaryLabel = math.complete ? 'Start final review' : 'Start session'
  const primaryAction = () => onStart?.(math.complete ? null : upNext)

  const primaryButton = (
    <button type="button" onClick={primaryAction} style={{
      ...btnReset, fontFamily: SANS,
      background: C.done, color: '#fff', borderRadius: mobile ? 12 : 10,
      padding: mobile ? '13px 0' : '12px 24px', fontSize: mobile ? 14.5 : 15, fontWeight: 600,
      ...(mobile
        ? { width: '100%', textAlign: 'center', marginTop: 16, minHeight: 44 }
        : { flex: 'none', marginTop: 4 }),
    }}>{primaryLabel}</button>
  )

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh', fontFamily: SANS }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: pad }}>

        <button type="button" onClick={onBack} style={{
          ...btnReset, fontFamily: SANS, fontSize: mobile ? 12.5 : 13, fontWeight: 500, color: C.label,
        }}>‹ Back to My Plans</button>

        {/* ── Header ── */}
        {mobile ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, marginTop: 16,
              fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em',
              color: C.label, textTransform: 'uppercase',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
              {course?.name}{examLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <h1 style={{
                margin: 0, fontFamily: SC_SERIF, fontSize: 36, fontWeight: 500,
                color: C.ink, letterSpacing: '-0.01em',
              }}>Study Coach<span style={{ color: C.blue }}>.</span></h1>
              <span style={{ marginLeft: 'auto' }}>{overflow}</span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginTop: 18 }}>
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, fontWeight: 600, letterSpacing: '.1em',
                color: C.label, textTransform: 'uppercase',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                {course?.name}{examLabel}
              </div>
              <h1 style={{
                margin: '8px 0 0', fontFamily: SC_SERIF, fontSize: 44, fontWeight: 500,
                color: C.ink, letterSpacing: '-0.01em',
              }}>Study Coach<span style={{ color: C.blue }}>.</span></h1>
            </div>
            <div style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center',
              gap: 18, paddingBottom: 8,
            }}>
              {refineLink}
              {pushControl}
              {overflow}
            </div>
          </div>
        )}

        {notice && (
          <div style={{
            marginTop: 16, padding: '11px 14px', borderRadius: 10,
            background: '#fff', border: `1px solid ${C.cardBorder}`,
            fontSize: 13.5, color: C.secondary,
          }}>{notice}</div>
        )}

        {/* ── Hero ── */}
        <div style={{
          marginTop: mobile ? 20 : 28, background: C.card,
          border: `1px solid ${C.cardBorder}`, borderRadius: 16, boxShadow: C.cardShadow,
          padding: mobile ? '22px 20px' : '32px 36px 28px',
        }}>
          <div style={{
            fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.1em',
            color: C.label, textTransform: 'uppercase', marginBottom: mobile ? 10 : 14,
          }}>{heroEyebrow}</div>

          <div style={mobile ? undefined : { display: 'flex', alignItems: 'flex-start', gap: 32 }}>
            <div style={mobile ? undefined : { flex: 1 }}>
              <div style={{
                fontFamily: SC_SERIF, fontSize: mobile ? 24 : 30, fontWeight: 500,
                color: C.ink, letterSpacing: '-0.01em', lineHeight: mobile ? 1.3 : 1.2,
              }}>{heroTitle}</div>

              {math.complete ? (
                <div style={{
                  fontSize: mobile ? 13.5 : 14.5, lineHeight: 1.6, color: C.secondary,
                  marginTop: mobile ? 7 : 8, maxWidth: 560,
                }}>
                  You covered everything in the plan. A light review the day before the exam is the
                  best use of the time left, or check where your grade stands in{' '}
                  <button type="button" onClick={onOpenGradeHub} style={{
                    ...btnReset, fontFamily: SANS, fontSize: 'inherit', color: C.blue, fontWeight: 600,
                  }}>Grade Hub</button>.
                </div>
              ) : upNext && (
                <>
                  <div style={{
                    fontSize: mobile ? 13.5 : 14.5, lineHeight: 1.6, color: C.secondary,
                    marginTop: mobile ? 7 : 8, maxWidth: 560,
                  }}>{upNext.session.goal}</div>

                  {upNext.session.provenance && (
                    <div style={{
                      fontSize: mobile ? 12 : 12.5, color: C.faint, marginTop: mobile ? 5 : 6,
                    }}>
                      {upNext.session.provenance.kind === 'struggle'
                        ? 'From your Struggle Tracker'
                        : 'From your topics'} · {upNext.session.provenance.label}
                    </div>
                  )}

                  <div style={{
                    fontSize: mobile ? 12.5 : 13, fontWeight: 500, color: C.label,
                    marginTop: mobile ? 7 : 8,
                  }}>
                    {[upNext.session.studyMethod, `${upNext.session.duration} min`].filter(Boolean).join(' · ')}
                  </div>
                </>
              )}
            </div>
            {!mobile && primaryButton}
          </div>
          {mobile && primaryButton}

          {/* Behind block (3c). Only ever rendered with a real horizon. */}
          {math.isBehind && (
            <div style={{
              marginTop: mobile ? 18 : 22, borderLeft: `3px solid ${C.behind}`,
              padding: mobile ? '4px 0 6px 14px' : '4px 0 6px 18px',
              maxWidth: mobile ? '100%' : 640,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.09em',
                color: C.behindText, textTransform: 'uppercase',
              }}>
                {math.behind} session{math.behind === 1 ? '' : 's'} behind schedule
              </div>
              <div style={{
                fontSize: 13.5, lineHeight: 1.6, color: C.secondary, marginTop: 6,
              }}>
                By today the plan expected {math.expectedByToday} session{math.expectedByToday === 1 ? '' : 's'} done.
                Catch up reworks the {math.remaining} session{math.remaining === 1 ? '' : 's'} left to fit the time
                before the exam, shortening reviews and merging overlapping topics.
              </div>
              <button type="button" onClick={onCatchUp} disabled={catchUpBusy} style={{
                ...btnReset, fontFamily: SANS,
                display: mobile ? 'block' : 'inline-block',
                marginTop: 10, border: `1.5px solid ${C.behind}`, color: C.behindText,
                borderRadius: 9, padding: mobile ? '0' : '7px 14px',
                fontSize: 13.5, fontWeight: 600, opacity: catchUpBusy ? 0.6 : 1,
                ...(mobile ? { width: '100%', height: 44, textAlign: 'center' } : {}),
              }}>{catchUpBusy ? 'Reworking…' : 'Catch up'}</button>
            </div>
          )}

          {/* No exam date means no horizon, so no behind state and no catch-up.
              We ask for the missing input instead of inventing one. */}
          {!math.hasExamDate && !math.complete && (
            <div style={{
              marginTop: mobile ? 16 : 20, fontSize: 13, color: C.label,
            }}>
              Add your exam date in{' '}
              <button type="button" onClick={onRefine} style={{
                ...btnReset, fontFamily: SANS, fontSize: 'inherit', color: C.blue, fontWeight: 600,
              }}>Refine inputs</button>
              {' '}to track whether you are on schedule.
            </div>
          )}

          <ProgressBar math={math} mobile={mobile} />

          <div style={{
            display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap',
            gap: mobile ? 26 : 44,
            marginTop: mobile ? 18 : 26, paddingTop: mobile ? 14 : 22,
            borderTop: `1px solid ${C.rowRule}`,
          }}>
            {math.complete ? (
              <>
                <Stat label="Hours studied" value={formatHours(math.hoursStudied)} mobile={mobile} />
                {math.hasExamDate && <Stat label="Exam in" value={`${math.daysToExam} days`} mobile={mobile} />}
                {!mobile && (
                  <button type="button" onClick={onOpenGradeHub} style={{
                    ...btnReset, fontFamily: SANS, marginLeft: 'auto',
                    fontSize: 14, fontWeight: 600, color: C.blue,
                  }}>See where you stand in Grade Hub ›</button>
                )}
              </>
            ) : (
              <>
                <Stat label="Sessions" value={`${math.done} of ${math.total}`} mobile={mobile} />
                <Stat label={mobile ? 'Hours left' : 'Hours remaining'} value={formatHours(math.hoursRemaining)} mobile={mobile} />
                {math.hasExamDate && <Stat label="Exam in" value={`${math.daysToExam} days`} mobile={mobile} />}
              </>
            )}
          </div>

          {math.complete && mobile && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button type="button" onClick={onOpenGradeHub} style={{
                ...btnReset, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.blue,
              }}>See where you stand in Grade Hub ›</button>
            </div>
          )}
        </div>

        {/* ── Topics strip. The Struggle Tracker's only home on this page. ── */}
        {topics.length > 0 && (
          mobile ? (
            <div style={{ margin: '22px 2px 12px', fontSize: 12, lineHeight: 1.8, color: C.secondary }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em',
                color: C.label, textTransform: 'uppercase',
              }}>Emphasizes</span>
              {'  '}
              {topics.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ' · '}
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {t.fromStruggle && (
                      <span style={{
                        display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                        background: C.behind, margin: '0 4px 2px 0',
                      }} />
                    )}
                    {t.label}
                  </span>
                </span>
              ))}
              {hasStruggleTopics && (
                <>
                  {' · '}
                  <button type="button" onClick={onOpenStruggleTracker} style={{
                    ...btnReset, fontFamily: SANS, fontSize: 'inherit', fontWeight: 600, color: C.blue,
                  }}>Struggle Tracker ›</button>
                </>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              margin: '26px 2px 14px', flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.1em',
                color: C.label, textTransform: 'uppercase',
              }}>This plan emphasizes</span>
              {topics.map(t => (
                <span key={t.id} style={{
                  fontSize: 13, color: C.secondary, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {t.fromStruggle && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.behind }} />
                  )}
                  {t.label}
                </span>
              ))}
              {hasStruggleTopics && (
                <span style={{ fontSize: 12.5, color: C.label, marginLeft: 6 }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: C.behind, marginRight: 5,
                  }} />
                  added from your{' '}
                  <button type="button" onClick={onOpenStruggleTracker} style={{
                    ...btnReset, fontFamily: SANS, fontSize: 'inherit', fontWeight: 600, color: C.blue,
                  }}>Struggle Tracker ›</button>
                </span>
              )}
            </div>
          )
        )}

        {/* ── Weeks ── */}
        <div style={{ marginTop: topics.length ? 0 : (mobile ? 20 : 26) }}>
          {(plan?.weeklyFocus || []).map((week, wi) => (
            <WeekCard
              key={week.week ?? wi}
              week={week}
              index={wi}
              first={wi === 0}
              entries={flat.filter(e => e.wi === wi)}
              expanded={expandedWeek === wi}
              onToggle={() => setExpandedWeek(cur => (cur === wi ? -1 : wi))}
              upNextId={upNext?.session.id}
              mobile={mobile}
            />
          ))}
        </div>

        {/* Mobile moves plan management below the plan (3e). */}
        {mobile && (
          <>
            <button type="button" onClick={onPush} disabled={pushBusy} style={{
              ...btnReset, fontFamily: SANS, display: 'block', width: '100%',
              marginTop: 16, border: `1.5px solid ${C.blue}`, color: C.blue,
              borderRadius: 12, padding: '12px 0', textAlign: 'center',
              fontSize: 14.5, fontWeight: 600, minHeight: 44, opacity: pushBusy ? 0.6 : 1,
            }}>
              {pushed ? 'Update your schedule' : 'Push to Schedule'}
            </button>
            <button type="button" onClick={onRefine} style={{
              ...btnReset, fontFamily: SANS, display: 'block', width: '100%',
              marginTop: 12, textAlign: 'center', fontSize: 13.5, fontWeight: 600,
              color: C.blue, minHeight: 44,
            }}>Refine inputs</button>
          </>
        )}
      </div>
    </div>
  )
}
