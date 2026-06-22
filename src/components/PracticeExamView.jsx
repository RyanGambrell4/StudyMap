import { useState } from 'react'
import { getCachedPracticeExams, savePracticeExam } from '../lib/db'
import { getActivePlan, canUseFeature } from '../lib/subscription'
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
    <div style={{ minHeight: '100%', background: D.bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '44px 24px 80px' }}>
      <div style={{ width: '100%', maxWidth: 580 }}>

        {/* Section label */}
        <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Practice Exams</p>

        {/* Main card */}
        <div style={{ background: '#fff', borderRadius: 20, border: `1px solid ${D.border}`, overflow: 'hidden', marginBottom: 12 }}>

          {/* Header */}
          <div style={{ padding: '36px 36px 30px' }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 27, fontWeight: 800, color: D.text, letterSpacing: '-0.025em', lineHeight: 1.2 }}>
              Test yourself before it counts.
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: D.muted, lineHeight: 1.65, maxWidth: 460 }}>
              Generate a realistic exam from your own material. Find out exactly where you stand and what to fix before the real thing.
            </p>
          </div>

          {/* Features */}
          <div style={{ borderTop: `1px solid ${D.border}`, padding: '24px 36px', display: 'flex', flexDirection: 'column', gap: 15 }}>
            {[
              {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <path d="M14 2v6h6M9 13h6M9 17h4"/>
                  </svg>
                ),
                label: 'Pulls verbatim questions directly from your uploaded material',
              },
              {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 7v5l3 3"/>
                  </svg>
                ),
                label: 'Optional countdown timer with per-question time tracking',
              },
              {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 20V10M12 20V4M6 20v-6"/>
                  </svg>
                ),
                label: 'Instant score with a breakdown of your weakest areas',
              },
              {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a9 9 0 1 0 9 9"/>
                    <path d="M12 6v6l4 2"/>
                    <path d="M17 2l5 5-5 5"/>
                  </svg>
                ),
                label: 'Personalized using your course data, grades, and past exams',
              },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(59,97,196,0.07)', color: D.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {icon}
                </div>
                <span style={{ fontSize: 13.5, color: D.muted, lineHeight: 1.45 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ borderTop: `1px solid ${D.border}`, padding: '24px 36px' }}>
            {courses.length === 0 ? (
              <div style={{ padding: '16px 20px', background: D.bg, borderRadius: 10, border: `1px dashed rgba(0,0,0,0.11)` }}>
                <p style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 600, color: D.text }}>No courses added yet</p>
                <p style={{ margin: 0, fontSize: 13, color: D.muted }}>Add a course first, then come back to run a practice exam.</p>
              </div>
            ) : (() => {
              const plan = getActivePlan()
              const isPro = plan === 'pro' || plan === 'unlimited'
              const freeExamAllowed = !isPro && canUseFeature('practiceExam').allowed
              const canStart = isPro || freeExamAllowed
              return (
                <button
                  onClick={() => {
                    if (!canStart) { onShowPaywall?.('practice_exam'); return }
                    setSubview('setup')
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px 24px', background: D.accent, border: 'none', borderRadius: 11, color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.87'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {freeExamAllowed && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>1 Free</span>
                  )}
                  {!canStart && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pro</span>
                  )}
                  Start Practice Exam
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              )
            })()}
          </div>
        </div>

        {/* Steps row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, background: '#fff', borderRadius: 14, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
          {[
            { n: '1', title: 'Pick a course', desc: 'Select the course you are preparing for.' },
            { n: '2', title: 'Add your material', desc: 'Upload a past exam, paste notes, or describe the topics.' },
            { n: '3', title: 'Review results', desc: 'See your score, mistakes, and where to focus next.' },
          ].map(({ n, title, desc }, i) => (
            <div key={n} style={{ padding: '20px 22px', borderLeft: i > 0 ? `1px solid ${D.border}` : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: D.accent, letterSpacing: '0.04em', marginBottom: 6 }}>{n}</div>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: D.text, lineHeight: 1.3 }}>{title}</p>
              <p style={{ margin: 0, fontSize: 12, color: D.muted, lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
