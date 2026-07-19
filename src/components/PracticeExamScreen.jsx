import { useState, useEffect, useRef } from 'react'
import { track } from '../lib/analytics'

function fmtTime(seconds) {
  if (seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// onSubmit({ answers, timeMs, questionTimings }): hand off to results
// onExit(): bail without submitting
export default function PracticeExamScreen({ questions, courseName, timerMinutes, onSubmit, onExit }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState(() => questions.map(() => ''))
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(timerMinutes ? timerMinutes * 60 : null)
  const startedAt = useRef(Date.now())
  const submittedRef = useRef(false)
  // Per-question timing
  const questionStartRef = useRef(Date.now())
  const timingsRef = useRef(questions.map(() => 0)) // accumulated ms per question

  const total = questions.length
  const current = questions[idx]
  const answered = answers.filter(a => a && a.trim().length).length
  const allAnswered = answered === total

  const recordCurrentQuestionTime = () => {
    const elapsed = Date.now() - questionStartRef.current
    timingsRef.current = timingsRef.current.map((t, i) => i === idx ? t + elapsed : t)
    questionStartRef.current = Date.now()
  }

  const finalize = (override) => {
    if (submittedRef.current) return
    submittedRef.current = true
    recordCurrentQuestionTime()
    const questionTimings = questions.map((q, i) => ({ id: q.id ?? `q${i + 1}`, topic: q.topic ?? 'General', question: q.question, timeMs: timingsRef.current[i] ?? 0 }))
    const finalAnswers = override ?? answers
    const answeredCount = finalAnswers.filter(a => a && a.trim().length).length
    track('practice_exam_submitted', {
      questionCount: total,
      answeredCount,
      unansweredCount: total - answeredCount,
      timed: timerMinutes != null,
      timeElapsedSec: Math.round((Date.now() - startedAt.current) / 1000),
      courseName: courseName ?? null,
    })
    onSubmit({
      answers: finalAnswers,
      timeMs: Date.now() - startedAt.current,
      questionTimings,
    })
  }

  // Timer
  useEffect(() => {
    if (secondsLeft === null) return
    if (secondsLeft <= 0) { finalize(); return }
    const t = setInterval(() => setSecondsLeft(s => (s === null ? null : s - 1)), 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft])

  const navigateTo = (newIdx) => {
    recordCurrentQuestionTime()
    setIdx(newIdx)
  }

  // Keyboard nav
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' && idx < total - 1) navigateTo(idx + 1)
      if (e.key === 'ArrowLeft' && idx > 0) navigateTo(idx - 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total])

  const setAnswer = (val) => {
    setAnswers(a => a.map((cur, i) => (i === idx ? val : cur)))
  }

  const isMc = current?.type === 'multiple_choice' && Array.isArray(current.options)
  const progressPct = ((idx + 1) / total) * 100

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#F7F6F3', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <button onClick={() => { track('practice_exam_exited', { questionCount: total, answeredCount: answered, idx }); onExit() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6B6B', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: 4 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Exit
          </button>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Practice exam{courseName ? ` · ${courseName}` : ''}</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>Question {idx + 1} of {total}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {secondsLeft !== null && (
            <div style={{ background: secondsLeft < 60 ? '#fef2f2' : '#F7F6F3', border: `1px solid ${secondsLeft < 60 ? '#fecaca' : 'rgba(0,0,0,0.08)'}`, borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" fill="none" stroke={secondsLeft < 60 ? '#dc2626' : '#6B6B6B'} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13, color: secondsLeft < 60 ? '#dc2626' : '#1A1A1A' }}>{fmtTime(secondsLeft)}</span>
            </div>
          )}
          <span style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 600 }}>{answered}/{total} answered</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ width: `${progressPct}%`, height: '100%', background: '#3B61C4', transition: 'width 0.25s ease' }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 24px' }}>

          {current?.sourceType === 'verbatim' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '4px 10px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              From your materials
            </div>
          )}

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', margin: 0, lineHeight: 1.4 }}>{current?.question}</h2>

          {/* Options */}
          {isMc && (
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {current.options.map((opt, i) => {
                const isSelected = answers[idx] === opt
                return (
                  <button
                    key={i}
                    onClick={() => setAnswer(opt)}
                    style={{
                      padding: '16px 20px',
                      textAlign: 'left',
                      background: isSelected ? 'rgba(59,97,196,0.06)' : '#fff',
                      border: isSelected ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.10)',
                      borderRadius: 14,
                      cursor: 'pointer',
                      fontSize: 15,
                      color: '#1A1A1A',
                      fontWeight: isSelected ? 600 : 500,
                      lineHeight: 1.5,
                      transition: 'all 0.15s',
                      boxShadow: isSelected ? '0 1px 3px rgba(59,97,196,0.15)' : 'none',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {!isMc && (
            <textarea
              value={answers[idx]}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Type your answer…"
              style={{ marginTop: 24, width: '100%', minHeight: 180, padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(0,0,0,0.12)', fontSize: 15, color: '#1A1A1A', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }}
            />
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', background: '#fff', flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 24px' }}>

          {/* Dot map */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {questions.map((_, i) => {
              const isCurrent = i === idx
              const isAnswered = answers[i] && answers[i].trim().length > 0
              return (
                <button
                  key={i}
                  onClick={() => navigateTo(i)}
                  title={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}`}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: isCurrent ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.10)',
                    background: isAnswered ? (isCurrent ? '#3B61C4' : 'rgba(59,97,196,0.12)') : '#fff',
                    color: isAnswered ? (isCurrent ? '#fff' : '#3B61C4') : '#6B6B6B',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => navigateTo(Math.max(0, idx - 1))}
              disabled={idx === 0}
              style={{ padding: '10px 16px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: idx === 0 ? '#9B9B9B' : '#1A1A1A', fontWeight: 600, fontSize: 13, cursor: idx === 0 ? 'not-allowed' : 'pointer' }}
            >Previous</button>

            {idx < total - 1 ? (
              <button
                onClick={() => navigateTo(Math.min(total - 1, idx + 1))}
                style={{ padding: '10px 16px', background: '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >Next →</button>
            ) : (
              <button
                onClick={() => setShowSubmitConfirm(true)}
                style={{ padding: '10px 20px', background: '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >Submit exam</button>
            )}

            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={() => setShowSubmitConfirm(true)}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >Submit anyway</button>
            </div>
          </div>
        </div>
      </div>

      {/* Submit confirm dialog */}
      {showSubmitConfirm && (
        <div role="dialog" aria-modal="true" aria-label="Submit exam" style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>Submit your exam?</h3>
            <p style={{ margin: '8px 0 20px', color: '#6B6B6B', fontSize: 14, lineHeight: 1.55 }}>
              You've answered {answered} of {total} questions.{!allAnswered && ' Unanswered questions will be marked incorrect.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSubmitConfirm(false)} style={{ padding: '10px 16px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Keep going</button>
              <button onClick={() => finalize()} style={{ padding: '10px 20px', background: '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
