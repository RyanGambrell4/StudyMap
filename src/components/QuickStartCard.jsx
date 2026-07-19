import { useMemo } from 'react'
import { QUICK_PRESETS, pickTarget } from '../lib/quickStart'
import { track } from '../lib/analytics'
import { clean } from '../utils/strings'
import { getWeakestTopics } from '../lib/masteryStore'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  border:  'rgba(0,0,0,0.07)',
}

function PresetIcon({ id, color }) {
  const props = { width: 18, height: 18, fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' }
  if (id === 'recall') return <svg {...props}><path d="M9 12h.01M15 12h.01M9.5 15.5c.5.5 1.5 1 2.5 1s2-.5 2.5-1"/><circle cx="12" cy="12" r="10"/></svg>
  if (id === 'review') return <svg {...props}><path d="M3 12a9 9 0 019-9c2.5 0 4.8 1 6.4 2.6L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-9 9c-2.5 0-4.8-1-6.4-2.6L3 16"/><path d="M3 21v-5h5"/></svg>
  if (id === 'deep')   return <svg {...props}><path d="M12 2a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V5a3 3 0 013-3z"/></svg>
  if (id === 'exam')   return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  return null
}

export default function QuickStartCard({ courses = [], todayStr, onQuickStart, onOpenTeachItBack }) {
  // Precompute the target for each preset so we can show a helpful subtitle
  // (course + topic) on each button.
  const targets = useMemo(() => {
    const out = {}
    QUICK_PRESETS.forEach(p => { out[p.id] = pickTarget(p, courses, todayStr) })
    return out
  }, [courses, todayStr])

  if (!courses || courses.length === 0) return null

  return (
    <div className="qs-card" style={{
      gridColumn: 'span 12',
      background: D.bg,
      border: `1px solid ${D.border}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)',
      position: 'relative',
    }}>
      <style>{`
        @keyframes qs-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .qs-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1), background 150ms; }
        .qs-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
        .qs-btn:active { transform: scale(0.97); }
        .qs-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(59,97,196,0.35); }
        .qs-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 720px) { .qs-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 380px) { .qs-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ animation: 'qs-fade 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
              Study now · one-tap
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: D.text, letterSpacing: '-0.015em', lineHeight: 1.3 }}>
              Pick a time. We picked the topic.
            </div>
          </div>
        </div>

        <div className="qs-grid">
          {QUICK_PRESETS.map(p => {
            const target = targets[p.id]
            const subtitle = target?.topic
              ? `${clean(target.topic)}`
              : target?.courseName
                ? `${clean(target.courseName)}`
                : p.tagline
            return (
              <button
                key={p.id}
                className="qs-btn"
                onClick={() => {
                  track('quick_start_click', { preset: p.id, minutes: p.minutes, hasTarget: Boolean(target) })
                  onQuickStart?.(p)
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                  minHeight: 88, padding: '12px 14px',
                  background: '#FAFAF8',
                  border: `1px solid ${D.border}`,
                  borderRadius: 12,
                  cursor: 'pointer', fontFamily: 'inherit',
                  textAlign: 'left',
                  position: 'relative',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `${p.color}12`, border: `1px solid ${p.color}22`,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <PresetIcon id={p.id} color={p.color}/>
                </div>
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: D.text, letterSpacing: '-0.005em', lineHeight: 1.25 }}>
                    {p.label}
                  </div>
                  <div style={{
                    fontSize: 11.5, color: D.muted, marginTop: 2, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textTransform: target?.topic ? 'capitalize' : 'none',
                  }} title={subtitle}>
                    {subtitle}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {onOpenTeachItBack && (() => {
          const weak = getWeakestTopics(null, 1)[0]
          if (!weak || weak.score >= 75) return null
          const courseIdx = courses.findIndex(c => String(c.id) === String(weak.courseId))
          return (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: D.dim }}>Or:</span>
              <button
                onClick={() => { track('quick_start_teach_it_back', { topic: weak.topic }); onOpenTeachItBack({ courseIdx: Math.max(0, courseIdx), topic: weak.topic }) }}
                style={{ fontSize: 12.5, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
              >
                Teach It Back: {clean(weak.topic)} ({weak.score}%)
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
