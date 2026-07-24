import { useMemo, useState } from 'react'
import { T } from '../../tokens'
import { adjustmentBanner, buildTrustLine } from './planLogic'
import {
  currentWeekIndex,
  firstIncomplete,
  planProgress,
} from './planStore'
import { getMasteryForCourse } from '../../lib/masteryStore'

// Matches DashboardViewV2 HeroNormal/HeroDone elevation exactly. This shadow
// is not yet in `T.shadow` because the dashboard hero itself isn't tokenized
// — tokenizing it is a separate follow-up so both surfaces move together.
const HERO_SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.85),0 12px 32px rgba(23,30,55,0.10),0 4px 12px rgba(52,82,217,0.08)'

const LABEL_MICRO = { fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.dim }

export default function PlanDetail({
  course,
  plan,               // v2 plan
  todayIso,
  scheduleHasData = false,   // real app-level schedule data exists for this user
  onBack,             // () => void
  onStartSession,     // (sessionRecord) => void — Coach root builds and launches the focus session
  onRefine,           // () => void — reopens create modal for this course
  onPushToSchedule,   // () => void — optional, wired later
  onExport,           // () => void — optional
}) {
  const [openWeeks, setOpenWeeks] = useState(() => {
    const idx = currentWeekIndex(plan, todayIso)
    return { [plan.weeks[idx]?.label]: true }
  })
  const [openSessions, setOpenSessions] = useState({})

  const progress = planProgress(plan)
  const nextUp = firstIncomplete(plan)?.session ?? null
  const nextUpId = nextUp?.id ?? null
  const totalMinutes = plan.weeks.reduce((sum, w) => sum + w.sessions.reduce((s, x) => s + (x.durationMin || 0), 0), 0)
  const hoursText = `${Math.round(totalMinutes / 60)} ${Math.round(totalMinutes / 60) === 1 ? 'hour' : 'hours'} of focused study`

  const banner = adjustmentBanner(plan, todayIso)

  const courseColor = course?.color?.dot ?? T.course[0]
  const practiceCount = useMemo(() => getMasteryForCourse(course?.id).length, [course?.id])
  const trust = buildTrustLine({
    uploads: false,
    practice: practiceCount > 0,
    schedule: scheduleHasData,
  })

  const toggleWeek = (label) => setOpenWeeks(prev => ({ ...prev, [label]: !prev[label] }))
  const toggleSess = (id) => setOpenSessions(prev => ({ ...prev, [id]: !prev[id] }))

  // Only the plan-wide first-incomplete gets the "next" ring. Pure identity
  // check — no per-render mutation.
  const isNext = (s) => s.id === nextUpId

  return (
    <div style={{ maxWidth: 800, width: '100%', margin: '0 auto', padding: '40px 24px 96px', boxSizing: 'border-box' }}>
      <a
        onClick={(e) => { e.preventDefault(); onBack() }}
        href="#"
        style={{ fontSize: 12.5, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', cursor: 'pointer' }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        My Plans
      </a>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: T.radius.full, background: courseColor }} />
            <h1 style={{
              fontFamily: `'Source Serif 4', Georgia, serif`,
              fontWeight: 600, fontSize: 28, margin: 0, color: T.text,
            }}>{course.name}</h1>
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.muted }}>
            {plan.weeks.length} {plan.weeks.length === 1 ? 'week' : 'weeks'} · {progress.total} sessions · {hoursText}
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              width: 220, height: 5, borderRadius: T.radius.full,
              background: T.bgEl, overflow: 'hidden', display: 'inline-block',
            }}>
              <span style={{
                display: 'block', height: '100%', borderRadius: T.radius.full,
                background: T.accent, width: `${progress.pct}%`,
              }} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted }}>
              {progress.done} of {progress.total} sessions
            </span>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.dim, maxWidth: 520, lineHeight: 1.5 }}>{trust}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.muted, flex: 'none', marginTop: 6, flexWrap: 'wrap' }}>
          {onPushToSchedule && (
            <>
              <a onClick={(e) => { e.preventDefault(); onPushToSchedule() }} href="#" style={{ color: T.muted, cursor: 'pointer' }}>Push to schedule</a>
              <span style={{ color: T.border }}>·</span>
            </>
          )}
          {onExport && (
            <>
              <a onClick={(e) => { e.preventDefault(); onExport() }} href="#" style={{ color: T.muted, cursor: 'pointer' }}>Export</a>
              <span style={{ color: T.border }}>·</span>
            </>
          )}
          <a onClick={(e) => { e.preventDefault(); onRefine() }} href="#" style={{ color: T.muted, cursor: 'pointer' }}>Refine plan</a>
        </div>
      </div>

      {/* Hero card at dashboard elevation */}
      <div style={{
        marginTop: 28,
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: T.radius.xl - 4,
        boxShadow: HERO_SHADOW,
        padding: '30px 32px',
      }}>
        <div style={LABEL_MICRO}>Up next</div>
        {nextUp ? (
          <>
            <div style={{ marginTop: 10, fontSize: 21, fontWeight: 650, color: T.text }}>{nextUp.title}</div>
            <div style={{ marginTop: 6, fontSize: 13.5, color: T.muted }}>
              {nextUp.toolLabel} · {nextUp.method} · {nextUp.durationMin}m
            </div>
            <button
              onClick={() => onStartSession(nextUp)}
              style={{
                marginTop: 20,
                background: T.accent, border: 'none', borderRadius: T.radius.md,
                padding: '11px 22px', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, color: T.onAccent, cursor: 'pointer',
              }}
            >Start session</button>
          </>
        ) : (
          <>
            <div style={{ marginTop: 10, fontSize: 21, fontWeight: 650, color: T.text }}>Plan complete</div>
            <div style={{ marginTop: 6, fontSize: 13.5, color: T.muted }}>Every session in this plan is done. Nice.</div>
          </>
        )}
        {banner && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: T.dim }}>{banner}</div>
        )}
      </div>

      {/* What this plan covers */}
      <div style={{ marginTop: 36 }}>
        <div style={LABEL_MICRO}>What this plan covers</div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {plan.topics.map((t, i) => (
            <span
              key={`${t.name}-${i}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: T.bgCard, border: `1px solid ${T.border}`,
                borderRadius: T.radius.full, padding: '6px 13px',
                fontSize: 12.5, color: T.text,
              }}
            >
              {t.name}
              {t.extra && (
                <span style={{
                  fontSize: 10.5, fontWeight: 600, color: T.muted,
                  background: T.bgEl, borderRadius: T.radius.full, padding: '2px 7px',
                }}>extra reps</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Week by week */}
      <div style={{ marginTop: 36 }}>
        <div style={LABEL_MICRO}>Week by week</div>
        <div style={{
          marginTop: 12, background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: T.radius.xl - 4, boxShadow: T.shadow.card, overflow: 'hidden',
        }}>
          {plan.weeks.map((w, wi) => {
            const doneCount = w.sessions.filter(s => s.status === 'done').length
            const expanded = !!openWeeks[w.label]
            return (
              <div key={w.label} style={{ borderBottom: wi === plan.weeks.length - 1 ? 'none' : `1px solid ${T.border}` }}>
                <div
                  onClick={() => toggleWeek(w.label)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWeek(w.label) } }}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 10,
                    padding: '16px 24px', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 650, color: T.text }}>{w.label}</span>
                  <span style={{ fontSize: 12.5, color: T.dim }}>{formatRange(w.startIso, w.endIso)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted }}>{doneCount}/{w.sessions.length}</span>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{
                    marginLeft: 'auto', flex: 'none', alignSelf: 'center',
                    color: T.dim, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {expanded && (
                  <div style={{ padding: '0 24px 10px' }}>
                    {w.sessions.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        isNext={isNext(s)}
                        expanded={!!openSessions[s.id]}
                        onToggle={() => toggleSess(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SessionRow({ session: s, isNext, expanded, onToggle }) {
  const isDone = s.status === 'done'
  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 2px', cursor: 'pointer' }}
      >
        <StatusIcon isDone={isDone} isNext={isNext} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5,
            fontWeight: isDone ? 500 : (isNext ? 650 : 500),
            color: isDone ? T.dim : T.text,
          }}>{s.title}</div>
          <div style={{ marginTop: 2, fontSize: 12, color: T.dim }}>
            {s.toolLabel} · {s.method} · {s.durationMin}m
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '2px 2px 14px 32px' }}>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            {s.topic}
            {s.scheduledDate && ` · scheduled ${formatDate(s.scheduledDate)}`}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ isDone, isNext }) {
  if (isDone) {
    return (
      <span style={{
        width: 20, height: 20, borderRadius: T.radius.full, background: T.bgEl,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
      }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke={T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    )
  }
  if (isNext) {
    return (
      <span style={{
        width: 20, height: 20, borderRadius: T.radius.full,
        border: `2px solid ${T.accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box', flex: 'none',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: T.radius.full, background: T.accent }} />
      </span>
    )
  }
  return (
    <span style={{
      width: 20, height: 20, borderRadius: T.radius.full,
      border: `2px solid ${T.border}`, boxSizing: 'border-box', flex: 'none',
    }} />
  )
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function formatRange(a, b) {
  const da = new Date(a + 'T12:00:00')
  const db = new Date(b + 'T12:00:00')
  const sameMonth = da.getMonth() === db.getMonth()
  const startStr = da.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = sameMonth
    ? String(db.getDate())
    : db.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startStr}-${endStr}`
}
