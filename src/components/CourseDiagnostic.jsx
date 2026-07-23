import { useState } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { incrementAIQuery } from '../lib/subscription'
import { updateMastery } from '../lib/masteryStore'
import { addStudySession } from '../lib/studyHistory'
import { addCardsToDeck, cardFromQuizMiss } from '../lib/deckAdditions'
import { hydrateCourseContext } from '../lib/courseContext'
import { track } from '../lib/analytics'

// CourseDiagnostic — a 5-Q seed quiz that fires the first time a course has
// zero mastery data. Every answer writes to masteryStore so the rest of the
// app (smart defaults, dashboard hero, deck health, coach micro-updates)
// lights up immediately instead of falling back to "general course material"
// for the first two weeks of use.
//
// Same pattern as QuickQuizBurst but framed as an intro: no timer, gentler
// difficulty arc, always uses smart defaults, no confidence tap yet (that's
// a Wave-3 feature the student will meet later).

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

export default function CourseDiagnostic({
  course, learningStyle, yearLevel, firstName, schoolType, assignments = [],
  onClose, onComplete,
}) {
  const [step, setStep] = useState('intro') // 'intro' | 'loading' | 'quiz' | 'done'
  const [questions, setQuestions] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [answers, setAnswers] = useState([])
  const [error, setError] = useState('')

  async function startDiagnostic() {
    setStep('loading')
    setError('')
    track('course_diagnostic_started', { courseName: course?.name })
    try {
      const token = await getAccessToken()
      const courseContext = hydrateCourseContext(course, { firstName, yearLevel, learningStyle, schoolType, assignments })
      const res = await fetch('/api/quiz-burst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course?.name ?? 'unknown',
          courseContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Diagnostic failed')
      incrementAIQuery()
      setQuestions(data.questions ?? [])
      setQIdx(0)
      setAnswers([])
      setSelected(null)
      setConfirmed(false)
      setStep('quiz')
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setStep('intro')
    }
  }

  function pickAnswer(opt) {
    if (confirmed) return
    setSelected(opt)
    setConfirmed(true)
    const q = questions[qIdx]
    const correct = opt === q.answer
    const next = [...answers, { correct, opt, question: q }]
    setAnswers(next)
    setTimeout(() => {
      if (qIdx + 1 >= questions.length) finishDiagnostic(next)
      else { setQIdx(i => i + 1); setSelected(null); setConfirmed(false) }
    }, 900)
  }

  function finishDiagnostic(finalAnswers) {
    const score = Math.round((finalAnswers.filter(a => a.correct).length / questions.length) * 100)
    // Seed mastery per topic. This is the whole point — after this runs, the
    // student's next Quiz Burst / Cheat Sheet / Session Bundle actually knows
    // where they stand.
    finalAnswers.forEach(a => {
      const t = a.question?.topic?.trim()
      if (!t) return
      updateMastery(t, course?.id ?? null, a.correct ? 85 : 25, 'diagnostic')
    })
    addStudySession({ tool: 'Diagnostic', score, topic: null, courseName: course?.name || null })
    // Seed the deck with missed questions so day-1 users have a deck to work
    // from instead of the empty state.
    const missed = finalAnswers.filter(a => !a.correct).map(a => cardFromQuizMiss(a.question, course?.id ?? null, course?.name ?? null))
    if (missed.length) addCardsToDeck(missed).catch(() => {})
    window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'diagnostic' } }))
    track('course_diagnostic_complete', { score, courseName: course?.name })
    setStep('done')
  }

  const q = questions[qIdx]
  const correctCount = answers.filter(a => a.correct).length

  return (
    <div role="dialog" aria-modal="true" aria-label="Course diagnostic" style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 540,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden', animation: 'cd-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <style>{`@keyframes cd-in{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Course Diagnostic</div>
            <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>
              {step === 'quiz' && questions.length > 0 && `Question ${qIdx + 1} of ${questions.length} · ${correctCount} right so far`}
              {step === 'intro' && `Unlock personalized study for ${course?.name}`}
              {step === 'done' && `You're all set`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {step === 'intro' && (
          <div style={{ padding: 24, overflowY: 'auto' }}>
            <div style={{ padding: '20px', background: `linear-gradient(135deg, ${D.accent}0F 0%, ${D.accent}05 100%)`, border: `1px solid ${D.accent}33`, borderRadius: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: D.text, marginBottom: 4, letterSpacing: -0.3 }}>
                Take a 3-min diagnostic
              </div>
              <div style={{ fontSize: 13, color: D.textMuted, marginBottom: 0, lineHeight: 1.55 }}>
                5 questions on {course?.name}. Your answers seed your mastery data so every other feature — Quiz Burst, Cheat Sheet, Study Coach — starts personalized from day 1 instead of guessing for two weeks.
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>What we'll seed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: D.text }}>
                <div>· Mastery score per topic (dashboard mission control)</div>
                <div>· Weakest topic (smart-default focus)</div>
                <div>· Review deck seed (missed questions become flashcards)</div>
                <div>· Study history (fuels "since your last session" bridges)</div>
              </div>
            </div>

            {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 12, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

            <button onClick={startDiagnostic} style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}>
              Start diagnostic →
            </button>
            <button onClick={onClose} style={{ marginTop: 8, width: '100%', padding: '8px', fontSize: 12.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              Skip — I'll set it up manually later
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>Building your 5-question diagnostic…</div>
          </div>
        )}

        {step === 'quiz' && q && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '14px 16px', background: D.bg, borderRadius: 12, border: `1px solid ${D.border}` }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: D.text, lineHeight: 1.5 }}>{q.question}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt, i) => {
                const isSelected = selected === opt
                const isCorrect = opt === q.answer
                const showRight = confirmed && isCorrect
                const showWrong = confirmed && isSelected && !isCorrect
                return (
                  <button
                    key={i}
                    onClick={() => !confirmed && pickAnswer(opt)}
                    disabled={confirmed}
                    style={{
                      padding: '12px 16px', borderRadius: 10, textAlign: 'left',
                      fontSize: 14, fontWeight: showRight ? 700 : 500, lineHeight: 1.4,
                      border: `1.5px solid ${showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.border}`,
                      background: showRight ? 'rgba(22,163,74,0.08)' : showWrong ? 'rgba(220,38,38,0.08)' : isSelected ? 'rgba(59,97,196,0.06)' : D.bgCard,
                      color: showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.text,
                      cursor: confirmed ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {confirmed && q.explanation && (
              <div style={{ padding: '10px 12px', background: 'rgba(59,97,196,0.05)', borderRadius: 8, border: '1px solid rgba(59,97,196,0.15)', fontSize: 12.5, color: D.textMuted, lineHeight: 1.5 }}>
                {q.explanation}
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎯</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: -0.3, marginBottom: 6 }}>
              {correctCount}/{questions.length} right — but the score doesn't matter.
            </div>
            <div style={{ fontSize: 13.5, color: D.textMuted, marginBottom: 20, lineHeight: 1.55 }}>
              What matters: {course?.name} now has real mastery data. Your dashboard, Session Bundle, Cheat Sheet, and Coach Plan just came alive.
            </div>
            <button
              onClick={() => { onComplete?.({ score: Math.round((correctCount / questions.length) * 100) }); onClose?.() }}
              style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}
            >
              See your personalized dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
