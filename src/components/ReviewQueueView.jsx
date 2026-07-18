import { useState, useMemo } from 'react'
import {
  getDueForReview, getUpcomingReviews, getMasteryColor, getMasteryLevel, getMasteryTrend, getReviewStats,
} from '../lib/masteryStore'
import { track } from '../lib/analytics'
import { color as C, space as S, radius as R, motion as M, shadow as SH, touch as T, focusRing } from '../lib/designTokens'

// ── Formatters ──────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return 'never'
  const d = Math.floor((Date.now() - ts) / 86400000)
  const h = Math.floor((Date.now() - ts) / 3600000)
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  return 'just now'
}
function overdueLabel(ms) {
  const d = Math.floor(ms / 86400000)
  const h = Math.floor(ms / 3600000)
  if (d >= 2) return `${d} days overdue`
  if (d >= 1) return '1 day overdue'
  if (h >= 1) return `${h}h overdue`
  return 'Due now'
}
function dueInLabel(due) {
  const diff = due - Date.now()
  const d = Math.floor(diff / 86400000)
  const h = Math.floor(diff / 3600000)
  if (d >= 1) return `in ${d} day${d !== 1 ? 's' : ''}`
  if (h >= 1) return `in ${h} hour${h !== 1 ? 's' : ''}`
  return 'soon'
}

// ── Mastery ring ────────────────────────────────────────────────────────────
function MasteryRing({ score, size = 56 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const col = getMasteryColor(score)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${col}18`} strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={col} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: `stroke-dasharray ${M.slow}ms ${M.easeOut}` }}
      />
      <text
        x="50%" y="50%" dy="0.35em" textAnchor="middle"
        fontSize={size * 0.34} fontWeight="800" fill={col}
        style={{ fontFamily: 'ui-monospace, monospace' }}
      >{score}</text>
    </svg>
  )
}

function TrendPill({ trend }) {
  if (!trend || trend === 'flat') return null
  const up = trend === 'up'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em',
      color: up ? C.success : C.danger,
      background: up ? C.successSoft : C.dangerSoft,
      borderRadius: R.xs, padding: '2px 6px',
    }}>
      <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        {up ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
            : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>}
      </svg>
      {up ? 'improving' : 'slipping'}
    </span>
  )
}

// ── Topic card ──────────────────────────────────────────────────────────────
function TopicCard({ item, onDrill, onQuiz, isDue }) {
  const [hovered, setHovered] = useState(false)
  const level = getMasteryLevel(item.score)
  const col = getMasteryColor(item.score)
  const trend = getMasteryTrend(item)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: S[4],
        padding: `${S[4]}px ${S[5]}px`,
        background: hovered ? C.surfaceHover : C.surface,
        borderBottom: `1px solid ${C.divider}`,
        transition: `background ${M.fast}ms ${M.easing}`,
        minHeight: T.large,
      }}
    >
      {/* Mastery ring */}
      <MasteryRing score={item.score} size={52} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {item.topic}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: col, background: `${col}12`,
            padding: '2px 7px', borderRadius: R.xs,
          }}>
            {level}
          </span>
          <TrendPill trend={trend} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], fontSize: 12, color: C.textMuted, flexWrap: 'wrap' }}>
          {isDue ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: item.overdueMs > 86400000 ? C.danger : C.warning,
              fontWeight: 700,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {overdueLabel(item.overdueMs)}
            </span>
          ) : (
            <span style={{ color: C.textMuted }}>Review due {dueInLabel(item.dueAt)}</span>
          )}
          <span style={{ color: C.textDim }}>·</span>
          <span>{item.count} session{item.count !== 1 ? 's' : ''}</span>
          <span style={{ color: C.textDim }}>·</span>
          <span>Last practiced {timeAgo(item.lastUpdated)}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: S[2], flexShrink: 0, opacity: hovered ? 1 : 0.65, transition: `opacity ${M.fast}ms ${M.easing}` }}>
        <button
          onClick={() => onDrill?.(item.topic, item.courseId)}
          aria-label={`Brain Dump: ${item.topic}`}
          style={{
            minHeight: T.min, minWidth: T.min,
            padding: `${S[2]}px ${S[3]}px`,
            fontSize: 12.5, fontWeight: 700,
            color: C.textInverse, background: C.accent,
            border: 'none', borderRadius: R.md,
            cursor: 'pointer',
            boxShadow: SH.sm,
            transition: `transform ${M.fast}ms ${M.easing}, background ${M.fast}ms ${M.easing}`,
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onFocus={e => Object.assign(e.currentTarget.style, focusRing(C.accent))}
          onBlur={e => e.currentTarget.style.boxShadow = SH.sm}
        >
          Drill
        </button>
        <button
          onClick={() => onQuiz?.(item.topic, item.courseId)}
          aria-label={`Quiz: ${item.topic}`}
          style={{
            minHeight: T.min, minWidth: T.min,
            padding: `${S[2]}px ${S[3]}px`,
            fontSize: 12.5, fontWeight: 700,
            color: C.accent, background: C.accentSoft,
            border: `1px solid ${C.accentRing}`,
            borderRadius: R.md,
            cursor: 'pointer',
            transition: `background ${M.fast}ms ${M.easing}`,
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          Quiz
        </button>
      </div>
    </div>
  )
}

// ── Summary stat card ───────────────────────────────────────────────────────
function StatCard({ label, value, sublabel, tint, urgent, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: 1, minWidth: 140,
        padding: `${S[4]}px ${S[5]}px`,
        background: urgent ? tint + '14' : C.surface,
        border: `1px solid ${urgent ? tint + '35' : C.border}`,
        borderRadius: R.lg,
        boxShadow: SH.sm,
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: `transform ${M.fast}ms ${M.easing}, box-shadow ${M.fast}ms ${M.easing}`,
        opacity: value === 0 && !urgent ? 0.65 : 1,
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = SH.md)}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = SH.sm)}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: urgent ? tint : C.textMuted }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: urgent ? tint : C.text, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{sublabel}</div>
      )}
    </button>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ tab, onOpenBrainDump }) {
  if (tab === 'due') {
    return (
      <div style={{ padding: `${S[16]}px ${S[6]}px`, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: R['2xl'],
          background: `linear-gradient(135deg, ${C.success}18, ${C.success}08)`,
          border: `1px solid ${C.success}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: `0 auto ${S[5]}px`,
          boxShadow: SH.glow(C.success),
        }}>
          <svg width="36" height="36" fill="none" stroke={C.success} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          You are all caught up
        </h3>
        <p style={{ fontSize: 14, color: C.textMuted, margin: '0 auto', maxWidth: 380, lineHeight: 1.55 }}>
          Every topic in your Knowledge Map is well within its review window. Come back later or add new topics with a Brain Dump.
        </p>
        {onOpenBrainDump && (
          <button
            onClick={onOpenBrainDump}
            style={{
              marginTop: S[5], minHeight: T.min,
              padding: `${S[3]}px ${S[5]}px`,
              fontSize: 13.5, fontWeight: 700,
              color: C.textInverse, background: C.accent,
              border: 'none', borderRadius: R.md,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: SH.glow(C.accent),
              transition: `transform ${M.fast}ms ${M.easing}`,
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Add a new topic
          </button>
        )}
      </div>
    )
  }
  return (
    <div style={{ padding: `${S[16]}px ${S[6]}px`, textAlign: 'center' }}>
      <div style={{
        width: 80, height: 80, borderRadius: R['2xl'],
        background: `linear-gradient(135deg, ${C.accent}14, ${C.accent}06)`,
        border: `1px solid ${C.accent}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: `0 auto ${S[5]}px`,
      }}>
        <svg width="36" height="36" fill="none" stroke={C.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Nothing scheduled yet
      </h3>
      <p style={{ fontSize: 14, color: C.textMuted, margin: '0 auto', maxWidth: 380, lineHeight: 1.55 }}>
        Complete Brain Dumps and quizzes to build your review schedule. Every practice adds a review interval so you never forget what you learned.
      </p>
    </div>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export default function ReviewQueueView({ courses, onOpenBrainDump, onOpenQuizBurst }) {
  const [courseFilter, setCourseFilter] = useState('all')
  const [tab, setTab] = useState('due')

  const courseId = useMemo(() => {
    if (courseFilter === 'all') return null
    return courses?.find(c => String(c.id) === courseFilter)?.id ?? null
  }, [courseFilter, courses])

  const dueItems = useMemo(() => getDueForReview(courseId), [courseId])
  const upcomingItems = useMemo(() => getUpcomingReviews(courseId, 7), [courseId])
  const stats = useMemo(() => getReviewStats(), [])

  const displayed = tab === 'due' ? dueItems : upcomingItems
  const overdueByADay = dueItems.filter(i => i.overdueMs > 86400000).length

  const handleDrill = (topic) => {
    track('review_queue_drill', { topic, source: 'brain_dump' })
    onOpenBrainDump?.()
  }
  const handleQuiz = (topic) => {
    track('review_queue_drill', { topic, source: 'quiz' })
    onOpenQuizBurst?.()
  }

  return (
    <div style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: `${S[8]}px ${S[4]}px ${S[16]}px`,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{ marginBottom: S[6] }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: C.textMuted, margin: `0 0 ${S[2]}px`,
        }}>
          Spaced Repetition
        </p>
        <h1 style={{
          fontSize: 36, fontWeight: 800, color: C.text, letterSpacing: '-0.025em', lineHeight: 1.1,
          margin: `0 0 ${S[3]}px`,
        }}>
          Review Queue
        </h1>
        <p style={{ fontSize: 15, color: C.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
          Topics scheduled for review based on how well you know them. Reviewing at the right time locks in long-term retention.
        </p>
      </header>

      {/* Summary stat cards */}
      <div style={{ display: 'flex', gap: S[3], marginBottom: S[5], flexWrap: 'wrap' }}>
        <StatCard
          label="Due now"
          value={stats.dueCount}
          sublabel={overdueByADay > 0 ? `${overdueByADay} overdue by 1+ day` : 'Ready to review'}
          tint={C.danger}
          urgent={stats.dueCount > 0}
          onClick={stats.dueCount > 0 ? () => setTab('due') : null}
        />
        <StatCard
          label="Coming up"
          value={stats.upcomingCount}
          sublabel="Within 7 days"
          tint={C.warning}
          urgent={false}
          onClick={stats.upcomingCount > 0 ? () => setTab('upcoming') : null}
        />
        {stats.dueCount > 0 && (
          <button
            onClick={() => { track('review_queue_drill_all'); onOpenBrainDump?.() }}
            style={{
              minHeight: T.large,
              padding: `${S[3]}px ${S[6]}px`,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
              color: C.textInverse, border: 'none', borderRadius: R.lg,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: SH.glow(C.accent),
              fontFamily: 'inherit',
              transition: `transform ${M.fast}ms ${M.easing}, box-shadow ${M.fast}ms ${M.easing}`,
              display: 'inline-flex', alignItems: 'center', gap: S[2],
              alignSelf: 'stretch',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            Drill everything due
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[4], flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.04)', borderRadius: R.md, padding: 3 }}>
          {[
            { id: 'due', label: `Due (${dueItems.length})` },
            { id: 'upcoming', label: `Coming up (${upcomingItems.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                minHeight: 36,
                padding: `${S[2]}px ${S[4]}px`,
                borderRadius: R.sm, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? C.surface : 'transparent',
                color: tab === t.id ? C.text : C.textMuted,
                boxShadow: tab === t.id ? SH.sm : 'none',
                fontFamily: 'inherit',
                transition: `background ${M.fast}ms ${M.easing}, color ${M.fast}ms ${M.easing}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {courses?.length > 1 && (
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            style={{
              minHeight: 36, fontSize: 13,
              color: C.text, background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: R.md,
              padding: `${S[2]}px ${S[3]}px`,
              cursor: 'pointer', outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <option value="all">All courses</option>
            {courses.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Topic list */}
      <div style={{
        background: C.surface, borderRadius: R.xl,
        border: `1px solid ${C.border}`, overflow: 'hidden',
        boxShadow: SH.md,
      }}>
        {displayed.length === 0
          ? <EmptyState tab={tab} onOpenBrainDump={onOpenBrainDump} />
          : displayed.map((item, i) => (
            <TopicCard
              key={`${item.topic}-${item.courseId}-${i}`}
              item={item}
              isDue={tab === 'due'}
              onDrill={handleDrill}
              onQuiz={handleQuiz}
            />
          ))}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: S[5],
        padding: `${S[4]}px ${S[5]}px`,
        borderRadius: R.lg,
        background: C.accentSoft,
        border: `1px solid ${C.accentRing}`,
        display: 'flex', gap: S[3], alignItems: 'flex-start',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: R.md, flexShrink: 0,
          background: `${C.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.accent, margin: `0 0 ${S[1]}px`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            How this works
          </p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
            Review intervals scale with your mastery. Weak topics come back in 1 day, developing in 2 to 4 days, strong in 7 days. Each review updates your score and pushes the next review further out.
          </p>
        </div>
      </div>
    </div>
  )
}
