import { T } from '../../tokens'
import { chipForCourse } from './planLogic'
import { planProgress } from './planStore'

const LABEL_META = { fontSize: 12.5, color: T.dim }

// Renders the top-level "My Plans" list.
// Rows come only from real course data. Rows without a plan show the
// "No plan yet" + Build plan pattern. Rows with a plan show progress.
export default function PlansIndex({
  courses,
  plansById,       // { [courseId]: v2Plan | null }
  todayIso,
  onOpenPlan,      // (courseId) => void
  onBuildPlan,     // (courseIdx) => void
  onNewPlan,       // () => void — opens modal on the first course without a plan
}) {
  return (
    <div style={{ maxWidth: 800, width: '100%', margin: '0 auto', padding: '56px 24px 96px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{
            fontFamily: `'Source Serif 4', Georgia, serif`,
            fontWeight: 600, fontSize: 36, lineHeight: 1.15, margin: 0, color: T.text,
          }}>
            My Plans<span style={{ color: T.accent }}>.</span>
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 13.5, color: T.muted }}>
            One plan per course, built from what you tell me.
          </p>
        </div>
        <button
          onClick={onNewPlan}
          style={{
            marginTop: 6,
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius.sm + 1,
            padding: '8px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            color: T.text, cursor: 'pointer',
            boxShadow: T.shadow.card,
          }}
        >New plan</button>
      </div>

      <div style={{
        marginTop: 32, background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: T.radius.xl - 4, boxShadow: T.shadow.card,
        padding: '8px 24px',
      }}>
        {courses.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: T.dim, fontSize: 13.5 }}>
            Add a course to build your first plan.
          </div>
        )}
        {courses.map((c, i) => {
          const plan = plansById[c.id] ?? null
          const hasPlan = !!plan
          const progress = hasPlan ? planProgress(plan) : { total: 0, done: 0, pct: 0 }
          const isComplete = hasPlan && progress.total > 0 && progress.done === progress.total
          const chip = chipForCourse(c.examDate, todayIso)
          const color = c.color?.dot ?? T.course[i % T.course.length]
          const onRow = hasPlan ? () => onOpenPlan(c.id) : () => onBuildPlan(i)

          return (
            <div
              key={c.id ?? i}
              onClick={onRow}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow() } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 0',
                borderBottom: i === courses.length - 1 ? 'none' : `1px solid ${T.border}`,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: T.radius.full, background: color, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{c.name}</div>
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={LABEL_META}>
                    {isComplete
                      ? 'Plan complete'
                      : hasPlan
                        ? `${progress.total} sessions · ${plan.weeks.length} ${plan.weeks.length === 1 ? 'week' : 'weeks'} · ${progress.done} of ${progress.total} done`
                        : 'No plan yet'}
                  </span>
                  {hasPlan && !isComplete && (
                    <span style={{
                      width: 64, height: 3, borderRadius: T.radius.full,
                      background: T.bgEl, overflow: 'hidden', display: 'inline-block',
                    }}>
                      <span style={{
                        display: 'block', height: '100%', borderRadius: T.radius.full,
                        background: T.accent, width: `${progress.pct}%`,
                      }} />
                    </span>
                  )}
                  {!hasPlan && (
                    <a
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuildPlan(i) }}
                      style={{ fontSize: 12.5, fontWeight: 500, color: T.accent, cursor: 'pointer' }}
                      href="#"
                    >Build plan</a>
                  )}
                </div>
              </div>
              {isComplete && (
                <span aria-label="Plan complete" style={{ color: T.mint, flex: 'none', display: 'inline-flex' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              )}
              {chip && !isComplete && (
                <span style={{
                  background: chip.red ? T.pinkSoft : T.bgEl,
                  color: chip.red ? T.pink : T.muted,
                  fontSize: 11.5, fontWeight: 600, borderRadius: T.radius.full,
                  padding: '3px 10px', flex: 'none',
                }}>{chip.label}</span>
              )}
              {hasPlan && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', color: T.dim }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
