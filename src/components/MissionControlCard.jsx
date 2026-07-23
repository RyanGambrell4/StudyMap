import { useMemo } from 'react'
import { getWeakestTopics, getMasteryForCourse } from '../lib/masteryStore'
import { getStudyHistory } from '../lib/studyHistory'
import { getCoachMicroUpdates } from '../lib/coachMicroUpdates'
import { getDeckHealth } from '../lib/deckHealth'
import { getCurrentGrade } from '../utils/gradeCalc'

// MissionControlCard — the single hero card that surfaces everything
// Waves 1-3 wrote to. Rendered once per active course on the dashboard.
// Should feel like the app knows exactly where the student stands.
//
// - Exam countdown + projected grade vs target
// - Gaps closed this week (mastery delta)
// - Weakest topic
// - Deck-due count if any
// - "Start 15-min session" primary CTA → SessionBundle

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

function pastGaps(courseId, courseName) {
  // Find topics where the student moved up meaningfully in the last 7 days.
  const mastery = getMasteryForCourse(courseId ?? null)
  const closed = []
  const now = Date.now()
  for (const m of mastery) {
    if (!m.lastUpdated || now - m.lastUpdated > WEEK_MS) continue
    if (m.prevScore == null) continue
    const delta = m.score - m.prevScore
    if (m.prevScore < 70 && m.score >= 70 && delta >= 5) closed.push({ topic: m.topic, from: m.prevScore, to: m.score })
  }
  return closed.sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, 4)
}

function weekSessionCount(courseName) {
  const history = getStudyHistory()
  const cutoff = new Date(Date.now() - WEEK_MS).toISOString()
  return history.filter(s => s.date >= cutoff && (!courseName || s.courseName === courseName)).length
}

export default function MissionControlCard({
  course, todayStr, onStartBundle, onStartDiagnostic, onOpenQuizBurst,
}) {
  const cid = course?.id ?? null
  const mastery = useMemo(() => getMasteryForCourse(cid ?? null), [cid])
  const hasHistory = mastery.length > 0

  const weekClosed = useMemo(() => pastGaps(cid, course?.name), [cid, course?.name])
  const weakest = useMemo(() => getWeakestTopics(cid ?? null, 1)[0], [cid, mastery.length])
  const microUpdate = useMemo(() => getCoachMicroUpdates(cid ?? null, 1)[0], [cid])
  const deck = useMemo(() => getDeckHealth(), [mastery.length])
  const sessionCount = useMemo(() => weekSessionCount(course?.name), [course?.name])

  // Grade math — reuse the same projection logic as PracticeExamResults.
  const components = course?.gradeData?.components ?? []
  const currentGrade = components.length ? getCurrentGrade(components) : null
  const target = typeof course?.targetGrade === 'number' ? course.targetGrade : null

  // Exam countdown
  const daysUntilExam = course?.examDate
    ? Math.max(0, Math.ceil((new Date(course.examDate + 'T12:00:00') - Date.now()) / DAY_MS))
    : null

  const avgMastery = mastery.length
    ? Math.round(mastery.reduce((s, t) => s + t.score, 0) / mastery.length)
    : null

  // Zero-state → diagnostic prompt (Wave 4 core value)
  if (!hasHistory) {
    return (
      <div style={{
        padding: '20px 22px', borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(232,83,26,0.08) 0%, rgba(232,83,26,0.02) 100%)',
        border: '1px solid rgba(232,83,26,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: course?.color?.dot ?? '#E8531A' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6B6B6B' }}>{course?.name}</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#111', letterSpacing: -0.3, marginBottom: 4 }}>
          Unlock personalized study for this course
        </div>
        <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 14, lineHeight: 1.5 }}>
          Take a 3-min diagnostic so Quiz Burst, Cheat Sheet, and Study Coach start knowing what you know — instead of guessing for the first two weeks.
        </div>
        <button
          onClick={() => onStartDiagnostic?.(course)}
          style={{ padding: '11px 18px', background: '#E8531A', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(232,83,26,0.35)' }}
        >
          Start 3-min diagnostic →
        </button>
      </div>
    )
  }

  // Full mission-control card
  return (
    <div style={{
      padding: '20px 22px', borderRadius: 16,
      background: '#111111',
      color: '#fff',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(232,83,26,0.20)', filter: 'blur(50px)' }} />
      <div style={{ position: 'relative' }}>
        {/* Header line: course · exam · projection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: course?.color?.dot ?? '#E8531A' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{course?.name}</span>
          {daysUntilExam != null && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: daysUntilExam <= 7 ? '#F97316' : 'rgba(255,255,255,0.75)' }}>
                exam in {daysUntilExam}d
              </span>
            </>
          )}
          {currentGrade != null && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                grade {Math.round(currentGrade)}%
                {target != null && <> · target {target}%</>}
              </span>
            </>
          )}
        </div>

        {/* Headline */}
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, marginBottom: weekClosed.length ? 10 : 4, lineHeight: 1.2 }}>
          {weekClosed.length > 0
            ? <>Closed {weekClosed.length} gap{weekClosed.length === 1 ? '' : 's'} this week{sessionCount > 0 ? ` · ${sessionCount} session${sessionCount === 1 ? '' : 's'}` : ''}</>
            : sessionCount > 0
              ? <>{sessionCount} session{sessionCount === 1 ? '' : 's'} this week · avg mastery {avgMastery}%</>
              : <>No sessions yet this week</>
          }
        </div>

        {weekClosed.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {weekClosed.map(g => (
              <span key={g.topic} style={{
                fontSize: 11.5, padding: '3px 9px', borderRadius: 999,
                background: 'rgba(22,163,74,0.16)', color: '#4ADE80',
                border: '1px solid rgba(22,163,74,0.28)', fontWeight: 700,
              }}>
                {g.topic} {g.from}→{g.to}
              </span>
            ))}
          </div>
        )}

        {microUpdate && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            fontSize: 12.5, color: 'rgba(255,255,255,0.90)', lineHeight: 1.5,
          }}>
            <strong style={{ color: '#F97316', fontSize: 10.5, letterSpacing: '0.06em' }}>COACH · </strong>
            {microUpdate.line}
          </div>
        )}

        {weakest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', marginBottom: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: weakest.score < 40 ? '#F87171' : '#FBBF24', letterSpacing: -0.5, minWidth: 42 }}>
              {weakest.score}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.55)' }}>WEAKEST TOPIC</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{weakest.topic}</div>
            </div>
            {onOpenQuizBurst && (
              <button
                onClick={() => onOpenQuizBurst({ courseName: course?.name, topic: weakest.topic })}
                style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Quiz me →
              </button>
            )}
          </div>
        )}

        {deck.dueToday > 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
            {deck.dueToday} flashcard{deck.dueToday === 1 ? '' : 's'} due in your review deck.
          </div>
        )}

        <button
          onClick={onStartBundle}
          style={{
            width: '100%', padding: '13px',
            background: '#E8531A', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 3px 12px rgba(232,83,26,0.45)',
          }}
        >
          Start 15-min session {weakest ? `on ${weakest.topic}` : ''} →
        </button>
      </div>
    </div>
  )
}
