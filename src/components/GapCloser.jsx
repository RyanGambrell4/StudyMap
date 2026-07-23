import { useState } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { incrementAIQuery } from '../lib/subscription'
import { updateMastery } from '../lib/masteryStore'
import { addStudySession } from '../lib/studyHistory'
import { addCardsToDeck, cardFromBrainDumpGap, cardFromQuizMiss } from '../lib/deckAdditions'
import { recordConfidence } from '../lib/confidenceStore'
import { track } from '../lib/analytics'

// GapCloser — inline 3-Q micro-quiz on a single topic. Used by Brain Dump
// (per possibleGap) so the student can close a gap in ~2 minutes right
// where it surfaced, without hopping to another feature. Passes/fails feed
// mastery so the rest of the app knows the gap is closed.
//
// Props:
//   gap             (required)   - topic string to quiz on
//   courseId        (required)   - for mastery updates
//   courseName      (required)   - for the API + study-history log
//   courseContext                - hydrated context for grounding
//   onFinished      (topic, score) - called when the student finishes
//   onDismiss                    - called when they hit "skip"

const D = {
  border: 'rgba(0,0,0,0.07)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  green: '#16A34A', red: '#DC2626', blue: '#3B61C4',
}

const QUESTION_COUNT = 3

export default function GapCloser({ gap, courseId, courseName, courseContext, onFinished, onDismiss }) {
  const [step, setStep] = useState('idle') // idle | loading | quiz | done | error
  const [questions, setQuestions] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [answers, setAnswers] = useState([])
  const [error, setError] = useState('')

  async function start() {
    setStep('loading')
    setError('')
    track('gap_closer_started', { topic: gap, courseName })
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/quiz-burst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName,
          topic: gap,
          courseContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate mini quiz')
      incrementAIQuery()
      const qs = (data.questions ?? []).slice(0, QUESTION_COUNT)
      if (!qs.length) throw new Error('No questions returned')
      setQuestions(qs)
      setQIdx(0)
      setAnswers([])
      setSelected(null)
      setConfirmed(false)
      setStep('quiz')
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setStep('error')
    }
  }

  function pickAnswer(opt) {
    if (confirmed || selected != null) return
    setSelected(opt)
  }

  function confirmWithConfidence(rating) {
    const opt = selected
    if (opt == null || confirmed) return
    setConfirmed(true)
    const q = questions[qIdx]
    const correct = opt === q.answer
    if (q.topic) recordConfidence({ rating, topic: q.topic, courseId, source: 'gap_closer' })
    const next = [...answers, { correct, opt, confidence: rating }]
    setAnswers(next)
    setTimeout(() => {
      if (qIdx + 1 >= questions.length) {
        const score = Math.round((next.filter(a => a.correct).length / questions.length) * 100)
        updateMastery(gap, courseId, score, 'gap_closer')
        addStudySession({ tool: 'Gap Closer', score, topic: gap, courseName: courseName || null })
        track('gap_closer_finished', { topic: gap, score })
        // Shaky sprints (missed at least one) auto-add the missed questions
        // AND the gap itself so review keeps circling until mastery holds.
        if (score < 100) {
          const toAdd = questions
            .map((qq, i) => (next[i]?.correct ? null : cardFromQuizMiss(qq, courseId, courseName)))
            .filter(Boolean)
          if (score < 67) toAdd.push(cardFromBrainDumpGap(gap, courseId, courseName))
          if (toAdd.length) {
            addCardsToDeck(toAdd)
              .then(({ added }) => added > 0 && window.dispatchEvent(new CustomEvent('studyedge:deck-updated', { detail: { added, source: 'gap_closer' } })))
              .catch(() => {})
          }
        }
        setStep('done')
        onFinished?.(gap, score)
      } else {
        setQIdx(i => i + 1)
        setSelected(null)
        setConfirmed(false)
      }
    }, 900)
  }

  const q = questions[qIdx]
  const score = Math.round((answers.filter(a => a.correct).length / Math.max(questions.length, 1)) * 100)

  if (step === 'idle') {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={start}
          style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.22)', color: D.blue, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Close now · 2 min
        </button>
        <button
          onClick={() => { updateMastery(gap, courseId, 30, 'add_to_review'); onDismiss?.(gap, 'review') }}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, background: 'none', border: `1px solid ${D.border}`, color: D.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Add to review
        </button>
        <button
          onClick={() => { updateMastery(gap, courseId, 85, 'self_skip'); onDismiss?.(gap, 'skip') }}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, background: 'none', border: `1px solid ${D.border}`, color: D.textDim, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          I know it — skip
        </button>
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', color: D.textDim, fontSize: 12.5 }}>
        <Spinner size="sm" /> Building 3 questions on {gap}…
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div style={{ fontSize: 12, color: D.red }}>{error} <button onClick={start} style={{ background: 'none', border: 'none', color: D.blue, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Try again</button></div>
    )
  }

  if (step === 'quiz' && q) {
    return (
      <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${D.border}`, background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: D.textDim, marginBottom: 8 }}>
          <span>Q {qIdx + 1} / {questions.length} · {gap}</span>
          <span>{answers.filter(a => a.correct).length} correct</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: D.text, marginBottom: 10, lineHeight: 1.45 }}>{q.question}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {q.options.map((opt, i) => {
            const isSelected = selected === opt
            const isCorrect = opt === q.answer
            const showRight = confirmed && isCorrect
            const showWrong = confirmed && isSelected && !isCorrect
            return (
              <button
                key={i}
                onClick={() => pickAnswer(opt)}
                disabled={confirmed}
                style={{
                  padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                  fontSize: 12.5, fontWeight: showRight ? 700 : 500,
                  border: `1.5px solid ${showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.border}`,
                  background: showRight ? 'rgba(22,163,74,0.08)' : showWrong ? 'rgba(220,38,38,0.06)' : isSelected ? 'rgba(59,97,196,0.05)' : 'transparent',
                  color: showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.text,
                  cursor: confirmed ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {opt}
              </button>
            )
          })}
        </div>
        {selected != null && !confirmed && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: D.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, textAlign: 'center' }}>How sure?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
              {[1,2,3,4,5].map(r => (
                <button
                  key={r}
                  onClick={() => confirmWithConfidence(r)}
                  style={{
                    padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${D.border}`, background: '#FFFFFF',
                    color: D.text, fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 800,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
        {confirmed && q.explanation && (
          <div style={{ marginTop: 8, fontSize: 12, color: D.textMuted, lineHeight: 1.45 }}>{q.explanation}</div>
        )}
      </div>
    )
  }

  if (step === 'done') {
    const great = score >= 67
    return (
      <div style={{ padding: '10px 14px', borderRadius: 10, background: great ? 'rgba(22,163,74,0.06)' : 'rgba(217,119,6,0.06)', border: `1px solid ${great ? 'rgba(22,163,74,0.22)' : 'rgba(217,119,6,0.22)'}` }}>
        <strong style={{ fontSize: 11.5, letterSpacing: '0.06em', color: great ? D.green : '#D97706' }}>
          {great ? 'GAP CLOSED · ' : 'STILL SHAKY · '}
        </strong>
        <span style={{ fontSize: 13, color: D.text }}>Scored {score}% on {gap}. {great ? 'Mastery updated.' : 'Added to review — we\'ll circle back.'}</span>
      </div>
    )
  }

  return null
}
