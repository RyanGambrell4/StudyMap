import { useState, useMemo, useEffect } from 'react'
import { getAllMastery, getMasteryColor, getMasteryLevel, getMasteryTrend, getMasterySummary } from '../lib/masteryStore'
import { clean } from '../utils/strings'
import { track } from '../lib/analytics'

const D = {
  bg:     '#F7F6F3',
  bgCard: '#FFFFFF',
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
  if (!ts) return null
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(diff / 3600000)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(diff / 86400000)
  return `${days}d ago`
}

const SOURCE_LABELS = {
  brainDump: 'Brain Dump',
  teachItBack: 'Teach It Back',
  quiz: 'Quiz',
  flashcard: 'Flashcards',
  practiceExam: 'Practice Exam',
}

function TrendArrow({ trend }) {
  if (!trend || trend === 'flat') return null
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      {trend === 'up'
        ? <path d="M3 8l3-4 3 4" stroke={D.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        : <path d="M3 4l3 4 3-4" stroke={D.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      }
    </svg>
  )
}

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 999, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%',
        width: `${score}%`,
        background: color,
        borderRadius: 999,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

function TopicCard({ entry, onDrill, onTeachItBack, idx }) {
  const [hovered, setHovered] = useState(false)
  const color = getMasteryColor(entry.score)
  const level = getMasteryLevel(entry.score)
  const trend = getMasteryTrend(entry)
  const ago = timeAgo(entry.lastUpdated)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: D.bgCard,
        border: `1px solid ${hovered ? `${color}30` : D.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: hovered ? `0 4px 20px ${color}12` : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        display: 'flex', flexDirection: 'column', gap: 10,
        position: 'relative', overflow: 'hidden',
        animation: `mmv-card 280ms ease ${Math.min(idx ?? 0, 12) * 45}ms both`,
      }}
    >
      {/* Level badge */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        padding: '3px 9px',
        background: `${color}12`,
        borderBottomLeftRadius: 8,
        borderTopRightRadius: 12,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color,
      }}>
        {level}
      </div>

      {/* Header */}
      <div style={{ paddingRight: 60 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: D.text, lineHeight: 1.3 }}>
          {entry.topic}
        </p>
        {entry.courseId && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: D.dim }}>{entry.courseId}</p>
        )}
      </div>

      {/* Score row */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }}>
            {entry.score}%
          </span>
          <TrendArrow trend={trend} />
          {entry.prevScore != null && trend !== 'flat' && (
            <span style={{ fontSize: 11, color: D.dim }}>
              from {entry.prevScore}%
            </span>
          )}
        </div>
        <ScoreBar score={entry.score} color={color} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {entry.source && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: D.dim, background: 'rgba(0,0,0,0.05)', borderRadius: 5, padding: '2px 7px' }}>
              {SOURCE_LABELS[entry.source] ?? entry.source}
            </span>
          )}
          {entry.count > 1 && (
            <span style={{ fontSize: 10.5, color: D.dim }}>{entry.count} sessions</span>
          )}
          {ago && <span style={{ fontSize: 10.5, color: D.dim }}>{ago}</span>}
        </div>

        {hovered && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onDrill?.(entry.topic)}
              className="mastery-action-btn"
              style={{
                fontSize: 11.5, fontWeight: 700, color: D.blue,
                background: 'rgba(59,97,196,0.08)', border: `1px solid rgba(59,97,196,0.2)`,
                borderRadius: 7, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Drill this
            </button>
            {entry.score < 75 && onTeachItBack && (
              <button
                onClick={() => onTeachItBack?.(entry.topic, entry.courseId)}
                className="mastery-action-btn"
                style={{
                  fontSize: 11.5, fontWeight: 700, color: '#7C3AED',
                  background: 'rgba(124,58,237,0.08)', border: `1px solid rgba(124,58,237,0.2)`,
                  borderRadius: 7, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                Teach It
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onStartBrainDump }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: 'rgba(59,97,196,0.08)',
        border: '1px solid rgba(59,97,196,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={D.blue} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/>
          <path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/>
        </svg>
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: D.text }}>Your knowledge map is empty</h3>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: D.muted, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Every Brain Dump, Teach It Back session, and quiz adds a topic to your map. Start one now to see where you stand.
      </p>
      <button
        onClick={onStartBrainDump}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', background: D.blue, color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 16px rgba(59,97,196,0.3)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>
        Do your first Brain Dump
      </button>
    </div>
  )
}

const SORT_OPTIONS = [
  { id: 'score-asc',  label: 'Weakest first' },
  { id: 'score-desc', label: 'Strongest first' },
  { id: 'recent',     label: 'Most recent' },
  { id: 'sessions',   label: 'Most practiced' },
]

const FILTER_OPTIONS = [
  { id: 'all',        label: 'All topics' },
  { id: 'weak',       label: 'Weak' },
  { id: 'developing', label: 'Developing' },
  { id: 'strong',     label: 'Strong' },
]

export default function MasteryMapView({ courses, onOpenBrainDump, onDrillTopic, onOpenTeachItBack }) {
  const [sort, setSort] = useState('score-asc')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('all')
  const [data, setData] = useState([])

  useEffect(() => {
    track('mastery_map_viewed')
    setData(getAllMastery())
  }, [])

  const summary = useMemo(() => {
    if (!data.length) return null
    const avg = Math.round(data.reduce((s, m) => s + m.score, 0) / data.length)
    return {
      total: data.length,
      avg,
      strong: data.filter(m => m.score >= 70).length,
      developing: data.filter(m => m.score >= 40 && m.score < 70).length,
      weak: data.filter(m => m.score < 40).length,
    }
  }, [data])

  const courseNames = useMemo(() => {
    const names = new Set(data.map(m => m.courseId).filter(Boolean))
    return ['all', ...names]
  }, [data])

  const filtered = useMemo(() => {
    let items = [...data]

    if (selectedCourse !== 'all') {
      items = items.filter(m => String(m.courseId) === selectedCourse)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(m => m.topic.toLowerCase().includes(q))
    }
    if (filter !== 'all') {
      items = items.filter(m => getMasteryLevel(m.score) === filter)
    }

    switch (sort) {
      case 'score-asc':  return items.sort((a, b) => a.score - b.score)
      case 'score-desc': return items.sort((a, b) => b.score - a.score)
      case 'recent':     return items.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))
      case 'sessions':   return items.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      default:           return items
    }
  }, [data, selectedCourse, search, filter, sort])

  const handleDrill = (topic) => {
    track('mastery_map_drill_clicked', { topic })
    onDrillTopic?.(topic)
    onOpenBrainDump?.()
  }

  const handleTeachItBack = (topic, courseId) => {
    track('mastery_map_teach_it_back_clicked', { topic })
    const idx = (courses ?? []).findIndex(c => (c.name ?? '').toLowerCase() === (courseId ?? '').toLowerCase())
    onOpenTeachItBack?.({ courseIdx: idx >= 0 ? idx : 0, topic })
  }

  return (
    <div style={{ minHeight: '100vh', background: D.bg, animation: 'mmv-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes mmv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mmv-card { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .mastery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
        @media (max-width: 600px) { .mastery-grid { grid-template-columns: 1fr; } }
        .mastery-filter-btn { background: none; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .mastery-filter-btn.active { background: #3B61C4; color: #fff; border-color: #3B61C4; }
        .mastery-sort-btn { background: none; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; color: #6B6B6B; transition: all 0.15s; white-space: nowrap; }
        .mastery-sort-btn.active { border-color: #3B61C4; color: #3B61C4; background: rgba(59,97,196,0.06); }
        .mastery-action-btn { transition: transform 0.1s !important; }
        .mastery-action-btn:active { transform: scale(0.93) !important; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '28px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.blue, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, opacity: 0.8 }}>
              Knowledge Map
            </div>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, fontWeight: 400, margin: 0, letterSpacing: -0.5, lineHeight: 1.15, color: D.text }}>
              What you know<span style={{ color: D.blue }}>.</span>
            </h1>
            <p style={{ fontSize: 14, color: D.muted, margin: '6px 0 0' }}>
              Built from your Brain Dumps, quizzes, and Teach It Back sessions.
            </p>
          </div>

          {summary && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Topics tracked', value: summary.total, color: D.blue },
                { label: 'Avg mastery', value: `${summary.avg}%`, color: summary.avg >= 70 ? D.green : summary.avg >= 40 ? D.amber : D.red },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: D.bgCard, border: `1px solid ${D.border}`,
                  borderRadius: 10, padding: '10px 16px', textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress bar across mastery levels */}
        {summary && (
          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, height: 8, display: 'flex', borderRadius: 999, overflow: 'hidden', background: 'rgba(0,0,0,0.06)' }}>
              <div style={{ width: `${(summary.strong / summary.total) * 100}%`, background: D.green, transition: 'width 0.6s ease' }} />
              <div style={{ width: `${(summary.developing / summary.total) * 100}%`, background: D.amber, transition: 'width 0.6s ease' }} />
              <div style={{ width: `${(summary.weak / summary.total) * 100}%`, background: D.red, transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Strong', count: summary.strong, color: D.green },
                { label: 'Developing', count: summary.developing, color: D.amber },
                { label: 'Weak', count: summary.weak, color: D.red },
              ].map(({ label, count, color }) => (
                <span key={label} style={{ fontSize: 11.5, color: D.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                  <strong style={{ color, fontWeight: 700 }}>{count}</strong> {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {data.length > 0 && (
        <div style={{ padding: '16px 32px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Search + course filter */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search topics..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 12px 8px 30px',
                  border: `1px solid ${D.border}`, borderRadius: 9,
                  fontSize: 13, color: D.text, background: D.bgCard,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            {courseNames.length > 2 && (
              <select
                value={selectedCourse}
                onChange={e => setSelectedCourse(e.target.value)}
                style={{
                  padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: 9,
                  fontSize: 13, color: D.text, background: D.bgCard,
                  fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="all">All courses</option>
                {courseNames.filter(n => n !== 'all').map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
          </div>

          {/* Filter + sort row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTER_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  className={`mastery-filter-btn${filter === id ? ' active' : ''}`}
                  onClick={() => setFilter(id)}
                  style={{ color: filter === id ? '#fff' : D.muted }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: D.dim }}>Sort:</span>
              {SORT_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  className={`mastery-sort-btn${sort === id ? ' active' : ''}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: '16px 32px 80px' }}>
        {data.length === 0 ? (
          <EmptyState onStartBrainDump={onOpenBrainDump} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: D.dim, fontSize: 14 }}>
            No topics match your filters.
          </div>
        ) : (
          <div className="mastery-grid">
            {filtered.map((entry, idx) => (
              <TopicCard
                key={`${entry.courseId}::${entry.topic}`}
                entry={entry}
                idx={idx}
                onDrill={handleDrill}
                onTeachItBack={onOpenTeachItBack ? handleTeachItBack : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
