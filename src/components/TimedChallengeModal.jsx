import { useState, useEffect, useRef } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'
import { addStudySession } from '../lib/studyHistory'

const D = {
  bg: '#F7F6F3',
  card: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  accent: '#3B61C4',
  text: '#111111',
  muted: '#6B6B6B',
  red: '#DC2626',
  green: '#16A34A',
  amber: '#D97706',
  orange: '#EA580C',
}

const PB_KEY = 'studyedge_time_attack_pb'
const TOTAL_TIME = 60

function getPB(courseKey) {
  try {
    const all = JSON.parse(localStorage.getItem(PB_KEY) ?? '{}')
    return all[courseKey] ?? null
  } catch { return null }
}

function savePB(courseKey, record) {
  try {
    const all = JSON.parse(localStorage.getItem(PB_KEY) ?? '{}')
    const existing = all[courseKey]
    if (!existing || record.score > existing.score) {
      all[courseKey] = record
      localStorage.setItem(PB_KEY, JSON.stringify(all))
      return true
    }
    return false
  } catch { return false }
}

export default function TimedChallengeModal({ courses, userId, onClose, onShowPaywall }) {
  const [step, setStep] = useState('setup') // 'setup' | 'loading' | 'active' | 'done'
  const [selectedCourse, setSelectedCourse] = useState(courses.length > 0 ? 0 : -1)
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')

  const [questions, setQuestions] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [answers, setAnswers] = useState([]) // { correct: bool, selected: string }[]
  const [selected, setSelected] = useState(null)
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [timedOut, setTimedOut] = useState(false)

  const timerRef = useRef(null)
  const advanceRef = useRef(null)

  const course = selectedCourse >= 0 ? courses[selectedCourse] : null
  const courseName = course?.name ?? 'General'
  const courseKey = `${courseName}|${topic.trim().toLowerCase()}`
  const pb = getPB(courseKey)

  // Timer logic
  useEffect(() => {
    if (step !== 'active') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          setTimedOut(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [step])

  // End when timed out
  useEffect(() => {
    if (timedOut) finishChallenge()
  }, [timedOut])

  function finishChallenge() {
    clearInterval(timerRef.current)
    clearTimeout(advanceRef.current)
    setStep('done')
  }

  async function handleStart() {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setError('')
    setStep('loading')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/timed-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseName, topic: topic.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate questions')
      if (!data.questions?.length) throw new Error('No questions returned')
      setQuestions(data.questions)
      setQIdx(0)
      setAnswers([])
      setSelected(null)
      setTimeLeft(TOTAL_TIME)
      setTimedOut(false)
      setStep('active')
      await incrementAIQuery()
    } catch (e) {
      setError(e.message)
      setStep('setup')
    }
  }

  function handleSelect(opt) {
    if (selected !== null) return
    const isCorrect = opt === questions[qIdx].answer
    setSelected(opt)
    const newAnswers = [...answers, { correct: isCorrect, selected: opt }]
    setAnswers(newAnswers)
    if (newAnswers.length >= questions.length) {
      advanceRef.current = setTimeout(() => finishChallenge(), 500)
      return
    }
    advanceRef.current = setTimeout(() => {
      setSelected(null)
      setQIdx(i => i + 1)
    }, 350)
  }

  function handlePlayAgain() {
    setAnswers([])
    setSelected(null)
    setQIdx(0)
    setTimedOut(false)
    handleStart()
  }

  const doneStatsRef = useRef(null)
  useEffect(() => {
    if (step !== 'done' || !questions.length) return
    const correct = answers.filter(a => a.correct).length
    const total = answers.length
    const score = total > 0 ? Math.round((correct / total) * 100) : 0
    const isNewPB = savePB(courseKey, { score, correct, total, date: new Date().toISOString() })
    addStudySession({ tool: 'Time Attack', score, topic: topic.trim() || null, courseName: course?.name || null })
    doneStatsRef.current = { correct, total, score, isNewPB }
  }, [step])
  const doneStats = step === 'done' ? doneStatsRef.current : null

  const timerCritical = timeLeft <= 15 && step === 'active'
  const pctTime = (timeLeft / TOTAL_TIME) * 100

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: D.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${D.orange}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={D.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
              </svg>
            </div>
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>Time Attack</span>
              <span style={{ display: 'block', fontSize: 11, color: D.muted, marginTop: 0 }}>60 seconds. 14 questions.</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.muted} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '0 20px 28px' }}>

          {/* ── Setup ── */}
          {step === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {courses.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: D.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Course</label>
                  <select
                    value={selectedCourse}
                    onChange={e => setSelectedCourse(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(0,0,0,0.1)`, fontSize: 13, color: D.text, background: D.card, outline: 'none', appearance: 'none', fontFamily: 'inherit' }}
                  >
                    {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: D.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Topic (optional)</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStart()}
                  placeholder="e.g. Cardiac output, Organic reactions..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(0,0,0,0.1)`, fontSize: 13, color: D.text, background: D.card, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = D.orange}
                  onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
                />
              </div>

              {pb && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: `${D.orange}0D`, border: `1px solid ${D.orange}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: D.muted }}>Personal best</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: D.orange }}>{pb.score}%</span>
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', fontSize: 13, color: D.red }}>{error}</div>
              )}

              <button
                onClick={handleStart}
                disabled={courses.length === 0 && selectedCourse < 0}
                style={{ width: '100%', padding: '13px', borderRadius: 11, background: D.orange, border: 'none', color: '#FFFFFF', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }}
              >
                Start Challenge
              </button>
            </div>
          )}

          {/* ── Loading ── */}
          {step === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 0' }}>
              <Spinner size="md" />
              <p style={{ fontSize: 14, fontWeight: 600, color: D.text, margin: 0 }}>Generating 14 questions...</p>
              <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>Get ready to go fast</p>
            </div>
          )}

          {/* ── Active ── */}
          {step === 'active' && questions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Timer + progress */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: timerCritical ? D.red : D.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.04em', transition: 'color 0.3s' }}>
                    {timeLeft}
                  </span>
                  <span style={{ fontSize: 12, color: D.muted, fontWeight: 600 }}>sec</span>
                </div>
                <span style={{ fontSize: 12, color: D.muted, fontWeight: 600 }}>{qIdx + 1} / {questions.length}</span>
              </div>

              {/* Timer bar */}
              <div style={{ height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', borderRadius: 999, background: timerCritical ? D.red : D.orange, width: `${pctTime}%`, transition: 'width 1s linear, background 0.3s' }} />
              </div>

              {/* Question */}
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 13, padding: '16px 16px' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: D.text, lineHeight: 1.45 }}>{questions[qIdx].question}</p>
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions[qIdx].options.map((opt, i) => {
                  const isSelected = selected === opt
                  const isCorrect = opt === questions[qIdx].answer
                  const showRight = selected !== null && isCorrect
                  const showWrong = isSelected && !isCorrect
                  let bg = D.card
                  let border = D.border
                  let color = D.text
                  if (showRight) { bg = 'rgba(22,163,74,0.08)'; border = 'rgba(22,163,74,0.4)'; color = '#15803D' }
                  if (showWrong) { bg = 'rgba(220,38,38,0.07)'; border = 'rgba(220,38,38,0.35)'; color = D.red }
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(opt)}
                      disabled={selected !== null}
                      style={{ width: '100%', textAlign: 'left', padding: '11px 14px', borderRadius: 10, background: bg, border: `1px solid ${border}`, color, fontSize: 13, fontWeight: 600, cursor: selected !== null ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: D.muted, flexShrink: 0 }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && doneStats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Score */}
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
                {doneStats.isNewPB && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: `${D.orange}14`, border: `1px solid ${D.orange}30`, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: D.orange, letterSpacing: '0.04em' }}>NEW PERSONAL BEST</span>
                  </div>
                )}
                <div style={{ fontSize: 62, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: doneStats.score >= 80 ? D.green : doneStats.score >= 60 ? D.amber : D.red }}>
                  {doneStats.score}<span style={{ fontSize: 30, fontWeight: 700 }}>%</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: D.muted }}>
                  {doneStats.correct} correct out of {doneStats.total} answered
                  {timedOut && doneStats.total < questions.length && ` (${questions.length - doneStats.total} skipped)`}
                </p>
                {pb && !doneStats.isNewPB && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: D.muted }}>
                    Personal best: <strong style={{ color: D.orange }}>{pb.score}%</strong>
                  </p>
                )}
              </div>

              {/* Result headline */}
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: D.text, textAlign: 'center' }}>
                {doneStats.score >= 80 ? 'Strong run. You know this material.' : doneStats.score >= 60 ? 'Good effort. A few more reps and you will own it.' : 'Keep drilling. Repetition is how it sticks.'}
              </p>

              {/* Buttons */}
              <button
                onClick={handlePlayAgain}
                style={{ width: '100%', padding: '13px', borderRadius: 11, background: D.orange, border: 'none', color: '#FFFFFF', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Go Again
              </button>
              <button
                onClick={() => { setStep('setup'); setTopic('') }}
                style={{ width: '100%', padding: '11px', borderRadius: 11, background: 'transparent', border: `1px solid rgba(0,0,0,0.1)`, color: D.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Change Course or Topic
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
