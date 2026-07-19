import { useState, useEffect, useRef } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { updateMastery } from '../lib/masteryStore'
import Spinner from './ui/spinner'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const DIFFICULTY_COLOR = { easy: '#16A34A', medium: '#D97706', hard: '#DC2626' }

const QUESTION_TIME = 10 // seconds per question

export default function QuickQuizBurst({ courses, onClose, onShowPaywall, onOpenCheatSheet, onOpenTeachItBack, initialCourseIdx = 0, initialTopic = '', autoStart = false }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const [courseIdx, setCourseIdx] = useState(initialCourseIdx)
  const [topic, setTopic] = useState(initialTopic)
  const [step, setStep] = useState('setup') // 'setup' | 'loading' | 'quiz' | 'done'
  const [questions, setQuestions] = useState(null)
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [answers, setAnswers] = useState([]) // { correct, difficulty }
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME)
  const [flash, setFlash] = useState(null) // 'correct' | 'wrong'
  const [error, setError] = useState('')
  const [repairs, setRepairs] = useState({}) // { [qIdx]: { loading, data, repairSelected, repairConfirmed, error } }
  const intervalRef = useRef(null)

  const course = courses[courseIdx] ?? null
  const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]

  // Auto-start when launched from CheatSheet with a pre-populated topic
  useEffect(() => {
    if (autoStart && initialTopic) startQuiz()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 'quiz' || confirmed) return
    setTimeLeft(QUESTION_TIME)
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          handleConfirm(null) // time out = wrong
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [qIdx, step, confirmed])

  async function startQuiz() {
    const { allowed: canQuiz } = canUseFeature('quizBurst')
    if (!canQuiz) { onShowPaywall?.('quizBurst'); return }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setStep('loading')
    setError('')

    let retries = 0
    while (retries < 2) {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/quiz-burst', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ courseName: course?.name ?? 'unknown', topic: topic.trim() || undefined }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
        incrementAIQuery()
        incrementFeatureUsage('quizBurst')
        setQuestions(data.questions)
        setQIdx(0)
        setAnswers([])
        setStreak(0)
        setMaxStreak(0)
        setSelected(null)
        setConfirmed(false)
        setStep('quiz')
        return
      } catch (e) {
        retries++
        if (retries >= 2) {
          setError(e.message || 'Something went wrong. Please try again.')
          setStep('setup')
        }
      }
    }
  }

  function handleConfirm(opt) {
    if (confirmed) return
    clearInterval(intervalRef.current)
    setSelected(opt)
    setConfirmed(true)

    const q = questions[qIdx]
    const isCorrect = opt !== null && opt === q.answer
    setFlash(isCorrect ? 'correct' : 'wrong')
    setTimeout(() => setFlash(null), 600)

    const newStreak = isCorrect ? streak + 1 : 0
    setStreak(newStreak)
    setMaxStreak(prev => Math.max(prev, newStreak))
    setAnswers(prev => [...prev, { correct: isCorrect, difficulty: q.difficulty, selected: opt }])

    setTimeout(() => {
      if (qIdx + 1 >= questions.length) {
        const finalAnswers = [...answers, { correct: isCorrect, difficulty: q.difficulty, selected: opt }]
        const finalScore = finalAnswers.filter(a => a.correct).length
        const quizPct = Math.round((finalScore / questions.length) * 100)
        addStudySession({ tool: 'Quiz Burst', score: quizPct, topic: topic.trim() || null, courseName: course?.name || null })
        if (topic.trim()) updateMastery(topic.trim(), course?.id ?? null, quizPct, 'quiz')
        window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'quizBurst' } }))
        setStep('done')
      } else {
        setQIdx(i => i + 1)
        setSelected(null)
        setConfirmed(false)
      }
    }, 1200)
  }

  async function fetchRepair(questionIdx) {
    const q = questions[questionIdx]
    const ans = answers[questionIdx]
    addWeakTopics([topic.trim() || q.difficulty || course?.name].filter(Boolean))
    setRepairs(prev => ({ ...prev, [questionIdx]: { loading: true } }))
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/repair-misconception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course?.name ?? 'unknown',
          topic: topic.trim() || undefined,
          wrongQuestion: q.question,
          wrongAnswer: ans?.selected ?? null,
          correctAnswer: q.answer,
          existingExplanation: q.explanation,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      setRepairs(prev => ({ ...prev, [questionIdx]: { loading: false, data, repairSelected: null, repairConfirmed: false } }))
    } catch (e) {
      setRepairs(prev => ({ ...prev, [questionIdx]: { loading: false, error: e.message } }))
    }
  }

  function handleRepairAnswer(questionIdx, opt) {
    setRepairs(prev => ({ ...prev, [questionIdx]: { ...prev[questionIdx], repairSelected: opt, repairConfirmed: true } }))
  }

  const score = answers.filter(a => a.correct).length
  const missedQuestions = questions?.map((q, i) => ({ q, i })).filter(({ i }) => answers[i] && !answers[i].correct) ?? []
  const q = questions?.[qIdx]
  const timePct = timeLeft / QUESTION_TIME

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick Quiz Burst" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden',
        transition: 'background 0.2s ease',
        background: flash === 'correct' ? 'rgba(22,163,74,0.04)' : flash === 'wrong' ? 'rgba(220,38,38,0.04)' : D.bgCard,
      }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes bar-in{from{width:0}}`}</style>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(232,83,26,0.10)', border: '1px solid rgba(232,83,26,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke={D.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Quick Quiz Burst</div>
            {step === 'quiz' && questions && (
              <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>
                Question {qIdx + 1} of {questions.length}
              </div>
            )}
          </div>
          {/* Streak */}
          {step === 'quiz' && streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 999, padding: '4px 10px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.75"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#F97316' }}>{streak}</span>
            </div>
          )}
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Setup */}
        {step === 'setup' && (
          <div style={{ padding: 24, overflowY: 'auto' }}>
            {courses.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Course</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {courses.map((c, i) => {
                    const dot = c.color?.dot ?? COURSE_COLORS[i % COURSE_COLORS.length]
                    const active = courseIdx === i
                    return (
                      <button key={i} onClick={() => setCourseIdx(i)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${active ? `${dot}50` : D.border}`, background: active ? `${dot}12` : 'none', color: active ? dot : D.textMuted, cursor: 'pointer' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Focus topic (optional)</div>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Cell signaling, Chapter 4, Mitosis" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1px solid ${D.borderStrong}`, fontSize: 14, color: D.text, background: D.bg, outline: 'none', fontFamily: 'inherit' }} />
            </div>

            {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

            {!isPro && (() => {
              const { allowed: canQuiz, remaining } = canUseFeature('quizBurst')
              return !canQuiz ? (
                <div style={{ fontSize: 13, color: D.amber, marginBottom: 16, padding: '10px 14px', background: 'rgba(217,119,6,0.08)', borderRadius: 8, border: '1px solid rgba(217,119,6,0.20)' }}>
                  You've used your free Quiz Burst. {hasUsedTrial() ? 'Upgrade to Pro' : 'Start your free trial'} for unlimited.
                </div>
              ) : null
            })()}

            {!isPro && (() => {
              const { allowed: canQuiz, remaining } = canUseFeature('quizBurst')
              return (
                <button
                  onClick={!canQuiz ? () => onShowPaywall?.('quizBurst') : startQuiz}
                  style={{ width: '100%', padding: '13px', background: !canQuiz ? D.blue : D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: !canQuiz ? `0 3px 12px rgba(59,97,196,0.30)` : `0 3px 12px rgba(232,83,26,0.35)` }}
                >
                  {!canQuiz ? (hasUsedTrial() ? 'Upgrade to Pro →' : 'Start free trial →') : 'Start burst'}
                </button>
              )
            })()}

            {isPro && (
              <button
                onClick={startQuiz}
                style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}
              >
                Start burst
              </button>
            )}

            {!isPro && (() => {
              const { remaining } = canUseFeature('quizBurst')
              return remaining !== null && remaining > 0 ? (
                <div style={{ textAlign: 'center', fontSize: 12, color: D.textDim, marginTop: 12 }}>
                  {1 - remaining} of 1 quiz burst used
                  {' · '}<button onClick={() => onShowPaywall?.('quizBurst')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start free trial'}</button>
                </div>
              ) : null
            })()}
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>Generating your quiz...</div>
          </div>
        )}

        {/* Quiz */}
        {step === 'quiz' && q && (
          <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Timer bar */}
            <div style={{ height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${timePct * 100}%`, height: '100%', borderRadius: 3,
                background: timePct > 0.5 ? D.green : timePct > 0.25 ? D.amber : D.red,
                transition: 'width 1s linear, background 0.5s ease',
              }} />
            </div>

            {/* Question */}
            <div style={{ padding: '16px', background: D.bg, borderRadius: 12, border: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 999, color: DIFFICULTY_COLOR[q.difficulty] ?? D.blue, background: `${DIFFICULTY_COLOR[q.difficulty] ?? D.blue}12`, border: `1px solid ${DIFFICULTY_COLOR[q.difficulty] ?? D.blue}25` }}>
                  {q.difficulty}
                </span>
                <span style={{ fontSize: 12, color: D.textDim, marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{timeLeft}s</span>
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: D.text, lineHeight: 1.5 }}>{q.question}</p>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt, i) => {
                const isSelected = selected === opt
                const isCorrect = opt === q.answer
                const showRight = confirmed && isCorrect
                const showWrong = confirmed && isSelected && !isCorrect
                return (
                  <button
                    key={i}
                    onClick={() => !confirmed && handleConfirm(opt)}
                    disabled={confirmed}
                    style={{
                      padding: '12px 16px', borderRadius: 10, textAlign: 'left',
                      fontSize: 14, fontWeight: showRight ? 700 : 500, lineHeight: 1.4,
                      border: `1.5px solid ${showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.border}`,
                      background: showRight ? 'rgba(22,163,74,0.08)' : showWrong ? 'rgba(220,38,38,0.08)' : isSelected ? 'rgba(59,97,196,0.06)' : D.bgCard,
                      color: showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.text,
                      cursor: confirmed ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{opt}</span>
                      {showRight && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                      {showWrong && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M18 6L6 18M6 6l12 12"/></svg>}
                    </span>
                  </button>
                )
              })}
            </div>

            {confirmed && q.explanation && (
              <div style={{ padding: '12px 14px', background: 'rgba(59,97,196,0.05)', borderRadius: 10, border: '1px solid rgba(59,97,196,0.15)', fontSize: 13, color: D.textMuted, lineHeight: 1.5 }}>
                {q.explanation}
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div style={{ padding: 24, overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {(() => {
                const pct = Math.round((score / (questions?.length || 5)) * 100)
                const color = pct >= 80 ? D.green : pct >= 60 ? D.amber : D.red
                return (
                  <>
                    <div style={{ fontSize: 56, fontWeight: 900, color, letterSpacing: -2, lineHeight: 1 }}>
                      {pct}<span style={{ fontSize: 28, fontWeight: 700, color }}>%</span>
                    </div>
                    <div style={{ fontSize: 13, color: D.textDim, marginTop: 4, fontWeight: 500 }}>{score}/{questions?.length || 5} correct</div>
                    <div style={{ fontSize: 14, color: D.textMuted, marginTop: 6 }}>
                      {pct === 100 ? 'Perfect score.' : pct >= 80 ? 'Strong performance.' : pct >= 60 ? 'Decent run, a few gaps to close.' : 'These need another pass.'}
                    </div>
                  </>
                )
              })()}
            </div>
            {maxStreak > 1 && (
              <div style={{ fontSize: 12, color: '#F97316', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
                Best streak: {maxStreak}
              </div>
            )}

            {missedQuestions.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.red, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Questions you missed</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {missedQuestions.map(({ q: missed, i: qI }, idx) => {
                    const repair = repairs[qI]
                    const rq = repair?.data?.repairQuestion
                    return (
                      <div key={qI} style={{ borderRadius: 10, border: '1px solid rgba(220,38,38,0.15)', background: 'rgba(220,38,38,0.03)', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.45, fontWeight: 500, marginBottom: 8 }}>{missed.question}</div>
                          <div style={{ fontSize: 12, color: D.textMuted, marginBottom: 8 }}>
                            <span style={{ color: D.red }}>Your answer:</span> {answers[qI]?.selected ?? 'No answer'} &nbsp;·&nbsp; <span style={{ color: D.green }}>Correct:</span> {missed.answer}
                          </div>
                          {!repair && (
                            <button
                              onClick={() => fetchRepair(qI)}
                              style={{ fontSize: 12, fontWeight: 700, color: D.blue, background: 'rgba(59,97,196,0.07)', border: '1px solid rgba(59,97,196,0.20)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Deep Dive
                            </button>
                          )}
                          {repair?.loading && (
                            <div style={{ fontSize: 12, color: D.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Spinner size="sm" /> Analyzing your mistake...
                            </div>
                          )}
                          {repair?.error && (
                            <div style={{ fontSize: 12, color: D.red }}>{repair.error}</div>
                          )}
                        </div>

                        {repair?.data && (
                          <div style={{ borderTop: '1px solid rgba(59,97,196,0.12)', background: 'rgba(59,97,196,0.03)', padding: '12px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: D.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What went wrong</div>
                            <p style={{ margin: '0 0 12px', fontSize: 13, color: D.text, lineHeight: 1.5 }}>{repair.data.diagnosis}</p>

                            {rq && (
                              <>
                                <div style={{ fontSize: 12, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Reinforce this concept</div>
                                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: D.text, lineHeight: 1.45 }}>{rq.question}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  {rq.options.map((opt, oi) => {
                                    const isSelected = repair.repairSelected === opt
                                    const isCorrect = opt === rq.answer
                                    const showRight = repair.repairConfirmed && isCorrect
                                    const showWrong = repair.repairConfirmed && isSelected && !isCorrect
                                    return (
                                      <button
                                        key={oi}
                                        onClick={() => !repair.repairConfirmed && handleRepairAnswer(qI, opt)}
                                        disabled={repair.repairConfirmed}
                                        style={{
                                          padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                                          fontSize: 12.5, fontWeight: showRight ? 700 : 500, lineHeight: 1.4,
                                          border: `1.5px solid ${showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.border}`,
                                          background: showRight ? 'rgba(22,163,74,0.08)' : showWrong ? 'rgba(220,38,38,0.08)' : isSelected ? 'rgba(59,97,196,0.06)' : D.bgCard,
                                          color: showRight ? D.green : showWrong ? D.red : isSelected ? D.blue : D.text,
                                          cursor: repair.repairConfirmed ? 'default' : 'pointer',
                                          fontFamily: 'inherit',
                                          transition: 'all 0.15s',
                                        }}
                                      >
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                          <span>{opt}</span>
                                          {showRight && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                                          {showWrong && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M18 6L6 18M6 6l12 12"/></svg>}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                                {repair.repairConfirmed && (
                                  <div style={{ marginTop: 8, padding: '8px 10px', background: repair.repairSelected === rq.answer ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.05)', borderRadius: 8, border: `1px solid ${repair.repairSelected === rq.answer ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}` }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: repair.repairSelected === rq.answer ? D.green : D.red, marginBottom: 3 }}>
                                      {repair.repairSelected === rq.answer ? 'Got it.' : 'Not quite. See the explanation above.'}
                                    </div>
                                    <div style={{ fontSize: 12, color: D.textMuted, lineHeight: 1.5 }}>{rq.explanation}</div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!isPro && !canUseFeature('quizBurst').allowed && (
              <div style={{ padding: '14px 16px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, marginBottom: 8, textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                  {hasUsedTrial() ? 'You\'ve used your free quiz. Upgrade to Pro for unlimited daily practice.' : 'You\'ve used your free quiz. Start your free trial for unlimited daily practice.'}
                </p>
                <button onClick={() => onShowPaywall?.('quizBurst')} style={{ padding: '10px 20px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {hasUsedTrial() ? 'Upgrade to Pro →' : 'Start 7-day free trial →'}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setStep('setup'); setQuestions(null); setAnswers([]); setStreak(0); setMaxStreak(0); setRepairs({}) }}
                style={{ padding: '12px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Go again
              </button>
              {missedQuestions.length > 0 && onOpenTeachItBack && (
                <button
                  onClick={() => { onOpenTeachItBack({ courseIdx, topic: topic.trim() || '' }); onClose() }}
                  style={{ padding: '12px', background: 'rgba(124,58,237,0.08)', border: '1.5px solid rgba(124,58,237,0.25)', borderRadius: 10, color: '#7C3AED', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Teach It Back to fix your gaps
                </button>
              )}
              {onOpenCheatSheet && (
                <button
                  onClick={() => { onClose(); onOpenCheatSheet?.() }}
                  style={{ padding: '12px', background: 'none', border: `1.5px solid rgba(59,97,196,0.30)`, borderRadius: 10, color: D.blue, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Review weak topics with AI Cheat Sheet
                </button>
              )}
              <button onClick={onClose} style={{ padding: '10px', background: 'none', border: 'none', color: D.textDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
