import { useState, useRef, useEffect } from 'react'
import { getAccessToken } from '../lib/supabase'
import { fetchWithRetry, aiErrorMessage } from '../lib/utils'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { updateMastery, getWeakestTopics, getMastery } from '../lib/masteryStore'
import { getCachedStudyTools } from '../lib/db'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#3B61C4', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']

function ScoreSparkline({ history, color }) {
  if (!history || history.length < 2) return null
  const W = 80, H = 24, pad = 4
  const min = 0, max = 100
  const xs = history.map((_, i) => pad + (i / (history.length - 1)) * (W - pad * 2))
  const ys = history.map(s => H - pad - ((s - min) / (max - min)) * (H - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke={`${color}40`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')}/>
      <path fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={d}/>
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === history.length - 1 ? 3.5 : 2} fill={i === history.length - 1 ? color : '#fff'} stroke={color} strokeWidth="1.5"/>
      ))}
    </svg>
  )
}

export default function TeachItBackModal({ courses, onClose, onShowPaywall, initialCourseIdx = 0, initialTopic = '', autoStart = false }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const [courseIdx, setCourseIdx] = useState(initialCourseIdx)
  const [topic, setTopic] = useState(initialTopic)
  const [explanation, setExplanation] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState('')
  const [step, setStep] = useState(autoStart && initialTopic ? 'explain' : 'setup') // setup | explain | evaluating | result | followup | final
  const [result, setResult] = useState(null)
  const [prevMasteryScore, setPrevMasteryScore] = useState(null)
  const [sessionCount, setSessionCount] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [error, setError] = useState('')
  const [displayScore, setDisplayScore] = useState(0)
  const textareaRef = useRef(null)
  const scoreTimerRef = useRef(null)

  // Animate score from 0 to result.score over ~900ms when result arrives
  useEffect(() => {
    if (!result?.score) return
    const target = result.score
    const duration = 900
    const start = performance.now()
    clearInterval(scoreTimerRef.current)
    scoreTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(eased * target))
      if (progress >= 1) clearInterval(scoreTimerRef.current)
    }, 16)
    return () => clearInterval(scoreTimerRef.current)
  }, [result?.score])

  const course = courses[courseIdx] ?? null
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]
  const topicLabel = topic.trim() || 'this topic'

  async function submitExplanation() {
    if (!explanation.trim()) return
    const { allowed } = canUseFeature('teachItBack')
    if (!allowed) { onShowPaywall?.('teachItBack'); return }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setStep('evaluating')
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetchWithRetry('/api/teach-it-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course?.name ?? 'this course',
          topic: topic.trim() || 'this topic',
          explanation: explanation.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(aiErrorMessage(res.status, data.error)), { status: res.status })
      incrementAIQuery()
      incrementFeatureUsage('teachItBack')
      addWeakTopics(data.missing ?? [])
      addStudySession({ tool: 'Teach It Back', score: data.score, topic: topic.trim() || null, courseName: course?.name || null })
      const prevEntry = topic.trim() ? getMastery(topic.trim(), course?.id ?? null) : null
      if (prevEntry?.count >= 1) setPrevMasteryScore(prevEntry.score)
      setSessionCount((prevEntry?.count ?? 0) + 1)
      if (topic.trim()) updateMastery(topic.trim(), course?.id ?? null, data.score, 'teachItBack')
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'teachItBack' } }))
      track('teach_it_back_scored', { score: data.score, topic: topic.trim() || null, plan, hasFollowUp: Boolean(data.followUp) })
      setResult(data)
      setStep('result')
    } catch (e) {
      setError(aiErrorMessage(e.status, e.message))
      setStep('explain')
    }
  }

  async function submitFollowUp() {
    if (!followUpAnswer.trim()) return
    setStep('evaluating')
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetchWithRetry('/api/teach-it-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course?.name ?? 'this course',
          topic: topic.trim() || 'this topic',
          explanation: explanation.trim(),
          phase: 'followup',
          followUpQuestion: result.followUp,
          followUpAnswer: followUpAnswer.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(aiErrorMessage(res.status, data.error)), { status: res.status })
      track('teach_it_back_followup_scored', { understood: data.understood })
      setFinalResult(data)
      setStep('final')
    } catch (e) {
      setError(aiErrorMessage(e.status, e.message))
      setStep('followup')
    }
  }

  function reset() {
    track('teach_it_back_retry')
    setStep('setup')
    setTopic('')
    setExplanation('')
    setFollowUpAnswer('')
    setResult(null)
    setPrevMasteryScore(null)
    setSessionCount(null)
    setFinalResult(null)
    setError('')
  }

  const scoreColor = result ? (result.score >= 85 ? D.green : result.score >= 60 ? D.amber : D.red) : D.text

  return (
    <div role="dialog" aria-modal="true" aria-label="Teach It Back" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <style>{`@keyframes tib-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 540,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden', animation: 'tib-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(59,97,196,0.10)', border: '1px solid rgba(59,97,196,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke={D.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Teach It Back</div>
            <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>
              {step === 'setup' && 'Explain a concept to see how well you really know it'}
              {step === 'explain' && `Explaining: ${topicLabel}`}
              {step === 'evaluating' && 'Analyzing your explanation...'}
              {step === 'result' && `Score: ${result?.score ?? ''}%`}
              {step === 'followup' && 'Follow-up question'}
              {step === 'final' && (finalResult?.understood ? 'You got it.' : 'Keep reviewing.')}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Setup */}
          {step === 'setup' && (
            <div style={{ padding: 24 }}>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>What do you want to explain?</div>
                {(() => {
                  const courseId = courses[courseIdx]?.id ?? null
                  const masteryWeak = getWeakestTopics(courseId, 4).filter(w => w.score < 75)
                  // When there's no mastery data yet, suggest terms from flashcards
                  const flashcardSuggestions = masteryWeak.length === 0 && !topic.trim()
                    ? (getCachedStudyTools()?.flashcards ?? [])
                        .map(c => c.front).filter(Boolean)
                        .slice(0, 4)
                        .map(t => ({ topic: t }))
                    : []
                  const suggestions = masteryWeak.length > 0 ? masteryWeak : flashcardSuggestions
                  const label = masteryWeak.length > 0 ? 'Weak spots:' : 'From your notes:'
                  if (!suggestions.length || topic.trim()) return null
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: D.textDim, alignSelf: 'center', marginRight: 2 }}>{label}</span>
                      {suggestions.map(w => (
                        <button
                          key={w.topic}
                          onClick={() => setTopic(w.topic)}
                          style={{ fontSize: 12, fontWeight: 600, color: '#7C3AED', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {w.topic}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && topic.trim() && setStep('explain')}
                  placeholder="e.g. Natural selection, Supply and demand, The French Revolution"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1px solid ${D.borderStrong}`, fontSize: 14, color: D.text, background: D.bg, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ padding: '12px 14px', background: 'rgba(59,97,196,0.05)', borderRadius: 10, border: '1px solid rgba(59,97,196,0.14)', marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: D.textMuted, lineHeight: 1.5 }}>
                  Explain it as if you were teaching a friend who's never heard of it. We score your explanation for accuracy, flag the gaps, and ask a follow-up to test what actually stuck.
                </p>
              </div>

              {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

              <button
                onClick={() => topic.trim() ? setStep('explain') : null}
                disabled={!topic.trim()}
                style={{ width: '100%', padding: '13px', background: topic.trim() ? D.accent : 'rgba(59,97,196,0.3)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: topic.trim() ? 'pointer' : 'default', fontFamily: 'inherit', boxShadow: topic.trim() ? '0 3px 12px rgba(59,97,196,0.35)' : 'none' }}
              >
                Start explaining
              </button>
            </div>
          )}

          {/* Explain */}
          {step === 'explain' && (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your topic</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: D.text, letterSpacing: '-0.01em' }}>{topic}</p>
              </div>

              <div style={{ marginBottom: 6 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Explain it in your own words</p>
              </div>
              <textarea
                ref={textareaRef}
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                autoFocus
                placeholder={`Explain ${topic} as if you're teaching it to someone who has never heard of it. Cover the key ideas, how it works, and why it matters.`}
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 220,
                  padding: '14px', borderRadius: 12, border: `1px solid ${D.borderStrong}`,
                  fontSize: 14, color: D.text, background: D.bg, outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 20 }}>
                <span style={{ fontSize: 12, color: D.textDim }}>{explanation.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span style={{ fontSize: 12, color: explanation.trim().split(/\s+/).filter(Boolean).length >= 30 ? D.green : D.textDim }}>
                  {explanation.trim().split(/\s+/).filter(Boolean).length >= 30 ? 'Good length' : 'Aim for at least 30 words'}
                </span>
              </div>

              {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('setup')} style={{ padding: '12px 16px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Back
                </button>
                <button
                  onClick={submitExplanation}
                  disabled={explanation.trim().length < 10}
                  style={{ flex: 1, padding: '12px', background: explanation.trim().length >= 10 ? D.accent : 'rgba(59,97,196,0.3)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: explanation.trim().length >= 10 ? 'pointer' : 'default', fontFamily: 'inherit' }}
                >
                  Submit explanation
                </button>
              </div>
            </div>
          )}

          {/* Evaluating */}
          {step === 'evaluating' && (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Spinner size="lg" />
              <div style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>Evaluating your explanation...</div>
            </div>
          )}

          {/* Result */}
          {step === 'result' && result && (
            <div style={{ padding: 24 }}>
              {/* Score */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute' }}>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8"/>
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={scoreColor} strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 52}`}
                      strokeDashoffset={`${2 * Math.PI * 52 * (1 - displayScore / 100)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                    />
                  </svg>
                  <div style={{ fontSize: 44, fontWeight: 900, color: scoreColor, letterSpacing: -2, lineHeight: 1, width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {displayScore}%
                  </div>
                </div>
                <div style={{ fontSize: 14, color: D.textMuted, marginTop: 4, lineHeight: 1.5 }}>{result.verdict}</div>
                {sessionCount > 1 && (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: D.textDim }}>Session {sessionCount} on this topic</div>
                )}
                {prevMasteryScore != null && (() => {
                  const blended = Math.round(prevMasteryScore * 0.6 + result.score * 0.4)
                  const delta = blended - prevMasteryScore
                  if (Math.abs(delta) < 2) return null
                  const up = delta > 0
                  return (
                    <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: up ? D.green : D.red, background: up ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${up ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`, borderRadius: 8, padding: '3px 10px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d={up ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
                      </svg>
                      {up ? '+' : ''}{delta}% vs last session
                    </div>
                  )
                })()}
                {(() => {
                  const courseId = course?.id ?? null
                  const entry = topic.trim() ? getMastery(topic.trim(), courseId) : null
                  const history = entry?.history ?? []
                  if (history.length < 2) return null
                  return (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: D.textDim, fontWeight: 600 }}>Score trend</span>
                      <ScoreSparkline history={history} color={scoreColor}/>
                    </div>
                  )
                })()}
              </div>

              {/* What you got right */}
              {result.got_right?.length > 0 && (
                <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(22,163,74,0.05)', borderRadius: 10, border: '1px solid rgba(22,163,74,0.15)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.green, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>What you got right</div>
                  {result.got_right.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < result.got_right.length - 1 ? 6 : 0 }}>
                      <span style={{ color: D.green, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>+</span>
                      <span style={{ fontSize: 13, color: D.text, lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* What's missing */}
              {result.missing?.length > 0 && (
                <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(220,38,38,0.04)', borderRadius: 10, border: '1px solid rgba(220,38,38,0.14)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.red, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Gaps to address</div>
                  {result.missing.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < result.missing.length - 1 ? 6 : 0 }}>
                      <span style={{ color: D.red, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>-</span>
                      <span style={{ fontSize: 13, color: D.text, lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up */}
              {result.followUp && (
                <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(59,97,196,0.05)', borderRadius: 12, border: '1px solid rgba(59,97,196,0.18)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Follow-up question</div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: D.text, lineHeight: 1.5 }}>{result.followUp}</p>
                </div>
              )}

              {(() => {
                const courseId = courses[courseIdx]?.id ?? null
                const nextWeak = getWeakestTopics(courseId, 6)
                  .filter(w => w.score < 75 && w.topic.toLowerCase() !== topic.toLowerCase())[0]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {result.score >= 80 ? (
                      <>
                        {nextWeak && (
                          <button
                            onClick={() => { track('teach_it_back_next_weak_topic', { topic: nextWeak.topic }); setTopic(nextWeak.topic); setExplanation(''); setResult(null); setStep('explain') }}
                            style={{ padding: '12px', background: '#7C3AED', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(124,58,237,0.30)' }}
                          >
                            Next weak topic: {nextWeak.topic}
                          </button>
                        )}
                        <button
                          onClick={reset}
                          style={{ padding: '12px', background: nextWeak ? 'none' : D.accent, border: nextWeak ? `1px solid ${D.border}` : 'none', borderRadius: 10, color: nextWeak ? D.textMuted : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Try another topic
                        </button>
                        {result.followUp && (
                          <button
                            onClick={() => { setFollowUpAnswer(''); setStep('followup') }}
                            style={{ padding: '11px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Answer the follow-up question
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {result.followUp && (
                          <button
                            onClick={() => { setFollowUpAnswer(''); setStep('followup') }}
                            style={{ padding: '12px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(59,97,196,0.30)' }}
                          >
                            Answer the follow-up to finish
                          </button>
                        )}
                        {nextWeak && (
                          <button
                            onClick={() => { track('teach_it_back_next_weak_topic', { topic: nextWeak.topic }); setTopic(nextWeak.topic); setExplanation(''); setResult(null); setStep('explain') }}
                            style={{ padding: '11px', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10, color: '#7C3AED', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Try next weak topic: {nextWeak.topic}
                          </button>
                        )}
                        {!result.followUp && (
                          <button
                            onClick={reset}
                            style={{ padding: '11px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Try another topic
                          </button>
                        )}
                        {result.followUp && (
                          <p style={{ margin: 0, textAlign: 'center', fontSize: 11.5, color: D.textDim }}>
                            Answer the follow-up question to complete this session.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Follow-up */}
          {step === 'followup' && result && (
            <div style={{ padding: 24 }}>
              <div style={{ padding: '14px 16px', background: 'rgba(59,97,196,0.05)', borderRadius: 12, border: '1px solid rgba(59,97,196,0.18)', marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Follow-up question</div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: D.text, lineHeight: 1.5 }}>{result.followUp}</p>
              </div>

              <textarea
                value={followUpAnswer}
                onChange={e => setFollowUpAnswer(e.target.value)}
                autoFocus
                placeholder="Answer this question in your own words..."
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 140,
                  padding: '14px', borderRadius: 12, border: `1px solid ${D.borderStrong}`,
                  fontSize: 14, color: D.text, background: D.bg, outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', marginBottom: 20,
                }}
              />

              {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('result')} style={{ padding: '12px 16px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Back
                </button>
                <button
                  onClick={submitFollowUp}
                  disabled={!followUpAnswer.trim()}
                  style={{ flex: 1, padding: '12px', background: followUpAnswer.trim() ? D.accent : 'rgba(59,97,196,0.3)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: followUpAnswer.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}
                >
                  Submit answer
                </button>
              </div>
            </div>
          )}

          {/* Final */}
          {step === 'final' && finalResult && (
            <div style={{ padding: 24 }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: finalResult.understood ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.08)', border: `1px solid ${finalResult.understood ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.20)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  {finalResult.understood ? (
                    <svg width="24" height="24" fill="none" stroke={D.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : (
                    <svg width="24" height="24" fill="none" stroke={D.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  )}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: finalResult.understood ? D.green : D.red, marginBottom: 6 }}>
                  {finalResult.understood ? 'You got it.' : 'Keep reviewing.'}
                </div>
              </div>

              <div style={{ padding: '14px 16px', background: D.bg, borderRadius: 12, border: `1px solid ${D.border}`, marginBottom: 24 }}>
                <p style={{ margin: 0, fontSize: 14, color: D.text, lineHeight: 1.6 }}>{finalResult.feedback}</p>
              </div>

              {(() => {
                const courseId = courses[courseIdx]?.id ?? null
                const nextWeak = getWeakestTopics(courseId, 6)
                  .filter(w => w.score < 75 && w.topic.toLowerCase() !== topic.toLowerCase())[0]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {nextWeak && (
                      <button
                        onClick={() => { track('teach_it_back_next_weak_topic', { topic: nextWeak.topic }); setTopic(nextWeak.topic); setExplanation(''); setResult(null); setFinalResult(null); setPrevMasteryScore(null); setStep('explain') }}
                        style={{ padding: '12px', background: '#7C3AED', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(124,58,237,0.30)' }}
                      >
                        Next weak topic: {nextWeak.topic}
                      </button>
                    )}
                    <button onClick={reset} style={{ padding: '12px', background: nextWeak ? 'none' : D.accent, border: nextWeak ? `1px solid ${D.border}` : 'none', borderRadius: 10, color: nextWeak ? D.textMuted : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: nextWeak ? 'none' : '0 3px 12px rgba(59,97,196,0.30)' }}>
                      Try another topic
                    </button>
                    <button onClick={onClose} style={{ padding: '10px', background: 'none', border: 'none', color: D.textDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Done
                    </button>
                  </div>
                )
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
