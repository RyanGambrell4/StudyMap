import { useState } from 'react'
import { getCachedPracticeExams, savePracticeExam } from '../lib/db'
import PracticeExamModal from './PracticeExamModal'
import PracticeExamScreen from './PracticeExamScreen'
import PracticeExamResults from './PracticeExamResults'

const D = {
  bg: '#F7F6F3',
  bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A',
  muted: '#6B6B6B',
  dim: '#9B9B9B',
  accent: '#3B61C4',
  mint: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
}

function fmtDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score) {
  if (score === null || score === undefined) return D.muted
  if (score >= 70) return D.mint
  if (score >= 50) return D.amber
  return D.red
}

export default function PracticeExamView({ courses = [], onShowPaywall }) {
  const [examPhase, setExamPhase] = useState('idle') // 'idle' | 'configure' | 'taking' | 'results'
  const [examCourse, setExamCourse] = useState(null)
  const [examQuestions, setExamQuestions] = useState([])
  const [examAnswers, setExamAnswers] = useState([])
  const [examTimeMs, setExamTimeMs] = useState(0)
  const [examTimerMinutes, setExamTimerMinutes] = useState(null)
  // refresh counter to force re-render of the history list after saving
  const [refreshKey, setRefreshKey] = useState(0)

  const openExam = (course) => {
    setExamCourse(course)
    setExamPhase('configure')
  }

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

  const handleRetake = () => {
    setExamAnswers(examQuestions.map(() => ''))
    setExamTimeMs(0)
    setExamPhase('taking')
  }

  const handleReplay = (course, exam) => {
    setExamCourse(course)
    setExamQuestions(exam.questions)
    setExamAnswers(exam.answers ?? exam.questions.map(() => ''))
    setExamTimeMs(exam.timeMs ?? 0)
    setExamPhase('results')
  }

  const closeExam = () => {
    setExamPhase('idle')
    setExamCourse(null)
    setExamQuestions([])
    setExamAnswers([])
    setExamTimeMs(0)
    setExamTimerMinutes(null)
  }

  const parseName = (name) => {
    const idx = name.indexOf(':')
    if (idx > 0) return { code: name.slice(0, idx).trim(), title: name.slice(idx + 1).trim() }
    return { code: null, title: name }
  }

  // Pull recent exams once per render. refreshKey ensures we re-read after a save.
  // eslint-disable-next-line no-unused-vars
  const _bust = refreshKey

  return (
    <div className="sc-page-pad" style={{ padding: '24px 32px 48px', overflowX: 'hidden', maxWidth: '100vw' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Strategy</p>
        <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: D.text, letterSpacing: '-0.01em' }}>Practice Exams</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: D.muted, lineHeight: 1.5, maxWidth: 640 }}>
          Drop in a past exam, notes, or slides and we'll build a realistic look-alike practice test. Verbatim questions from your materials come first; AI generates the rest to match the style.
        </p>
      </div>

      {/* No courses yet */}
      {courses.length === 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, color: D.muted }}>Add a course first — then come back here to generate a practice exam for it.</p>
        </div>
      )}

      {/* Course grid */}
      {courses.length > 0 && (
        <div className="sc-plans-cards">
          {courses.map((course, idx) => {
            const { code, title } = parseName(course.name)
            const dot = course.color?.dot || D.accent
            const exams = getCachedPracticeExams(course.id ?? idx)
            const lastExam = exams[0]
            return (
              <div key={course.id ?? idx} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code || title}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: D.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{code ? title : ''}</div>
                  </div>
                  {lastExam && lastExam.score !== null && lastExam.score !== undefined && (
                    <div style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(lastExam.score) }}>Last: {lastExam.score}%</span>
                    </div>
                  )}
                </div>

                {exams.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {exams.slice(0, 3).map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => handleReplay(course, ex)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${D.border}`, background: '#FAFAF8', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                      >
                        <span style={{ fontSize: 12.5, color: D.muted }}>{fmtDate(ex.takenAt)}</span>
                        <span style={{ fontSize: 12.5, color: D.dim }}>{ex.questions?.length ?? '—'} Qs</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: scoreColor(ex.score) }}>{ex.score !== null && ex.score !== undefined ? `${ex.score}%` : '—'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: D.dim, lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
                    No practice exams yet. Drop a past exam or your notes and we'll build one.
                  </p>
                )}

                <button
                  onClick={() => openExam(course)}
                  style={{ marginTop: 'auto', padding: '10px 14px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {exams.length > 0 ? 'New Practice Exam' : 'Take Practice Exam'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Overlays */}
      {examPhase === 'configure' && (
        <PracticeExamModal
          course={examCourse}
          onStart={handleStart}
          onClose={closeExam}
          onShowPaywall={onShowPaywall}
        />
      )}
      {examPhase === 'taking' && (
        <PracticeExamScreen
          questions={examQuestions}
          courseName={examCourse?.name ?? null}
          timerMinutes={examTimerMinutes}
          onSubmit={handleSubmit}
          onExit={closeExam}
        />
      )}
      {examPhase === 'results' && (
        <PracticeExamResults
          questions={examQuestions}
          answers={examAnswers}
          timeMs={examTimeMs}
          courseName={examCourse?.name ?? null}
          onRetake={handleRetake}
          onClose={closeExam}
        />
      )}
    </div>
  )
}
