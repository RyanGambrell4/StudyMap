import { useMemo, useState } from 'react'
import { findCrossCourseConnections } from '../lib/crossCourse'
import { clean } from '../utils/strings'
import { track } from '../lib/analytics'

const D = {
  bgCard:  '#FFFFFF',
  border:  'rgba(0,0,0,0.07)',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  purple:  '#7C3AED',
  purpleSoft: 'rgba(124,58,237,0.08)',
}

function ConnectionSpine({ courses }) {
  // Two-course spine visual: node - line - node
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      {courses.slice(0, 2).map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            padding: '3px 9px',
            background: D.purpleSoft,
            border: `1px solid ${D.purple}25`,
            borderRadius: 6,
            fontSize: 11.5, fontWeight: 700, color: D.purple,
            letterSpacing: '-0.005em', whiteSpace: 'nowrap',
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{clean(c.courseName)}</div>
          {i === 0 && courses.length > 1 && (
            <div style={{
              width: 22, height: 2, background: D.purple, borderRadius: 1,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
                width: 8, height: 8, borderRadius: '50%', background: D.purple,
                boxShadow: `0 0 0 3px ${D.purpleSoft}`,
              }}/>
            </div>
          )}
        </div>
      ))}
      {courses.length > 2 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: D.purple, marginLeft: 4 }}>
          +{courses.length - 2}
        </span>
      )}
    </div>
  )
}

export default function CrossCourseCard({ courses = [], onOpenBrainDump, onOpenReviewQueue }) {
  const [dismissed, setDismissed] = useState(false)
  const connections = useMemo(() => findCrossCourseConnections(courses), [courses])
  const top = connections[0]

  if (!top || dismissed) return null

  const primaryTopic = top.courses[0].topic
  const description = `You are studying "${top.token}" in ${top.courses.length} classes. Drill it once and every one of them levels up.`

  return (
    <div style={{
      gridColumn: 'span 12',
      background: `linear-gradient(135deg, ${D.bgCard} 0%, rgba(124,58,237,0.04) 100%)`,
      border: `1px solid ${D.purple}22`,
      borderLeft: `4px solid ${D.purple}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: '0 2px 8px rgba(124,58,237,0.06), 0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex',
      gap: 18,
      alignItems: 'center',
      flexWrap: 'wrap',
      position: 'relative',
    }}>
      <style>{`
        @keyframes cc-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .cc-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .cc-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(124,58,237,0.28); }
        .cc-btn:active { transform: scale(0.97); }
        .cc-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(124,58,237,0.35); }
        .cc-dismiss:hover { background: rgba(0,0,0,0.05); }
        .cc-dismiss:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
      `}</style>

      <div style={{ animation: 'cc-fade 400ms cubic-bezier(0.16,1,0.3,1) both', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
        }}>
          <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="6"  cy="12" r="3"/>
            <circle cx="18" cy="12" r="3"/>
            <path d="M9 12h6"/>
          </svg>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: D.purple, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Cross-course connection
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: D.text, letterSpacing: '-0.015em', lineHeight: 1.3, marginBottom: 4, textTransform: 'capitalize' }}>
            {top.token}
            <span style={{ fontSize: 11.5, color: D.muted, fontWeight: 600, marginLeft: 8, textTransform: 'none' }}>
              avg {top.avgScore}%
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, maxWidth: 520 }}>
            {description}
          </div>
          <ConnectionSpine courses={top.courses}/>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center', alignItems: 'center' }}>
          <button
            className="cc-btn"
            onClick={() => { track('cross_course_drill', { token: top.token, courseCount: top.courses.length }); onOpenBrainDump?.() }}
            style={{
              minHeight: 40, padding: '0 16px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(124,58,237,0.3)',
              letterSpacing: '-0.005em', whiteSpace: 'nowrap',
            }}
          >
            Drill it once
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button
            className="cc-dismiss"
            onClick={() => { track('cross_course_dismiss', { token: top.token }); setDismissed(true) }}
            title="Dismiss"
            style={{
              width: 32, height: 32, minHeight: 32,
              background: 'transparent', border: 'none', borderRadius: 8,
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              color: D.dim,
              transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)',
            }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
