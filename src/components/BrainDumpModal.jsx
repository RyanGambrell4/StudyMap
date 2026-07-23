import { useState, useEffect, useRef, useMemo } from 'react'
import { getAccessToken } from '../lib/supabase'
import { fetchWithRetry, aiErrorMessage } from '../lib/utils'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { transcribeAudio, createRecorder } from '../lib/deepgram'
import { getCachedStudyTools, saveStudyTools } from '../lib/db'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { updateMastery, getWeakestTopics } from '../lib/masteryStore'
import { hydrateCourseContext } from '../lib/courseContext'
import { recordBrainDumpGaps } from '../lib/brainDumpGaps'
import { pickSmartTopic, pickSmartCourse } from '../lib/smartDefault'
import { getLastSessionBridge } from '../lib/lastSessionBridge'
import GapCloser from './GapCloser'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const CATEGORY_COLORS = {
  Concepts:    '#3B61C4',
  Application: '#6366F1',
  Detail:      '#D97706',
  Connections: '#059669',
}

function ScoreRing({ score }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const pct = score / 100
  const color = score >= 75 ? D.green : score >= 55 ? D.amber : D.red

  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="8" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, letterSpacing: -1 }}>{score}%</span>
        <span style={{ fontSize: 10, color: D.textDim, fontWeight: 600, marginTop: 2 }}>readiness</span>
      </div>
    </div>
  )
}

export default function BrainDumpModal({ courses, onClose, onShowPaywall, onDrillGaps, initialTopic = '', initialCourseIdx = 0, autoStart = false, learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [] }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const initialSmartCourse = useMemo(() =>
    initialCourseIdx || pickSmartCourse(courses).index
  , [initialCourseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps
  const [courseIdx, setCourseIdx] = useState(initialSmartCourse)
  const [topic, setTopic] = useState(initialTopic)
  const [timerDuration, setTimerDuration] = useState(60)
  const [showManual, setShowManual] = useState(false)

  const suggestedTopics = useMemo(() => {
    const course = courses[courseIdx] ?? null
    return getWeakestTopics(course?.id ?? null, 3).filter(t => t.score < 80).map(t => t.topic)
  }, [courseIdx, courses])

  const smart = useMemo(() => {
    const c = courses[courseIdx] ?? null
    const ctx = hydrateCourseContext(c, { firstName, yearLevel, learningStyle, schoolType, assignments })
    return pickSmartTopic(c, ctx)
  }, [courseIdx, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  const bridge = useMemo(() => {
    const c = courses[courseIdx] ?? null
    return getLastSessionBridge({ courseId: c?.id ?? null, courseName: c?.name ?? null, currentTool: 'Brain Dump' })
  }, [courseIdx, courses])
  const [step, setStep] = useState('setup') // 'setup' | 'timer' | 'scoring' | 'result'
  const [text, setText] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [bdRecording, setBdRecording] = useState(false)
  const [bdRecorderRef] = useState(() => ({ current: null }))
  const [isConvertingCards, setIsConvertingCards] = useState(false)
  const [cardsAdded, setCardsAdded] = useState(0)
  const [closedGaps, setClosedGaps] = useState({}) // { gap: 'closed' | 'review' | 'skip' | 'partial', score? }
  const intervalRef = useRef(null)
  const textareaRef = useRef(null)

  const course = courses[courseIdx] ?? null
  const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]
  const topicLabel = topic.trim() || course?.name || 'your course material'

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  // When launched from Session Bundle Mode with a smart topic pre-filled,
  // skip the setup screen entirely.
  useEffect(() => {
    if (autoStart && (initialTopic || smart?.topic) && step === 'setup') {
      if (!topic && smart?.topic) setTopic(smart.topic)
      const t = setTimeout(() => startTimer(initialTopic || smart?.topic), 30)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const handleBdMicToggle = async () => {
    if (bdRecording) {
      bdRecorderRef.current?.stop()
      setBdRecording(false)
      return
    }

    try {
      setBdRecording(true)
      const recorder = createRecorder(async (blob) => {
        try {
          const transcript = await transcribeAudio(blob)
          if (transcript) {
            setText(prev => prev ? prev + ' ' + transcript : transcript)
          }
        } catch {
          setError('Voice input failed. Type your answer instead.')
        }
      })
      bdRecorderRef.current = recorder
      await recorder.start()
    } catch {
      setBdRecording(false)
      setError('Could not access microphone. Check your browser permissions.')
    }
  }

  function startTimer(overrideTopic = null) {
    const { allowed: canBrainDump } = canUseFeature('brainDump')
    if (!canBrainDump) { onShowPaywall?.('brainDump'); return }
    if (overrideTopic && overrideTopic !== topic) setTopic(overrideTopic)
    setTimeLeft(timerDuration)
    setRunning(true)
    setStep('timer')
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  async function handleSubmit() {
    clearInterval(intervalRef.current)
    setRunning(false)
    if (!text.trim()) {
      setStep('setup')
      setError('Nothing to score. Write something first, then submit.')
      return
    }
    setStep('scoring')
    setLoading(true)
    setError('')
    track('brain_dump_started', { topic: topic.trim() || null, courseName: course?.name ?? null })

    let retries = 0
    while (retries < 2) {
      try {
        const token = await getAccessToken()
        const courseContext = hydrateCourseContext(course, {
          firstName, yearLevel, learningStyle, schoolType, assignments,
        })
        const res = await fetchWithRetry('/api/brain-dump-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            text,
            courseName: course?.name ?? 'unknown course',
            topic: topic.trim() || undefined,
            courseContext,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw Object.assign(new Error(aiErrorMessage(res.status, data.error)), { status: res.status })
        incrementAIQuery()
        incrementFeatureUsage('brainDump')
        addWeakTopics(data.possibleGaps ?? [])
        // Persist the gaps this dump surfaced so other features (Connections,
        // Cheat Sheet, Quiz Burst) can prioritize them next time.
        recordBrainDumpGaps({
          courseId: course?.id ?? null,
          topic: topic.trim() || null,
          gaps: data.possibleGaps ?? [],
          score: data.score,
        })
        addStudySession({ tool: 'Brain Dump', score: data.score, topic: topic.trim() || null, courseName: course?.name || null })
        if (topic.trim()) updateMastery(topic.trim(), course?.id ?? null, data.score, 'brainDump')
        window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'brainDump' } }))
        track('brain_dump_scored', { score: data.score, topic: topic.trim() || null, plan: getActivePlan() })
        setResult(data)
        setStep('result')
        setLoading(false)
        return
      } catch (e) {
        retries++
        if (retries >= 2) {
          track('brain_dump_error', { error: e.message ?? 'unknown' })
          setError(aiErrorMessage(e.status, e.message))
          setLoading(false)
          setStep('setup')
        }
      }
    }
  }

  async function handleConvertToFlashcards() {
    if (!text.trim() || isConvertingCards) return
    setIsConvertingCards(true)
    try {
      const token = await getAccessToken()
      const res = await fetchWithRetry('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text,
          courseName: course?.name ?? null,
          topic: topic.trim() || undefined,
          tool: 'flashcards',
          count: 10,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(aiErrorMessage(res.status, data.error)), { status: res.status })
      const newCards = data.flashcards ?? []
      if (newCards.length > 0) {
        const existing = getCachedStudyTools() ?? {}
        const merged = [...(existing.flashcards ?? []), ...newCards]
        await saveStudyTools({ ...existing, flashcards: merged })
        setCardsAdded(newCards.length)
      }
    } catch (e) {
      setError(aiErrorMessage(e.status, e.message))
    } finally {
      setIsConvertingCards(false)
    }
  }

  const timerPct = timeLeft / timerDuration
  const timerColor = timerPct > 0.5 ? D.green : timerPct > 0.25 ? D.amber : D.red

  return (
    <div role="dialog" aria-modal="true" aria-label="Brain Dump" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 540,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden', animation: 'bd-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <style>{`
          @keyframes bd-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes spin { to { transform: rotate(360deg) } }
          @keyframes score-in { from { transform: scale(0.8); opacity: 0 } to { transform: scale(1); opacity: 1 } }
          @keyframes countdown-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        `}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" fill="none" stroke="#059669" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: D.text, letterSpacing: -0.3 }}>Brain Dump Scorer</div>
            <div style={{ fontSize: 12, color: D.textMuted, marginTop: 1 }}>Write everything you know. Get your readiness score.</div>
          </div>
          {step !== 'timer' && (
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Setup */}
        {step === 'setup' && (
          <div style={{ padding: 24, overflowY: 'auto' }}>
            {bridge && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Since your last session</div>
                <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.45 }}>{bridge.line}</div>
              </div>
            )}
            {smart?.topic && !showManual && !initialTopic && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: D.textDim, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Best pick for you right now
                </div>
                <div style={{ padding: '18px 20px', background: `linear-gradient(135deg, rgba(5,150,105,0.08) 0%, rgba(5,150,105,0.02) 100%)`, border: `1px solid rgba(5,150,105,0.25)`, borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: courseColor }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: D.textMuted }}>{course?.name}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: D.text, marginBottom: 4, letterSpacing: -0.3 }}>
                    Brain dump on {smart.topic}
                  </div>
                  <div style={{ fontSize: 12.5, color: D.textMuted, marginBottom: 14 }}>
                    {smart.reason} · {timerDuration}s of everything you know
                  </div>
                  <button
                    onClick={() => startTimer(smart.topic)}
                    style={{ width: '100%', padding: '13px', background: '#059669', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.35)' }}
                  >
                    Start {timerDuration}s brain dump
                  </button>
                </div>
                <button
                  onClick={() => setShowManual(true)}
                  style={{ marginTop: 12, width: '100%', padding: '8px', fontSize: 12.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                >
                  Or pick something else / change timer ▾
                </button>
              </div>
            )}

            {(showManual || !smart?.topic || initialTopic) && courses.length > 0 && (
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

            {(showManual || !smart?.topic || initialTopic) && <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Topic (optional)</div>
              <input
                value={topic} onChange={e => setTopic(e.target.value)}
                placeholder={`e.g. Cellular respiration, Chapter 5, Midterm material`}
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1px solid ${D.borderStrong}`, fontSize: 14, color: D.text, background: D.bg, outline: 'none', fontFamily: 'inherit' }}
              />
              {!topic.trim() && suggestedTopics.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: D.textDim, alignSelf: 'center', flexShrink: 0 }}>Try:</span>
                  {suggestedTopics.map(t => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        color: D.blue, background: 'rgba(59,97,196,0.08)',
                        border: '1px solid rgba(59,97,196,0.18)',
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

            {(showManual || !smart?.topic || initialTopic) && <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Timer duration</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[60, 90, 120].map(s => (
                  <button key={s} onClick={() => setTimerDuration(s)} style={{
                    flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${timerDuration === s ? '#059669' : D.border}`,
                    background: timerDuration === s ? 'rgba(5,150,105,0.10)' : 'none',
                    color: timerDuration === s ? '#059669' : D.textMuted,
                    cursor: 'pointer',
                  }}>
                    {s / 60} min
                  </button>
                ))}
              </div>
            </div>}

            {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

            {(showManual || !smart?.topic || initialTopic) && <button onClick={() => startTimer()} style={{ width: '100%', padding: '13px', background: '#059669', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.35)' }}>
              Start brain dump
            </button>}

            {!isPro && (() => {
              const { remaining } = canUseFeature('brainDump')
              return (
                <div style={{ textAlign: 'center', fontSize: 12, color: D.textDim, marginTop: 12 }}>
                  {remaining !== null && remaining > 0
                    ? <>{1 - remaining} of 1 brain dump used · <button onClick={() => onShowPaywall?.('study-hacks')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>Upgrade for full breakdown</button></>
                    : <>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start 7-day free trial'} for unlimited brain dumps · <button onClick={() => onShowPaywall?.('brainDump')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>Get access</button></>
                  }
                </div>
              )
            })()}
          </div>
        )}

        {/* Timer + writing */}
        {step === 'timer' && (
          <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${timerPct * 100}%`, height: '100%', background: timerColor, borderRadius: 3, transition: 'width 1s linear, background 0.5s ease' }} />
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800, letterSpacing: -0.5,
                color: timerColor, minWidth: 52, textAlign: 'right',
                animation: timeLeft <= 10 ? 'countdown-pulse 0.8s ease-in-out infinite' : 'none',
              }}>
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
              </div>
            </div>

            <div style={{ fontSize: 13, color: D.textMuted, fontWeight: 500 }}>
              Write everything you know about <strong style={{ color: D.text }}>{topicLabel}</strong>
            </div>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); if (error) setError('') }}
              placeholder="Just write. Don't stop. Don't edit. Get it all out."
              style={{
                width: '100%', boxSizing: 'border-box',
                minHeight: 220, padding: '14px', borderRadius: 12,
                border: `2px solid ${timerColor}40`,
                fontSize: 15, color: D.text, lineHeight: 1.65,
                background: D.bg, outline: 'none', resize: 'none',
                fontFamily: 'inherit', transition: 'border-color 0.5s ease',
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleBdMicToggle}
                title={bdRecording ? 'Stop recording' : 'Voice input'}
                style={{
                  width: 44, height: 44, borderRadius: 10, border: 'none', flexShrink: 0,
                  background: bdRecording ? 'rgba(239,68,68,0.1)' : 'rgba(5,150,105,0.08)',
                  color: bdRecording ? '#EF4444' : '#059669',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: bdRecording ? 'pulse 1s infinite' : 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {bdRecording
                    ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                    : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                  }
                </svg>
              </button>
              <button onClick={handleSubmit} disabled={!text.trim()} style={{
                flex: 1, padding: '12px',
                background: text.trim() ? '#059669' : D.textDim,
                border: 'none', borderRadius: 10, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}>
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Scoring state */}
        {step === 'scoring' && (
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 15, fontWeight: 600, color: D.textMuted }}>Scoring your brain dump...</div>
            <div style={{ fontSize: 13, color: D.textDim }}>Analyzing {text.trim().split(/\s+/).length} words</div>
          </div>
        )}

        {/* Result */}
        {step === 'result' && result && (
          <div style={{ overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24, animation: 'score-in 0.5s ease' }}>
              <ScoreRing score={result.score} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: D.textMuted, marginBottom: 4 }}>
                  Your readiness for <strong style={{ color: D.text }}>{topicLabel}</strong>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: -0.5, marginBottom: 4 }}>
                  {result.score}%
                </div>
                <div style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.5 }}>
                  {result.gradeProjection}
                </div>
              </div>
            </div>

            {isPro ? (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Breakdown</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(result.categories ?? {}).map(([cat, val]) => {
                      const color = CATEGORY_COLORS[cat] ?? D.blue
                      return (
                        <div key={cat}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{cat}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color }}>{val.score}/10</span>
                          </div>
                          <div style={{ height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ width: `${val.score * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                          </div>
                          {val.gap && <div style={{ fontSize: 11.5, color: D.textDim }}>Review: {val.gap}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {result.possibleGaps?.length > 0 && (() => {
                  const brainDumpContext = hydrateCourseContext(course, {
                    firstName, yearLevel, learningStyle, schoolType, assignments,
                  })
                  const closedCount = Object.values(closedGaps).filter(s => s === 'closed' || s === 'skip').length
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: D.red, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Close these gaps
                        </div>
                        {closedCount > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: D.green }}>
                            {closedCount} / {result.possibleGaps.length} handled
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: D.textDim, marginBottom: 12, lineHeight: 1.5 }}>
                        These are areas you didn't mention. Close one now (3 quick questions), add to your review deck, or mark as known.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {result.possibleGaps.map((g, i) => {
                          const status = closedGaps[g]
                          return (
                            <div
                              key={i}
                              style={{
                                padding: '12px 14px', borderRadius: 10,
                                background: status === 'closed' ? 'rgba(22,163,74,0.04)'
                                  : status === 'review' ? 'rgba(59,97,196,0.04)'
                                  : status === 'skip' ? 'rgba(0,0,0,0.02)'
                                  : status === 'partial' ? 'rgba(217,119,6,0.04)'
                                  : 'rgba(220,38,38,0.03)',
                                border: `1px solid ${status === 'closed' ? 'rgba(22,163,74,0.20)'
                                  : status === 'review' ? 'rgba(59,97,196,0.20)'
                                  : status === 'skip' ? 'rgba(0,0,0,0.06)'
                                  : status === 'partial' ? 'rgba(217,119,6,0.20)'
                                  : 'rgba(220,38,38,0.15)'}`,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'closed' ? D.green : status === 'review' ? D.blue : status === 'skip' ? D.textDim : D.red, flexShrink: 0 }} />
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: D.text, textDecoration: status === 'skip' ? 'line-through' : 'none' }}>
                                  {g}
                                </span>
                              </div>
                              <GapCloser
                                gap={g}
                                courseId={course?.id ?? null}
                                courseName={course?.name ?? null}
                                courseContext={brainDumpContext}
                                onFinished={(topic, score) => setClosedGaps(prev => ({ ...prev, [topic]: score >= 67 ? 'closed' : 'partial', score }))}
                                onDismiss={(topic, kind) => setClosedGaps(prev => ({ ...prev, [topic]: kind }))}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {result.changeSincePrior && (
                  <div style={{ padding: '10px 14px', background: 'rgba(22,163,74,0.06)', borderRadius: 10, border: '1px solid rgba(22,163,74,0.18)', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Change since last dump</div>
                    <div style={{ fontSize: 13, color: D.text, lineHeight: 1.45 }}>{result.changeSincePrior}</div>
                  </div>
                )}
                {result.syllabusCoverage && (
                  <div style={{ padding: '10px 14px', background: 'rgba(59,97,196,0.05)', borderRadius: 10, border: '1px solid rgba(59,97,196,0.15)', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Syllabus coverage</div>
                    <div style={{ fontSize: 13, color: D.text, lineHeight: 1.45 }}>{result.syllabusCoverage}</div>
                  </div>
                )}
                {result.learningStyleTip && (
                  <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.06)', borderRadius: 10, border: '1px solid rgba(217,119,6,0.18)', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Do this next</div>
                    <div style={{ fontSize: 13, color: D.text, lineHeight: 1.45 }}>{result.learningStyleTip}</div>
                  </div>
                )}
                <div style={{ padding: '14px 16px', background: 'rgba(59,97,196,0.04)', borderRadius: 10, border: '1px solid rgba(59,97,196,0.15)', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: D.textMuted }}>
                    Study <strong style={{ color: D.blue }}>{result.studyTimeToUpgrade} min</strong> of focused review to reach <strong style={{ color: D.blue }}>{result.upgradeTarget}</strong> territory.
                  </div>
                  <div style={{ fontSize: 11, color: D.textDim, marginTop: 4 }}>
                    This is an estimate. Disclaimer: AI scoring from a 60-second sprint is a readiness signal, not a grade guarantee.
                  </div>
                </div>
              </>
            ) : (
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <div style={{ filter: 'blur(6px)', userSelect: 'none', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Breakdown</div>
                  {['Concepts', 'Application', 'Detail', 'Connections'].map(cat => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{cat}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: D.blue }}>?/10</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 3 }} />
                    </div>
                  ))}
                </div>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(255,255,255,0.88)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10, gap: 10,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Full breakdown is Pro</div>
                  <div style={{ fontSize: 13, color: D.textMuted, textAlign: 'center', padding: '0 24px' }}>See category scores, gaps, and grade projection.</div>
                  <button onClick={() => onShowPaywall?.('brainDump')} style={{ background: D.blue, border: 'none', borderRadius: 9, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(59,97,196,0.35)' }}>
                    {hasUsedTrial() ? 'Upgrade to Pro' : 'Start 7-day free trial →'}
                  </button>
                </div>
              </div>
            )}

            {/* Secondary actions row */}
            <div style={{ display: 'grid', gridTemplateColumns: (result.possibleGaps?.length > 0 && onDrillGaps) ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 10 }}>
              {cardsAdded > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.20)', borderRadius: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>{cardsAdded} cards added</span>
                </div>
              ) : (
                <button
                  onClick={handleConvertToFlashcards}
                  disabled={isConvertingCards}
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(249,115,22,0.08)',
                    border: '1px solid rgba(249,115,22,0.25)', borderRadius: 10,
                    fontSize: 12.5, fontWeight: 700, color: '#F97316',
                    cursor: isConvertingCards ? 'default' : 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: isConvertingCards ? 0.7 : 1,
                  }}
                >
                  {isConvertingCards ? (
                    <><Spinner size="xs" color="#F97316" /> Generating...</>
                  ) : (
                    <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M6 8h12M6 12h7"/></svg> Flashcards</>
                  )}
                </button>
              )}
              {result.possibleGaps?.length > 0 && onDrillGaps && (
                <button
                  onClick={() => onDrillGaps(result.possibleGaps[0])}
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.20)', borderRadius: 10,
                    fontSize: 12.5, fontWeight: 700, color: D.red,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Drill Gaps
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={onClose} style={{ width: '100%', padding: '12px', background: D.blue, border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                Done
              </button>
              <button onClick={() => { setStep('setup'); setResult(null); setText(''); setError(''); setCardsAdded(0); setClosedGaps({}) }} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 600, color: D.textMuted, cursor: 'pointer', padding: '4px', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.2)', textUnderlineOffset: 3 }}>
                Run again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
