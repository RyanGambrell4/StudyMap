import { useState } from 'react'
import { getCachedPracticeExams, savePracticeExam } from '../lib/db'
import PracticeExamModal from './PracticeExamModal'
import PracticeExamScreen from './PracticeExamScreen'
import PracticeExamResults from './PracticeExamResults'

const D = {
  bg: '#F7F6F3',
  bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#1A1A1A',
  muted: '#6B6B6B',
  dim: '#9B9B9B',
  accent: '#3B61C4',
  mint: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function scoreColor(score) {
  if (score === null || score === undefined) return D.dim
  if (score >= 70) return D.mint
  if (score >= 50) return D.amber
  return D.red
}

function ScoreRing({ score }) {
  if (score === null || score === undefined) return null
  const color = scoreColor(score)
  const r = 18
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <svg width="48" height="48" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{score}%</span>
      </div>
    </div>
  )
}

export default function PracticeExamView({ courses = [], onShowPaywall }) {
  const [examPhase, setExamPhase] = useState('idle')
  const [examCourse, setExamCourse] = useState(null)
  const [examQuestions, setExamQuestions] = useState([])
  const [examAnswers, setExamAnswers] = useState([])
  const [examTimeMs, setExamTimeMs] = useState(0)
  const [examTimerMinutes, setExamTimerMinutes] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const openExam = (course) => { setExamCourse(course); setExamPhase('configure') }

  const handleStart = ({ questions, timerMinutes }) => {
    setExamQuestions(questions)
    setExamAnswers(questions.map(() => ''))
    setExamTimerMinutes(timerMinutes ?? null)
    setExamPhase('taking')
  }

  const handleSubmit = ({ answers, timeMs }) => {
    setExamAnswers(answers)
    setExamTimeMs(timeMs)
    setExamPhase('results')
    try {
      const courseId = examCourse?.id ?? null
      if (courseId !== null) {
        const correct = examQuestions.reduce((n, q, i) => {
          if (q.type !== 'multiple_choice') return n
          return answers[i] === q.answer ? n + 1 : n
        }, 0)
        const mcCount = examQuestions.filter(q => q.type === 'multiple_choice').length
        const score = mcCount > 0 ? Math.round((correct / mcCount) * 100) : null
        savePracticeExam(courseId, {
          id: `exam_${Date.now()}`,
          takenAt: Date.now(),
          courseName: examCourse?.name ?? null,
          questions: examQuestions,
          answers,
          score,
          timeMs,
        }).then(() => setRefreshKey(k => k + 1))
      }
    } catch (e) { console.error('savePracticeExam failed', e) }
  }

  const handleRetake = () => { setExamAnswers(examQuestions.map(() => '')); setExamTimeMs(0); setExamPhase('taking') }

  const handleReplay = (course, exam) => {
    setExamCourse(course)
    setExamQuestions(exam.questions)
    setExamAnswers(exam.answers ?? exam.questions.map(() => ''))
    setExamTimeMs(exam.timeMs ?? 0)
    setExamPhase('results')
  }

  const closeExam = () => {
    setExamPhase('idle'); setExamCourse(null)
    setExamQuestions([]); setExamAnswers([])
    setExamTimeMs(0); setExamTimerMinutes(null)
  }

  const parseName = (name) => {
    const idx = name.indexOf(':')
    if (idx > 0) return { code: name.slice(0, idx).trim(), title: name.slice(idx + 1).trim() }
    return { code: null, title: name }
  }

  // eslint-disable-next-line no-unused-vars
  const _bust = refreshKey

  return (
    <div style={{ padding: '28px 32px 56px', overflowX: 'hidden', maxWidth: '100vw' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Strategy</p>
          <h1 style={{ margin: '3px 0 6px', fontSize: 24, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>Practice Exams</h1>
          <p style={{ margin: 0, fontSize: 13.5, color: D.muted, lineHeight: 1.5, maxWidth: 520 }}>
            Upload a past exam or notes — we extract verbatim questions first, then AI builds the rest.
          </p>
        </div>
        {courses.length > 0 && (
          <div style={{ flexShrink: 0, padding: '6px 12px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>{courses.length} course{courses.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {courses.length === 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,97,196,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="22" height="22" fill="none" stroke={D.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: D.text }}>No courses yet</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: D.muted }}>Add a course first, then come back to generate practice exams.</p>
        </div>
      )}

      {/* Course grid */}
      {courses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {courses.map((course, idx) => {
            const { code, title } = parseName(course.name)
            const dot = course.color?.dot || D.accent
            const exams = getCachedPracticeExams(course.id ?? idx)
            const lastExam = exams[0]
            const bestScore = exams.reduce((best, ex) => {
              if (ex.score === null || ex.score === undefined) return best
              return best === null ? ex.score : Math.max(best, ex.score)
            }, null)

            return (
              <div
                key={course.id ?? idx}
                style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: exams.length > 0 ? 16 : 20 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{code || title}</span>
                    </div>
                    {code && (
                      <div style={{ fontSize: 15, fontWeight: 700, color: D.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{title}</div>
                    )}
                  </div>
                  <ScoreRing score={bestScore} />
                </div>

                {/* Exam history */}
                {exams.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                    {exams.slice(0, 3).map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => handleReplay(course, ex)}
                        style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '7px 10px', borderRadius: 9, border: `1px solid ${D.border}`, background: '#FAFAF8', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F3F2EF'}
                        onMouseLeave={e => e.currentTarget.style.background = '#FAFAF8'}
                      >
                        <span style={{ fontSize: 12, color: D.muted, flex: 1 }}>{fmtDate(ex.takenAt)}</span>
                        <span style={{ fontSize: 12, color: D.dim, marginRight: 10 }}>{ex.questions?.length ?? '—'}Q</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(ex.score), minWidth: 32, textAlign: 'right' }}>
                          {ex.score !== null && ex.score !== undefined ? `${ex.score}%` : '—'}
                        </span>
                        <svg width="12" height="12" fill="none" stroke={D.dim} strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: 6, flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ flex: 1, marginBottom: 16, padding: '14px', borderRadius: 10, background: '#FAFAF8', border: `1px dashed rgba(0,0,0,0.1)`, textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 12.5, color: D.dim, lineHeight: 1.5 }}>No exams yet</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(0,0,0,0.28)', lineHeight: 1.4 }}>Upload notes or a past exam to get started</p>
                  </div>
                )}

                {/* CTA */}
                <button
                  onClick={() => openExam(course)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                  {exams.length > 0 ? 'New Exam' : 'Take Practice Exam'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Overlays */}
      {examPhase === 'configure' && (
        <PracticeExamModal course={examCourse} onStart={handleStart} onClose={closeExam} onShowPaywall={onShowPaywall} />
      )}
      {examPhase === 'taking' && (
        <PracticeExamScreen questions={examQuestions} courseName={examCourse?.name ?? null} timerMinutes={examTimerMinutes} onSubmit={handleSubmit} onExit={closeExam} />
      )}
      {examPhase === 'results' && (
        <PracticeExamResults questions={examQuestions} answers={examAnswers} timeMs={examTimeMs} courseName={examCourse?.name ?? null} onRetake={handleRetake} onClose={closeExam} />
      )}
    </div>
  )
}
