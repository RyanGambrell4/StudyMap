import { useMemo, useState } from 'react'
import { getMasteryForCourse, getWeakestTopics } from '../lib/masteryStore'
import { clean } from '../utils/strings'
import { track } from '../lib/analytics'

const D = {
  bg:      '#FFFFFF',
  border:  'rgba(0,0,0,0.07)',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  crimson: '#DC2626',
  amber:   '#D97706',
  green:   '#16A34A',
  brand:   '#3B61C4',
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T12:00:00').getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((target - now) / 86400000))
}

// Composite readiness: mastery average blended with a coverage penalty
// (unstudied topics count against you). 0-100.
function computeCourseReadiness(courseId, syllabusTopicCount = 0) {
  const mastery = getMasteryForCourse(courseId).filter(m => m.score != null)
  if (mastery.length === 0) return { score: 0, avg: null, coverage: 0 }
  const avg = mastery.reduce((s, m) => s + m.score, 0) / mastery.length
  // Coverage: how many topics have been studied vs. the syllabus. If we
  // don't know the syllabus size, treat 8 as a reasonable target.
  const target = Math.max(syllabusTopicCount, 8)
  const coverage = Math.min(1, mastery.length / target)
  const score = Math.round(avg * 0.7 + coverage * 100 * 0.3)
  return { score, avg: Math.round(avg), coverage: Math.round(coverage * 100) }
}

function urgencyCopy(daysLeft, readiness) {
  if (daysLeft === 0) return `Exam day. Warm-up with your weakest topic, then trust the work.`
  if (daysLeft === 1) return `One day out. Skip new content — recall + fix your gaps.`
  if (daysLeft <= 3) {
    if (readiness < 60) return `${daysLeft} days out and readiness is thin. Focus every session on your weakest 3 topics.`
    return `${daysLeft} days out. Time to run practice exams under a clock.`
  }
  if (daysLeft <= 7) {
    if (readiness < 50) return `One week out. Cut breadth, go deep on the gaps.`
    return `One week out. Alternate practice exams with weak-topic drills.`
  }
  if (readiness < 40) return `${daysLeft} days out. Start now — momentum beats cramming.`
  return `${daysLeft} days out. Steady sessions now cost less than a panic later.`
}

export default function ExamCountdownCard({ courses = [], onStartFocus, onOpenExamRescue, onOpenPracticeExam, onOpenTeachItBack }) {
  const [dismissed, setDismissed] = useState(false)

  const nextExam = useMemo(() => {
    const withExam = (courses ?? [])
      .map((c, i) => ({ course: c, idx: i, days: daysUntil(c?.examDate) }))
      .filter(e => e.days !== null && e.days <= 14 && e.days >= 0)
      .sort((a, b) => a.days - b.days)
    return withExam[0] ?? null
  }, [courses])

  const readiness = useMemo(() => {
    if (!nextExam) return null
    const syllabusCount = nextExam.course?.syllabus?.topics?.length ?? 0
    return computeCourseReadiness(nextExam.idx, syllabusCount)
  }, [nextExam])

  const topWeak = useMemo(() => {
    if (!nextExam) return null
    const weak = getWeakestTopics(nextExam.idx, 1)
    return weak?.[0] ?? null
  }, [nextExam])

  if (!nextExam || dismissed) return null

  const { days } = nextExam
  const courseName = clean(nextExam.course?.name ?? 'this course')
  const rScore = readiness?.score ?? 0
  const rColor = rScore >= 75 ? D.green : rScore >= 55 ? D.amber : D.crimson
  const urgencyColor = days <= 3 ? D.crimson : days <= 7 ? D.amber : D.brand
  const urgencyLabel = days <= 3 ? 'Sprint week' : days <= 7 ? 'Home stretch' : 'On the clock'

  return (
    <div className="ec-card" style={{
      gridColumn: 'span 12',
      background: `linear-gradient(135deg, ${D.bg} 0%, ${urgencyColor}0A 100%)`,
      border: `1px solid ${urgencyColor}25`,
      borderLeft: `4px solid ${urgencyColor}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: `0 2px 8px ${urgencyColor}10, 0 1px 3px rgba(0,0,0,0.04)`,
      display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
      position: 'relative',
    }}>
      <style>{`
        @keyframes ec-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ec-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .ec-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .ec-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px ${urgencyColor}30; }
        .ec-btn:active { transform: scale(0.97); }
        .ec-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${urgencyColor}45; }
        .ec-ghost:hover { background: rgba(0,0,0,0.04); }
        .ec-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px ${urgencyColor}30; }
        .ec-dismiss:hover { background: rgba(0,0,0,0.05); }
        .ec-dismiss:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
        @media (max-width: 480px) {
          .ec-card { padding: 14px 16px !important; gap: 12px !important; }
          .ec-inner { gap: 12px !important; }
          .ec-body { min-width: 0 !important; flex: 1 1 100% !important; }
          .ec-actions { width: 100%; flex-wrap: wrap; }
          .ec-actions .ec-btn { flex: 1; justify-content: center; }
        }
      `}</style>

      <div className="ec-inner" style={{ animation: 'ec-fade 400ms cubic-bezier(0.16,1,0.3,1) both', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
        {/* Big countdown number */}
        <div style={{
          flexShrink: 0,
          minWidth: 92, minHeight: 92,
          padding: '10px 14px',
          borderRadius: 16,
          background: `linear-gradient(135deg, ${urgencyColor}, ${urgencyColor}dd)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 14px ${urgencyColor}45`,
          animation: days <= 1 ? 'ec-pulse 2.4s ease-in-out infinite' : 'none',
        }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
            {days === 0 ? 'Today' : days}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4 }}>
            {days === 0 ? '' : days === 1 ? 'day left' : 'days left'}
          </div>
        </div>

        {/* Text */}
        <div className="ec-body" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: urgencyColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Exam countdown · {urgencyLabel}
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: D.text, letterSpacing: '-0.015em', lineHeight: 1.3, marginBottom: 6 }}>
            {courseName}
          </div>
          <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, maxWidth: 480, marginBottom: 8 }}>
            {urgencyCopy(days, rScore)}
          </div>
          {/* Readiness pill row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', background: `${rColor}12`, border: `1px solid ${rColor}30`,
              borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: rColor,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: rColor }}/>
              Readiness {rScore}%
            </div>
            {topWeak && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: D.muted,
                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={topWeak.topic}>
                Weakest: <span style={{ color: D.text, fontWeight: 700, textTransform: 'capitalize' }}>{topWeak.topic}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="ec-actions" style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center', alignItems: 'center' }}>
          <button
            className="ec-btn"
            onClick={() => {
              track('exam_countdown_start', { courseId: nextExam.idx, days, readiness: rScore })
              if (days <= 3 && onOpenExamRescue) { onOpenExamRescue(nextExam.idx); return }
              if (days <= 7 && onOpenPracticeExam) { onOpenPracticeExam(nextExam.idx); return }
              onStartFocus?.()
            }}
            style={{
              minHeight: 42, padding: '0 18px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `linear-gradient(135deg, ${urgencyColor}, ${urgencyColor}dd)`,
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: `0 3px 12px ${urgencyColor}35`,
              letterSpacing: '-0.005em', whiteSpace: 'nowrap',
            }}
          >
            {days <= 3 && onOpenExamRescue
              ? 'Rescue plan'
              : days <= 7 && onOpenPracticeExam
                ? 'Practice exam'
                : 'Study now'}
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {topWeak && onOpenTeachItBack && (
            <button
              className="ec-btn"
              onClick={() => { track('exam_countdown_teach_it_back', { courseId: nextExam.idx, topic: topWeak.topic, days }); onOpenTeachItBack({ courseIdx: nextExam.idx, topic: topWeak.topic }) }}
              style={{
                minHeight: 42, padding: '0 14px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(124,58,237,0.07)', color: '#7C3AED',
                border: '1px solid rgba(124,58,237,0.22)', borderRadius: 10,
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Teach It Back
            </button>
          )}
          <button
            className="ec-dismiss"
            onClick={() => { track('exam_countdown_dismiss', { courseId: nextExam.idx, days }); setDismissed(true) }}
            title="Hide until tomorrow"
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
