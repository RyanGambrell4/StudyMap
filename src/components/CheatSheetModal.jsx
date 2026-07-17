import { useState } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, hasUsedTrial } from '../lib/subscription'
import { addStudySession } from '../lib/studyHistory'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const LIKELIHOOD_STYLE = {
  High:   { color: '#3B61C4', bg: 'rgba(59,97,196,0.10)',  border: 'rgba(59,97,196,0.20)'  },
  Medium: { color: '#D97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.20)'  },
}
const READINESS_STYLE = {
  Strong:   { color: '#16A34A', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.20)'   },
  Moderate: { color: '#D97706', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.20)'   },
  Weak:     { color: '#DC2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.20)'   },
}

function Pill({ label, style }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 999,
      color: style.color, background: style.bg, border: `1px solid ${style.border}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export default function CheatSheetModal({ courses, onClose, onShowPaywall }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const [courseIdx, setCourseIdx] = useState(0)
  const [examPrompt, setExamPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [regenerateCount, setRegenerateCount] = useState(0)
  const [step, setStep] = useState('setup') // 'setup' | 'result'

  const course = courses[courseIdx] ?? null
  const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]

  async function generate(regen = 0) {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setLoading(true)
    setError('')
    setResult(null)

    let retries = 0
    while (retries < 2) {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/cheat-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            courseName: course?.name ?? examPrompt,
            examPrompt: examPrompt || undefined,
            regenerate: regen,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
        incrementAIQuery()
        addStudySession({ tool: 'AI Cheat Sheet', score: null, topic: examPrompt.trim() || null, courseName: course?.name || null })
        setResult(data)
        setStep('result')
        setLoading(false)
        return
      } catch (e) {
        retries++
        if (retries >= 2) {
          setError(e.message || 'Something went wrong. Please try again.')
          setLoading(false)
        }
      }
    }
  }

  function handleRegenerate() {
    if (!isPro) { onShowPaywall?.('study-hacks'); return }
    if (regenerateCount >= 2) return
    const next = regenerateCount + 1
    setRegenerateCount(next)
    generate(next)
  }

  const visibleTopics = result?.topics ?? []
  const freeTopics = isPro ? visibleTopics : visibleTopics.slice(0, 1)
  const lockedCount = isPro ? 0 : visibleTopics.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 620,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)',
        border: `1px solid ${D.border}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'rgba(59,97,196,0.10)', border: '1px solid rgba(59,97,196,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="17" height="17" fill="none" stroke={D.blue} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: D.text, letterSpacing: -0.3 }}>AI Cheat Sheet</div>
            <div style={{ fontSize: 12, color: D.textMuted, marginTop: 1 }}>10 most likely exam topics, ranked by priority</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textDim }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Setup step */}
        {step === 'setup' && (
          <div style={{ padding: '24px', overflowY: 'auto' }}>
            {courses.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Select course</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {courses.map((c, i) => {
                    const dot = c.color?.dot ?? COURSE_COLORS[i % COURSE_COLORS.length]
                    const active = courseIdx === i
                    return (
                      <button key={i} onClick={() => setCourseIdx(i)} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: `1px solid ${active ? `${dot}50` : D.border}`,
                        background: active ? `${dot}12` : 'none',
                        color: active ? dot : D.textMuted,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {courses.length > 0 ? 'Describe your exam (optional)' : 'Describe your exam'}
              </div>
              <textarea
                value={examPrompt}
                onChange={e => setExamPrompt(e.target.value)}
                placeholder="e.g. Cell biology final covering chapters 8-14, focus on mitosis and protein synthesis"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${D.borderStrong}`,
                  fontSize: 14, color: D.text, lineHeight: 1.5,
                  background: D.bg, outline: 'none', resize: 'vertical',
                  minHeight: 80, fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 12, color: D.textDim, marginTop: 6 }}>
                The more specific, the more personalized your cheat sheet.
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8, border: '1px solid rgba(220,38,38,0.15)' }}>
                {error}
              </div>
            )}

            <button
              onClick={() => generate(0)}
              disabled={loading || (!course && !examPrompt.trim())}
              style={{
                width: '100%', padding: '13px',
                background: loading ? D.textDim : D.blue,
                border: 'none', borderRadius: 10, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Spinner size="xs" color="#fff" track="rgba(255,255,255,0.3)" />
                  Generating your cheat sheet...
                </>
              ) : 'Generate cheat sheet'}
            </button>

            {!isPro && (
              <div style={{ textAlign: 'center', fontSize: 12, color: D.textDim, marginTop: 12 }}>
                Free: topic 1 only. <button onClick={() => onShowPaywall?.('study-hacks')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>{hasUsedTrial() ? 'Upgrade for all 10' : 'Start free trial for all 10'}</button>
              </div>
            )}
          </div>
        )}

        {/* Result step */}
        {step === 'result' && result && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Summary bar */}
            <div style={{ padding: '14px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12, background: D.bg }}>
              <div style={{ flex: 1, fontSize: 13, color: D.textMuted }}>
                <span style={{ color: D.text, fontWeight: 700 }}>{result.totalMinutes} min</span> total review time
              </div>
              {isPro && regenerateCount < 2 && (
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  style={{ fontSize: 12, fontWeight: 600, color: D.blue, padding: '6px 12px', borderRadius: 7, border: `1px solid rgba(59,97,196,0.25)`, background: 'rgba(59,97,196,0.05)', cursor: 'pointer' }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg style={{ animation: 'spin 0.8s linear infinite' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      Regenerating
                    </span>
                  ) : 'Alternative angle'}
                </button>
              )}
              <button onClick={() => setStep('setup')} style={{ fontSize: 12, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
                Edit inputs
              </button>
            </div>

            {/* Topics */}
            <div style={{ padding: '0 0 24px' }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pill-pulse{0%,100%{opacity:0.5}50%{opacity:1}}`}</style>

              {freeTopics.map((topic, i) => (
                <div key={i} style={{
                  padding: '16px 24px',
                  borderBottom: `1px solid ${D.border}`,
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  transition: 'background 0.12s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.02)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: i === 0 ? `${courseColor}15` : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${i === 0 ? `${courseColor}30` : D.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: i === 0 ? courseColor : D.textDim,
                  }}>
                    {topic.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{topic.name}</span>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <Pill label={`Exam: ${topic.examLikelihood}`} style={LIKELIHOOD_STYLE[topic.examLikelihood] ?? LIKELIHOOD_STYLE.Medium} />
                        <Pill label={`You: ${topic.readiness}`} style={READINESS_STYLE[topic.readiness] ?? READINESS_STYLE.Moderate} />
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.5, marginBottom: 6 }}>{topic.whyLikely}</div>
                    <div style={{ fontSize: 11.5, color: D.textDim }}>~{topic.estimatedMinutes} min to review</div>
                  </div>
                </div>
              ))}

              {/* Paywall overlay for locked topics */}
              {lockedCount > 0 && (
                <div style={{ position: 'relative' }}>
                  {/* Blurred preview */}
                  {visibleTopics.slice(1, 4).map((topic, i) => (
                    <div key={i} style={{ padding: '16px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: 14, filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: D.textDim, flexShrink: 0 }}>
                        {topic.rank}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 4 }}>{topic.name}</div>
                        <div style={{ fontSize: 13, color: D.textMuted }}>{topic.whyLikely}</div>
                      </div>
                    </div>
                  ))}
                  {/* Upgrade card */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.97) 40%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                    padding: '0 24px 24px',
                  }}>
                    <div style={{
                      background: D.bgCard, borderRadius: 14, padding: '20px 24px',
                      border: `1px solid ${D.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                      textAlign: 'center', width: '100%', maxWidth: 360,
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6 }}>
                        Unlock {lockedCount} more topic{lockedCount !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: 13, color: D.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
                        Pro shows all 10 topics and lets you regenerate anytime.
                      </div>
                      <button
                        onClick={() => onShowPaywall?.('study-hacks')}
                        style={{
                          width: '100%', padding: '11px',
                          background: D.blue, border: 'none', borderRadius: 9,
                          color: '#fff', fontSize: 14, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                          boxShadow: '0 3px 12px rgba(59,97,196,0.35)',
                        }}
                      >
                        {hasUsedTrial() ? 'Upgrade to Pro' : 'Start free trial →'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
