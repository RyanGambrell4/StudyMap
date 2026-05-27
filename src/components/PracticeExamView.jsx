import { useState } from 'react'
import { getCachedPracticeExams, savePracticeExam } from '../lib/db'
import PracticeExamSetup from './PracticeExamSetup'
import PracticeExamScreen from './PracticeExamScreen'
import PracticeExamResults from './PracticeExamResults'

const D = {
  bg: '#F7F6F3',
  text: '#1A1A1A',
  muted: '#6B6B6B',
  dim: '#9B9B9B',
  accent: '#3B61C4',
  border: 'rgba(0,0,0,0.07)',
}

export default function PracticeExamView({ courses = [], onShowPaywall }) {
  const [subview, setSubview] = useState('landing') // 'landing' | 'setup' | 'taking' | 'results'
  const [examCourse, setExamCourse] = useState(null)
  const [examQuestions, setExamQuestions] = useState([])
  const [examAnswers, setExamAnswers] = useState([])
  const [examTimeMs, setExamTimeMs] = useState(0)
  const [examTimerMinutes, setExamTimerMinutes] = useState(null)
  const [questionTimings, setQuestionTimings] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  // eslint-disable-next-line no-unused-vars
  const _bust = refreshKey

  const handleStart = ({ questions, courseName, courseId, timerMinutes }) => {
    setExamQuestions(questions)
    setExamAnswers(questions.map(() => ''))
    setExamTimerMinutes(timerMinutes ?? null)
    setSubview('taking')
  }

  const handleSubmit = ({ answers, timeMs, questionTimings: timings }) => {
    setExamAnswers(answers)
    setExamTimeMs(timeMs)
    setQuestionTimings(timings ?? [])
    setSubview('results')
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
    setQuestionTimings([])
    setSubview('taking')
  }

  const closeToLanding = () => {
    setSubview('landing')
    setExamCourse(null)
    setExamQuestions([])
    setExamAnswers([])
    setExamTimeMs(0)
    setExamTimerMinutes(null)
    setQuestionTimings([])
  }

  // ── Overlays (full-screen, rendered above everything) ──────────────────────
  if (subview === 'taking') {
    return (
      <PracticeExamScreen
        questions={examQuestions}
        courseName={examCourse?.name ?? null}
        timerMinutes={examTimerMinutes}
        onSubmit={handleSubmit}
        onExit={closeToLanding}
      />
    )
  }

  if (subview === 'results') {
    return (
      <PracticeExamResults
        questions={examQuestions}
        answers={examAnswers}
        timeMs={examTimeMs}
        questionTimings={questionTimings}
        courseId={examCourse?.id ?? null}
        courseName={examCourse?.name ?? null}
        onRetake={handleRetake}
        onClose={closeToLanding}
      />
    )
  }

  if (subview === 'setup') {
    return (
      <PracticeExamSetup
        courses={courses}
        onBack={() => setSubview('landing')}
        onStart={(payload) => {
          setExamCourse(payload.course)
          handleStart(payload)
        }}
        onShowPaywall={onShowPaywall}
      />
    )
  }

  // ── Landing page ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100%', background: D.bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px 80px' }}>
      <div style={{ width: '100%', maxWidth: 640 }}>

        {/* Label */}
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Strategy</p>

        {/* Hero card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 40px 36px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', border: `1px solid ${D.border}`, marginBottom: 16 }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 30, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Simulate your real exam.
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 15, color: D.muted, lineHeight: 1.6, maxWidth: 520 }}>
            See where you stand before it counts. Upload a past exam, paste your notes, or describe what's on it — we build a realistic look-alike with verbatim questions from your materials first, then AI fills the rest using your course data.
          </p>

          {/* Feature badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
            {[
              { icon: '📋', label: 'Verbatim questions first' },
              { icon: '⏱', label: 'Optional timer' },
              { icon: '📊', label: 'Weak area analysis' },
              { icon: '🎯', label: 'Personalized to your course' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: D.bg, border: `1px solid ${D.border}`, borderRadius: 999, fontSize: 12.5, fontWeight: 500, color: D.muted }}>
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {courses.length === 0 ? (
            /* Empty state */
            <div style={{ padding: '20px', background: '#FAFAF8', border: `1px dashed rgba(0,0,0,0.12)`, borderRadius: 12, textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: D.text }}>No courses set up yet</p>
              <p style={{ margin: 0, fontSize: 13, color: D.muted }}>Add a course first, then come back to generate a practice exam.</p>
            </div>
          ) : (
            <button
              onClick={() => setSubview('setup')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 24px', background: D.accent, border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Start Practice Exam
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>

        {/* How it works */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', border: `1px solid ${D.border}` }}>
          <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>How it works</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { n: '1', title: 'Pick your course', desc: 'Select the course you\'re preparing for.' },
              { n: '2', title: 'Give us your material', desc: 'Upload a past exam, paste notes, or describe what topics and format to expect.' },
              { n: '3', title: 'Take the exam', desc: 'We generate a realistic test. Submit when done to see your score and weak areas.' },
            ].map(({ n, title, desc }) => (
              <div key={n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(59,97,196,0.1)', color: D.accent, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 700, color: D.text }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: D.muted, lineHeight: 1.5 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
