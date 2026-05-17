import { daysBetween } from '../utils/dateUtils'

const STATUS = {
  strong:     { label: 'Strong',     color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.25)'  },
  'on-track': { label: 'On Track',   color: '#3B61C4', bg: 'rgba(59,97,196,0.10)',  border: 'rgba(59,97,196,0.25)'  },
  'needs-work':{ label: 'Needs Work',color: '#D97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.25)'  },
  'at-risk':  { label: 'At Risk',    color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  border: 'rgba(220,38,38,0.25)'  },
  prompt:     { label: 'Run check',  color: '#9B9B9B', bg: 'rgba(0,0,0,0.04)',      border: 'rgba(0,0,0,0.10)'      },
}

export function computeReadiness(course, lastSession, todayStr) {
  if (!lastSession) return 'prompt'
  const daysSinceLast = daysBetween(lastSession.dateStr, todayStr)
  const daysUntilExam = course.examDate ? daysBetween(todayStr, course.examDate) : null

  if (daysUntilExam !== null && daysUntilExam <= 7 && daysSinceLast >= 3) return 'at-risk'
  if (daysUntilExam !== null && daysUntilExam <= 14 && daysSinceLast >= 5) return 'at-risk'
  if (daysSinceLast >= 7) return 'needs-work'
  if (daysUntilExam !== null && daysUntilExam <= 7) return 'needs-work'
  if (daysSinceLast <= 2 && (daysUntilExam === null || daysUntilExam > 14)) return 'strong'
  return 'on-track'
}

export const READINESS_CTA = {
  'at-risk':   'Run Rescue Plan',
  'needs-work':'Run Brain Dump',
  'on-track':  'Run Brain Dump',
  strong:      null,
  prompt:      '2 min check',
}

export default function ReadinessPill({ status, onAction, compact }) {
  const s = STATUS[status] ?? STATUS.prompt
  const hasCta = status !== 'strong'

  return (
    <span
      onClick={hasCta ? (e) => { e.stopPropagation(); onAction?.() } : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '2px 7px' : '3px 9px',
        borderRadius: 999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        cursor: hasCta ? 'pointer' : 'default',
        transition: 'opacity 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (hasCta) e.currentTarget.style.opacity = '0.78' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {status === 'at-risk' && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: s.color, display: 'inline-block', flexShrink: 0,
          animation: 'pill-pulse 1.8s ease-in-out infinite',
        }} />
      )}
      <span style={{
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        color: s.color,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}>
        {s.label}
      </span>
    </span>
  )
}
