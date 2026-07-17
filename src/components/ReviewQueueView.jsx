import { useState, useMemo } from 'react'
import { getDueForReview, getUpcomingReviews, getMasteryColor, getMasteryLevel, getMasteryTrend } from '../lib/masteryStore'
import { track } from '../lib/analytics'

const D = {
  bg:     '#F7F6F3',
  card:   '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text:   '#111111',
  muted:  '#6B6B6B',
  dim:    '#9B9B9B',
  blue:   '#3B61C4',
  green:  '#16A34A',
  amber:  '#D97706',
  red:    '#DC2626',
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  return 'just now'
}

function overdueLabel(overdueMs) {
  const d = Math.floor(overdueMs / 86400000)
  const h = Math.floor(overdueMs / 3600000)
  if (d >= 2) return `${d} days overdue`
  if (d >= 1) return '1 day overdue'
  if (h >= 1) return `${h}h overdue`
  return 'Due now'
}

function dueInLabel(dueAt) {
  const diff = dueAt - Date.now()
  const d = Math.floor(diff / 86400000)
  const h = Math.floor(diff / 3600000)
  if (d >= 1) return `due in ${d}d`
  if (h >= 1) return `due in ${h}h`
  return 'due soon'
}

function TrendArrow({ trend }) {
  if (!trend || trend === 'flat') return null
  return (
    <svg width="10" height="10" fill="none" stroke={trend === 'up' ? D.green : D.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {trend === 'up'
        ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
        : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>
      }
    </svg>
  )
}

function TopicRow({ item, onDrill, onQuiz, isDue }) {
  const [hovered, setHovered] = useState(false)
  const level = getMasteryLevel(item.score)
  const color = getMasteryColor(item.score)
  const trend = getMasteryTrend(item)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px',
        borderRadius: 12,
        background: hovered ? 'rgba(0,0,0,0.02)' : 'transparent',
        transition: 'background 0.15s',
        borderBottom: `1px solid ${D.border}`,
      }}
    >
      {/* Score circle */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: `${color}14`, border: `2px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{item.score}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.topic}
          </span>
          <TrendArrow trend={trend} />
        </div>
        <div style={{ display: 'flex', align: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: isDue ? (item.overdueMs > 86400000 ? D.red : D.amber) : D.dim, fontWeight: isDue ? 600 : 400 }}>
            {isDue ? overdueLabel(item.overdueMs) : dueInLabel(item.dueAt)}
          </span>
          <span style={{ fontSize: 11, color: D.dim }}>
            {item.count} session{item.count !== 1 ? 's' : ''} · {timeAgo(item.lastUpdated)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color, background: `${color}12`, padding: '1px 6px', borderRadius: 4,
          }}>
            {level}
          </span>
        </div>
      </div>

      {/* Actions */}
      {hovered && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onDrill?.(item.topic, item.courseId)}
            style={{
              fontSize: 11.5, fontWeight: 700, color: '#fff',
              background: D.blue, border: 'none', borderRadius: 7,
              padding: '5px 12px', cursor: 'pointer',
            }}
          >
            Brain Dump
          </button>
          <button
            onClick={() => onQuiz?.(item.topic, item.courseId)}
            style={{
              fontSize: 11.5, fontWeight: 600, color: D.blue,
              background: 'rgba(59,97,196,0.1)', border: `1px solid rgba(59,97,196,0.25)`,
              borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
            }}
          >
            Quiz
          </button>
        </div>
      )}
    </div>
  )
}

export default function ReviewQueueView({ courses, onOpenBrainDump, onOpenQuizBurst }) {
  const [courseFilter, setCourseFilter] = useState('all')
  const [tab, setTab] = useState('due')

  const courseId = useMemo(() => {
    if (courseFilter === 'all') return null
    return courses?.find(c => String(c.id) === courseFilter)?.id ?? null
  }, [courseFilter, courses])

  const dueItems = useMemo(() => getDueForReview(courseId), [courseId])
  const upcomingItems = useMemo(() => getUpcomingReviews(courseId, 7), [courseId])

  const displayed = tab === 'due' ? dueItems : upcomingItems

  const handleDrill = (topic, topicCourseId) => {
    track('review_queue_drill', { topic, source: 'brain_dump' })
    onOpenBrainDump?.()
  }

  const handleQuiz = (topic, topicCourseId) => {
    track('review_queue_drill', { topic, source: 'quiz' })
    onOpenQuizBurst?.()
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.dim, margin: '0 0 6px' }}>
          Spaced Repetition
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: D.text, margin: '0 0 6px', letterSpacing: -0.5 }}>
          Review Queue
        </h1>
        <p style={{ fontSize: 14, color: D.muted, margin: 0, lineHeight: 1.5 }}>
          Topics scheduled for review based on how well you know them. Reviewing at the right time locks in long-term retention.
        </p>
      </div>

      {/* Summary bar */}
      {(dueItems.length > 0 || upcomingItems.length > 0) && (
        <div style={{
          display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: dueItems.length > 0 ? 'rgba(220,38,38,0.06)' : D.card, border: `1px solid ${dueItems.length > 0 ? 'rgba(220,38,38,0.2)' : D.border}` }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: dueItems.length > 0 ? D.red : D.dim }}>{dueItems.length}</span>
            <span style={{ fontSize: 12, color: dueItems.length > 0 ? '#7F1D1D' : D.dim, fontWeight: 600, lineHeight: 1.3 }}>Due<br/>now</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: D.card, border: `1px solid ${D.border}` }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: D.amber }}>{upcomingItems.length}</span>
            <span style={{ fontSize: 12, color: D.muted, fontWeight: 600, lineHeight: 1.3 }}>Coming<br/>up (7d)</span>
          </div>
          {dueItems.length > 0 && (
            <button
              onClick={() => { track('review_queue_drill_all'); onOpenBrainDump?.() }}
              style={{
                marginLeft: 'auto', alignSelf: 'center',
                padding: '10px 20px', background: D.blue,
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                boxShadow: `0 3px 12px rgba(59,97,196,0.3)`,
              }}
            >
              Drill all due now
            </button>
          )}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Tab pills */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 9, padding: 3 }}>
          {[
            { id: 'due', label: `Due (${dueItems.length})` },
            { id: 'upcoming', label: `Coming up (${upcomingItems.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? '#FFFFFF' : 'transparent',
                color: tab === t.id ? D.text : D.muted,
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Course filter */}
        {courses?.length > 1 && (
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            style={{
              fontSize: 12.5, color: D.muted, background: D.card,
              border: `1px solid ${D.border}`, borderRadius: 8, padding: '6px 10px',
              cursor: 'pointer', outline: 'none',
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
      <div style={{ background: D.card, borderRadius: 16, border: `1px solid ${D.border}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        {displayed.length === 0 ? (
          <div style={{ padding: '52px 24px', textAlign: 'center' }}>
            {tab === 'due' ? (
              <>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="24" height="24" fill="none" stroke={D.green} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: D.text, margin: '0 0 6px' }}>You're all caught up</h3>
                <p style={{ fontSize: 13.5, color: D.muted, margin: 0 }}>No topics are due for review right now. Check back later or do a Brain Dump to add new topics.</p>
              </>
            ) : (
              <>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `rgba(59,97,196,0.08)`, border: `1px solid rgba(59,97,196,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="24" height="24" fill="none" stroke={D.blue} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: D.text, margin: '0 0 6px' }}>Nothing scheduled yet</h3>
                <p style={{ fontSize: 13.5, color: D.muted, margin: 0 }}>Complete Brain Dumps and quizzes to build your review schedule.</p>
              </>
            )}
          </div>
        ) : (
          displayed.map((item, i) => (
            <TopicRow
              key={`${item.topic}-${item.courseId}-${i}`}
              item={item}
              isDue={tab === 'due'}
              onDrill={handleDrill}
              onQuiz={handleQuiz}
            />
          ))
        )}
      </div>

      {/* How it works callout */}
      <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 12, background: 'rgba(59,97,196,0.04)', border: '1px solid rgba(59,97,196,0.12)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: D.blue, margin: '0 0 4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>How this works</p>
        <p style={{ fontSize: 12.5, color: D.muted, margin: 0, lineHeight: 1.6 }}>
          Review intervals are calculated from your mastery score. Weak topics come back in 1 day, developing in 2-4 days, strong in 7 days. Each review updates your score and pushes the next review out.
        </p>
      </div>
    </div>
  )
}
