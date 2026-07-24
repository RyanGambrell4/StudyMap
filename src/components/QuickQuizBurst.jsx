import { useState, useEffect, useRef, useMemo } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { updateMastery, getWeakestTopics, getMastery } from '../lib/masteryStore'
import { hydrateCourseContext } from '../lib/courseContext'
import { getLastSessionBridge, getUnaddressedBrainDumpGap } from '../lib/lastSessionBridge'
import { pickSmartTopic, pickSmartCourse } from '../lib/smartDefault'
import ExplainAs from './ExplainAs'
import { addCardsToDeck, cardFromQuizMiss } from '../lib/deckAdditions'
import { recordConfidence } from '../lib/confidenceStore'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const DIFFICULTY_COLOR = { easy: '#16A34A', medium: '#D97706', hard: '#DC2626' }

const QUESTION_TIME = 10 // seconds per question

export default function QuickQuizBurst({ courses, onClose, onShowPaywall, onOpenCheatSheet, initialCourseIdx = null, initialTopic = '', autoStart = false, learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [] }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  // If the caller didn't specify a course, pick the one with the closest
  // exam, most urgent gap, or weakest mastery — so the setup screen opens
  // already pointed at the highest-value course, not just courses[0].
  const initialSmartCourse = useMemo(() =>
    initialCourseIdx != null ? initialCourseIdx : pickSmartCourse(courses).index
  , [initialCourseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps
  const [courseIdx, setCourseIdx] = useState(initialSmartCourse)
  const [topic, setTopic] = useState(initialTopic)
  const [step, setStep] = useState('setup') // 'setup' | 'loading' | 'quiz' | 'done'
  const [questions, setQuestions] = useState(null)
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [confidence, setConfidence] = useState(null) // 1-5 metacognitive tap
  const [answers, setAnswers] = useState([]) // { correct, difficulty, confidence }
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME)
  const [flash, setFlash] = useState(null) // 'correct' | 'wrong'
  const [error, setError] = useState('')
  const [repairs, setRepairs] = useState({}) // { [qIdx]: { loading, data, repairSelected, repairConfirmed, error } }
  // Mastery delta tracking: snapshot before the quiz starts, diff after.
  const [preMastery, setPreMastery] = useState({}) // { topic: score }
  const [masteryDelta, setMasteryDelta] = useState(null) // { closed: [...], improved: [...], stillWeak: [...] }
  const intervalRef = useRef(null)

  const course = courses[courseIdx] ?? null
  const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]

  const suggestedTopics = useMemo(() => {
    return getWeakestTopics(course?.id ?? null, 3).filter(t => t.score < 80).map(t => t.topic)
  }, [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  const bridge = useMemo(() =>
    getLastSessionBridge({ courseId: course?.id ?? null, courseName: course?.name ?? null, currentTool: 'Quiz Burst' })
  , [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  const unaddressedGap = useMemo(() =>
    getUnaddressedBrainDumpGap(course?.id ?? null)
  , [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute the smart-default topic for this course. Hydrating the full
  // context here is cheap since it's all local caches.
  const smart = useMemo(() => {
    const ctx = hydrateCourseContext(course, {
      firstName, yearLevel, learningStyle, schoolType, assignments,
    })
    return pickSmartTopic(course, ctx)
  }, [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show the full manual picker only when the student explicitly opens it,
  // or when there's no smart topic to recommend.
  const [showManual, setShowManual] = useState(!smart?.topic)

  // Memoize the full course context so ExplainAs and repair calls both use
  // the same object without re-hydrating on every render.
  const courseContextMemo = useMemo(() =>
    hydrateCourseContext(course, { firstName, yearLevel, learningStyle, schoolType, assignments })
  , [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick the ExplainAs preferred mode from the student's learning style.
  const preferredExplanationMode = learningStyle === 'visual' ? 'visual'
    : learningStyle === 'practice' ? 'example'
    : learningStyle === 'reading' ? 'short'
    : null

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

  async function startQuiz(overrideTopic = null) {
    const { allowed: canQuiz } = canUseFeature('quizBurst')
    if (!canQuiz) { onShowPaywall?.('quizBurst'); return }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    // If the hero CTA passed a smart topic, use it (and reflect it in the
    // input so the student sees what they're being quizzed on).
    const resolvedTopic = overrideTopic ?? topic.trim()
    if (overrideTopic && overrideTopic !== topic) setTopic(overrideTopic)
    setStep('loading')
    setError('')
    track('quiz_burst_started', { topic: resolvedTopic || null, courseName: course?.name ?? null, smartDefault: !!overrideTopic })

    // Hydrate the full course context so the API can ground the questions on
    // this student's syllabus, weak topics, past misses, exam window, etc. —
    // instead of guessing from the course name alone.
    const courseContext = hydrateCourseContext(course, {
      firstName, yearLevel, learningStyle, schoolType, assignments,
    })

    let retries = 0
    while (retries < 2) {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/quiz-burst', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            courseName: course?.name ?? 'unknown',
            topic: resolvedTopic || undefined,
            courseContext,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
        incrementAIQuery()
        incrementFeatureUsage('quizBurst')
        // Snapshot mastery for every topic this quiz will cover, before any
        // answer lands. The delta at the end shows the student what they
        // actually moved.
        const snap = {}
        for (const qq of data.questions ?? []) {
          const t = qq.topic ? qq.topic.trim() : null
          if (!t) continue
          const key = t.toLowerCase()
          if (key in snap) continue
          const m = getMastery(t, course?.id ?? null)
          snap[t] = m?.score ?? null
        }
        setPreMastery(snap)
        setMasteryDelta(null)
        setQuestions(data.questions)
        setQIdx(0)
        setAnswers([])
        setConfidence(null)
        setStreak(0)
        setMaxStreak(0)
        setSelected(null)
        setConfirmed(false)
        setStep('quiz')
        return
      } catch (e) {
        retries++
        if (retries >= 2) {
          track('quiz_burst_error', { error: e.message ?? 'unknown' })
          setError(e.message || 'Something went wrong. Please try again.')
          setStep('setup')
        }
      }
    }
  }

  // New flow: pick answer → confidence tap → reveal. Metacognitive
  // calibration is one of the strongest evidence-based interventions in
  // learning; making the gap visible drives real behavior change.
  function handlePick(opt) {
    if (confirmed || selected != null) return
    clearInterval(intervalRef.current)
    setSelected(opt)
    // If the timer ran out (opt=null), skip the confidence tap.
    if (opt === null) handleConfirm(opt, 1)
  }

  function handleConfirm(opt, confidenceRating) {
    if (confirmed) return
    setConfirmed(true)
    setConfidence(confidenceRating)

    const q = questions[qIdx]
    const isCorrect = opt !== null && opt === q.answer
    setFlash(isCorrect ? 'correct' : 'wrong')
    setTimeout(() => setFlash(null), 600)

    // Record calibration signal so Progress + Coach can surface confidence gaps.
    if (confidenceRating != null && q.topic) {
      recordConfidence({ rating: confidenceRating, topic: q.topic, courseId: course?.id ?? null, source: 'quiz_burst' })
    }

    const newStreak = isCorrect ? streak + 1 : 0
    setStreak(newStreak)
    setMaxStreak(prev => Math.max(prev, newStreak))
    setAnswers(prev => [...prev, { correct: isCorrect, difficulty: q.difficulty, selected: opt, confidence: confidenceRating }])

    setTimeout(() => {
      if (qIdx + 1 >= questions.length) {
        const finalAnswers = [...answers, { correct: isCorrect, difficulty: q.difficulty, selected: opt, confidence: confidenceRating }]
        const finalScore = finalAnswers.filter(a => a.correct).length
        const quizPct = Math.round((finalScore / questions.length) * 100)
        addStudySession({ tool: 'Quiz Burst', score: quizPct, topic: topic.trim() || null, courseName: course?.name || null })
        if (topic.trim()) updateMastery(topic.trim(), course?.id ?? null, quizPct, 'quiz')
        // Per-question mastery: use the topic tag the API returned so we can
        // credit or ding the right concept, not just the top-level focus.
        questions.forEach((qq, i) => {
          const perTopic = qq.topic ? qq.topic.trim() : null
          if (!perTopic) return
          const perScore = finalAnswers[i]?.correct ? 100 : 0
          updateMastery(perTopic, course?.id ?? null, perScore, 'quiz')
        })
        // Compute mastery delta: which topics crossed 70 (closed), which
        // moved up but stayed weak (improved), which are still weak.
        const closed = []
        const improved = []
        const stillWeak = []
        for (const [t, before] of Object.entries(preMastery)) {
          const after = getMastery(t, course?.id ?? null)?.score ?? null
          if (after == null) continue
          const priorScore = before ?? after // first-touch topics only report absolute
          if (priorScore < 70 && after >= 70) {
            closed.push({ topic: t, before: priorScore, after })
          } else if (after > priorScore + 2) {
            improved.push({ topic: t, before: priorScore, after })
          } else if (after < 70) {
            stillWeak.push({ topic: t, score: after })
          }
        }
        // Also look at the top remaining weak topic across the whole course.
        const nextWeak = getWeakestTopics(course?.id ?? null, 1)?.[0] ?? null
        setMasteryDelta({ closed, improved, stillWeak, nextWeak })
        // Auto-add missed questions to the deck as review cards. Fires in the
        // background so the "done" screen renders without blocking on it.
        const missedForDeck = questions
          .map((qq, i) => (finalAnswers[i]?.correct ? null : cardFromQuizMiss(qq, course?.id ?? null, course?.name ?? null)))
          .filter(Boolean)
        if (missedForDeck.length) {
          addCardsToDeck(missedForDeck, { courseIdx })
            .then(({ added }) => {
              if (added > 0) {
                track('deck_auto_added', { source: 'quiz_miss', count: added })
                window.dispatchEvent(new CustomEvent('studyedge:deck-updated', { detail: { added, source: 'quiz_miss' } }))
              }
            })
            .catch(() => {})
        }
        window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'quizBurst' } }))
        track('quiz_burst_complete', {
          score: quizPct, topic: topic.trim() || null, plan: getActivePlan(), questionCount: questions.length,
          gapsClosed: closed.length, gapsImproved: improved.length, gapsRemaining: stillWeak.length,
        })
        setStep('done')
      } else {
        setQIdx(i => i + 1)
        setSelected(null)
        setConfirmed(false)
        setConfidence(null)
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

  // Root-cause pattern: bucket misses by rootCauseType from the API and by
  // the actual distractor the student picked. Shows students the SHAPE of
  // their misunderstanding, not just what they got wrong.
  const rootCausePattern = (() => {
    if (!missedQuestions.length) return null
    const buckets = {}
    const distractorInsights = []
    for (const { q, i } of missedQuestions) {
      const rc = q.rootCauseType ?? 'unfamiliar'
      buckets[rc] = (buckets[rc] ?? 0) + 1
      const picked = answers[i]?.selected
      const tag = picked && q.distractorTags?.[picked]
      if (tag && tag !== 'correct') {
        distractorInsights.push({ topic: q.topic ?? 'this topic', tag })
      }
    }
    const topBucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
    return {
      buckets,
      topCauseType: topBucket?.[0] ?? null,
      topCauseCount: topBucket?.[1] ?? 0,
      distractorInsights: distractorInsights.slice(0, 3),
    }
  })()

  const rootCauseLabels = {
    definition_confusion: 'Definition confusion',
    mechanism_confusion: 'Mechanism confusion',
    misapplication: 'Applied it wrong',
    terminology_mixup: 'Terminology mixup',
    careless_speed: 'Speed / careless',
    unfamiliar: 'Unfamiliar material',
  }

  // Calibration score: how well does the student's self-rated confidence
  // match reality? Perfect calibration = 100. Confidence 1-5 → 20/40/60/80/100.
  // Compare to actual correctness (0 or 100). Average the gaps across
  // answered-with-confidence questions.
  const calibration = (() => {
    const rated = answers.filter(a => typeof a.confidence === 'number')
    if (!rated.length) return null
    let sumGap = 0
    let overconfidentMiss = null
    let biggestGap = -1
    let biggestGapTopic = null
    rated.forEach((a, i) => {
      const perceived = a.confidence * 20
      const actual = a.correct ? 100 : 0
      const gap = Math.abs(perceived - actual)
      sumGap += gap
      // Overconfidence = high confidence + wrong. That's the real bug.
      if (!a.correct && a.confidence >= 4) {
        const topic = questions?.[i]?.topic ?? topic?.trim() ?? 'this topic'
        if (gap > biggestGap) { biggestGap = gap; biggestGapTopic = topic }
        if (!overconfidentMiss) overconfidentMiss = topic
      }
    })
    const score = Math.round(100 - sumGap / rated.length)
    const overconfidentCount = rated.filter(a => !a.correct && a.confidence >= 4).length
    const underconfidentCount = rated.filter(a => a.correct && a.confidence <= 2).length
    return {
      score,
      overconfidentCount,
      underconfidentCount,
      overconfidentTopic: biggestGapTopic ?? overconfidentMiss,
      ratedCount: rated.length,
    }
  })()
  const q = questions?.[qIdx]
  const timePct = timeLeft / QUESTION_TIME

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick Quiz Burst" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(28,27,24,0.35)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden',
        transition: 'background 0.2s ease',
        // Opaque tinted whites — semi-transparent rgba() here would let the
        // dark backdrop bleed through the modal card during answer flash.
        background: flash === 'correct' ? '#F0FDF4' : flash === 'wrong' ? '#FEF2F2' : D.bgCard,
        animation: 'modal-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <style>{`@keyframes modal-in{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes bar-in{from{width:0}}`}</style>

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
            {/* Hero 1-tap CTA — the whole point of Wave 1. If we know the
                highest-value topic to quiz on, offer it as one big button
                and hide the manual picker until the student asks for it. */}
            {smart?.topic && !showManual && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: D.textDim, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Best pick for you right now
                </div>
                <div style={{ padding: '18px 20px', background: `linear-gradient(135deg, ${D.accent}0F 0%, ${D.accent}05 100%)`, border: `1px solid ${D.accent}33`, borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: courseColor }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: D.textMuted }}>{course?.name}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: D.text, marginBottom: 4, letterSpacing: -0.3 }}>
                    Quiz me on {smart.topic}
                  </div>
                  <div style={{ fontSize: 12.5, color: D.textMuted, marginBottom: 14 }}>
                    {smart.reason}
                  </div>
                  {(() => {
                    const { allowed: canQuiz } = canUseFeature('quizBurst')
                    return (
                      <button
                        onClick={!canQuiz ? () => onShowPaywall?.('quizBurst') : () => startQuiz(smart.topic)}
                        style={{ width: '100%', padding: '13px', background: !canQuiz ? D.blue : D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: !canQuiz ? `0 3px 12px rgba(59,97,196,0.30)` : `0 3px 12px rgba(232,83,26,0.35)` }}
                      >
                        {!canQuiz ? (hasUsedTrial() ? 'Upgrade to Pro →' : 'Start 7-day free trial →') : 'Start 5-question quiz'}
                      </button>
                    )
                  })()}
                </div>
                <button
                  onClick={() => setShowManual(true)}
                  style={{ marginTop: 12, width: '100%', padding: '8px', fontSize: 12.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                >
                  Or pick something else ▾
                </button>
              </div>
            )}

            {bridge && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: D.blue, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Since your last session</div>
                <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.45 }}>{bridge.line}</div>
                {bridge.weakestTopic && !topic.trim() && (
                  <button
                    onClick={() => setTopic(bridge.weakestTopic)}
                    style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: D.blue, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Target it now →
                  </button>
                )}
              </div>
            )}

            {unaddressedGap && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.20)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: D.amber, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Gap you left open</div>
                <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.45 }}>
                  Your brain dump on {unaddressedGap.dumpDateStr} missed <strong>{unaddressedGap.gap}</strong>{unaddressedGap.score != null ? ` (mastery ${unaddressedGap.score}/100)` : ''}.
                </div>
                {!topic.trim() && (
                  <button
                    onClick={() => setTopic(unaddressedGap.gap)}
                    style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: D.amber, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Quiz me on it →
                  </button>
                )}
              </div>
            )}

            {(showManual || !smart?.topic) && courses.length > 0 && (
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

            {(showManual || !smart?.topic) && <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Focus topic (optional)</div>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Cell signaling, Chapter 4, Mitosis" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1px solid ${D.borderStrong}`, fontSize: 14, color: D.text, background: D.bg, outline: 'none', fontFamily: 'inherit' }} />
              {!topic.trim() && suggestedTopics.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: D.textDim, alignSelf: 'center', flexShrink: 0 }}>Try:</span>
                  {suggestedTopics.map(t => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        color: D.accent, background: 'rgba(232,83,26,0.08)',
                        border: '1px solid rgba(232,83,26,0.18)',
                        cursor: 'pointer', textTransform: 'capitalize',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>}

            {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

            {(showManual || !smart?.topic) && !isPro && (() => {
              const { allowed: canQuiz, remaining } = canUseFeature('quizBurst')
              return !canQuiz ? (
                <div style={{ fontSize: 13, color: D.amber, marginBottom: 16, padding: '10px 14px', background: 'rgba(217,119,6,0.08)', borderRadius: 8, border: '1px solid rgba(217,119,6,0.20)' }}>
                  You've used your free Quiz Burst. {hasUsedTrial() ? 'Upgrade to Pro' : 'Start your 7-day free trial'} for unlimited.
                </div>
              ) : null
            })()}

            {(showManual || !smart?.topic) && !isPro && (() => {
              const { allowed: canQuiz, remaining } = canUseFeature('quizBurst')
              return (
                <button
                  onClick={!canQuiz ? () => onShowPaywall?.('quizBurst') : () => startQuiz()}
                  style={{ width: '100%', padding: '13px', background: !canQuiz ? D.blue : D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: !canQuiz ? `0 3px 12px rgba(59,97,196,0.30)` : `0 3px 12px rgba(232,83,26,0.35)` }}
                >
                  {!canQuiz ? (hasUsedTrial() ? 'Upgrade to Pro →' : 'Start 7-day free trial →') : 'Start quiz'}
                </button>
              )
            })()}

            {(showManual || !smart?.topic) && isPro && (
              <button
                onClick={() => startQuiz()}
                style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}
              >
                Start quiz
              </button>
            )}

            {!isPro && (() => {
              const { remaining } = canUseFeature('quizBurst')
              return remaining !== null && remaining > 0 ? (
                <div style={{ textAlign: 'center', fontSize: 12, color: D.textDim, marginTop: 12 }}>
                  {1 - remaining} of 1 quiz burst used
                  {' · '}<button onClick={() => onShowPaywall?.('quizBurst')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start 7-day trial'}</button>
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
              {q.whyThisQuestion && (
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: D.textDim, lineHeight: 1.45, fontStyle: 'italic' }}>
                  Why this: {q.whyThisQuestion}
                </p>
              )}
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
                    onClick={() => !confirmed && selected == null && handlePick(opt)}
                    disabled={confirmed || selected != null}
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

            {/* Confidence tap: after picking but before reveal. Tap 1 (guessing)
                → 5 (certain) and we track how well-calibrated the student is
                across the quiz. High confidence + wrong = the real gap. */}
            {selected != null && !confirmed && (
              <div style={{ padding: '14px 16px', background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.20)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.blue, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, textAlign: 'center' }}>
                  How sure are you?
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[
                    { r: 1, label: 'Guess' },
                    { r: 2, label: 'Weak' },
                    { r: 3, label: 'Ok' },
                    { r: 4, label: 'Strong' },
                    { r: 5, label: 'Certain' },
                  ].map(c => (
                    <button
                      key={c.r}
                      onClick={() => handleConfirm(selected, c.r)}
                      style={{
                        padding: '10px 4px', borderRadius: 8, cursor: 'pointer',
                        background: '#FFFFFF', border: `1.5px solid ${D.border}`,
                        color: D.text, fontFamily: 'inherit',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = D.blue; e.currentTarget.style.background = 'rgba(59,97,196,0.06)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = D.border; e.currentTarget.style.background = '#FFFFFF' }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, color: D.blue }}>{c.r}</div>
                      <div style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>{c.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: D.textDim, textAlign: 'center', fontStyle: 'italic' }}>
                  Rating BEFORE the reveal keeps you honest. This is how we spot overconfidence.
                </div>
              </div>
            )}

            {confirmed && q.explanation && (
              <ExplainAs
                concept={q.question}
                defaultText={q.explanation}
                contextText={`Correct answer: ${q.answer}${selected ? ` · Student picked: ${selected}` : ''}${confidence ? ` · Confidence ${confidence}/5` : ''}`}
                courseContext={courseContextMemo}
                preferredMode={preferredExplanationMode}
                analyticsLabel="quiz_burst_q"
              />
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
              <div style={{ margin: '12px 0', padding: '8px 12px', background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 8, fontSize: 12, color: D.blue, textAlign: 'center', fontWeight: 600 }}>
                Missed {missedQuestions.length} question{missedQuestions.length === 1 ? '' : 's'} — added to your review deck.
              </div>
            )}

            {calibration && calibration.ratedCount >= 3 && (
              <div style={{ margin: '12px 0 16px', padding: '14px 16px', background: 'rgba(147,51,234,0.05)', border: '1px solid rgba(147,51,234,0.22)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Calibration
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#7C3AED', letterSpacing: -0.3 }}>
                    {calibration.score}/100
                  </div>
                </div>
                <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5, marginBottom: 6 }}>
                  {calibration.score >= 85
                    ? 'Well calibrated — your confidence matches reality.'
                    : calibration.overconfidentCount > 0
                      ? <>You were <strong>overconfident</strong> on {calibration.overconfidentCount} miss{calibration.overconfidentCount === 1 ? '' : 'es'}{calibration.overconfidentTopic ? <>, worst on <strong>{calibration.overconfidentTopic}</strong></> : ''}. That's the real gap — you didn't know what you didn't know.</>
                      : calibration.underconfidentCount > 0
                        ? <>You were <strong>underconfident</strong> on {calibration.underconfidentCount} right answer{calibration.underconfidentCount === 1 ? '' : 's'}. You know more than you trust — push yourself harder.</>
                        : 'Your confidence signals are mixed — worth another quiz to sharpen the read.'}
                </div>
                <div style={{ fontSize: 11.5, color: D.textDim, fontStyle: 'italic' }}>
                  Research: fixing calibration alone lifts real exam scores 5-15%. The topics you're most confident and most wrong about are the ones to drill.
                </div>
              </div>
            )}

            {rootCausePattern && rootCausePattern.topCauseType && (
              <div style={{ margin: '12px 0 16px', padding: '14px 16px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.20)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.amber, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Why you missed those
                </div>
                <div style={{ fontSize: 13.5, color: D.text, marginBottom: 8, lineHeight: 1.5 }}>
                  {rootCausePattern.topCauseCount === missedQuestions.length && missedQuestions.length > 1
                    ? <>All {rootCausePattern.topCauseCount} were <strong>{rootCauseLabels[rootCausePattern.topCauseType]?.toLowerCase()}</strong>.</>
                    : <>Mostly <strong>{rootCauseLabels[rootCausePattern.topCauseType]?.toLowerCase()}</strong> ({rootCausePattern.topCauseCount}/{missedQuestions.length}).</>}
                </div>
                {rootCausePattern.distractorInsights.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rootCausePattern.distractorInsights.map((d, i) => (
                      <div key={i} style={{ fontSize: 12, color: D.textMuted, lineHeight: 1.45 }}>
                        · On <strong style={{ color: D.text }}>{d.topic}</strong>, you {d.tag}.
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 11.5, color: D.textDim, fontStyle: 'italic' }}>
                  This is a pattern, not a random miss. Fixing the pattern once fixes future questions of the same kind.
                </div>
              </div>
            )}

            {masteryDelta && (masteryDelta.closed.length > 0 || masteryDelta.improved.length > 0 || masteryDelta.stillWeak.length > 0 || masteryDelta.nextWeak) && (
              <div style={{ marginTop: 16, marginBottom: 20, padding: '14px 16px', background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.18)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.green, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Mastery moved</div>
                {masteryDelta.closed.length > 0 && (
                  <div style={{ fontSize: 13, color: D.text, marginBottom: 6 }}>
                    <strong style={{ color: D.green }}>{masteryDelta.closed.length} gap{masteryDelta.closed.length === 1 ? '' : 's'} closed:</strong>{' '}
                    {masteryDelta.closed.map(x => `${x.topic} (${x.before}→${x.after})`).join(', ')}
                  </div>
                )}
                {masteryDelta.improved.length > 0 && (
                  <div style={{ fontSize: 13, color: D.text, marginBottom: 6 }}>
                    <strong style={{ color: D.blue }}>Improved:</strong>{' '}
                    {masteryDelta.improved.map(x => `${x.topic} (${x.before}→${x.after})`).join(', ')}
                  </div>
                )}
                {masteryDelta.stillWeak.length > 0 && (
                  <div style={{ fontSize: 13, color: D.text, marginBottom: 6 }}>
                    <strong style={{ color: D.amber }}>Still weak:</strong>{' '}
                    {masteryDelta.stillWeak.map(x => `${x.topic} (${x.score})`).join(', ')}
                  </div>
                )}
                {masteryDelta.nextWeak?.topic && (
                  <div style={{ fontSize: 13, color: D.textMuted, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <strong style={{ color: D.text }}>Next up:</strong>{' '}
                    {masteryDelta.nextWeak.topic} sits at {masteryDelta.nextWeak.score}/100 — target it in your next session.
                  </div>
                )}
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
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: repair.repairSelected === rq.answer ? D.green : D.red, marginBottom: 6 }}>
                                      {repair.repairSelected === rq.answer ? 'Got it.' : 'Not quite — here\'s the fix:'}
                                    </div>
                                    <ExplainAs
                                      concept={rq.question}
                                      defaultText={rq.explanation}
                                      contextText={`Correct answer: ${rq.answer}${repair.repairSelected ? ` · Student picked: ${repair.repairSelected}` : ''}`}
                                      courseContext={courseContextMemo}
                                      preferredMode={preferredExplanationMode}
                                      compact
                                      analyticsLabel="quiz_burst_repair"
                                    />
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
              {onOpenCheatSheet && (
                <button
                  onClick={() => { onClose(); onOpenCheatSheet?.() }}
                  style={{ padding: '12px', background: 'none', border: `1.5px solid rgba(59,97,196,0.30)`, borderRadius: 10, color: D.blue, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Review weak spots
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
