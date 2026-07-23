import { useState, useEffect, useRef, useMemo } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { getCachedStudyTools } from '../lib/db'
import { addStudySession } from '../lib/studyHistory'
import { hydrateCourseContext } from '../lib/courseContext'
import { updateMastery } from '../lib/masteryStore'
import { pickSmartCourse } from '../lib/smartDefault'
import { getLastSessionBridge } from '../lib/lastSessionBridge'
import { addCardsToDeck, cardFromConnectionMiss } from '../lib/deckAdditions'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#059669', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']

// ── Visual concept-pair diagram ────────────────────────────────────────────
// Two circles joined by an arrow. In cross-course mode the origin course
// shows above each node so the bridge is legible. On reveal, the arrow's
// hover-label carries the ideal relationship the student was supposed to
// see, making the shape memorable.

const BRIDGE_LABELS = {
  'cause-effect': 'CAUSE → EFFECT',
  'sub-category': 'CATEGORY → SUBTYPE',
  'contrast': 'CONTRAST',
  'analogous-mechanism': 'ANALOGOUS MECHANISM',
  'shared-principle': 'SHARED PRINCIPLE',
  'temporal-sequence': 'BEFORE → AFTER',
}

function ConnectionDiagram({ conceptA, conceptB, originA, originB, bridgeType, idealAnswer, revealed }) {
  const D = {
    node: '#059669', nodeBg: 'rgba(5,150,105,0.08)', nodeBorder: 'rgba(5,150,105,0.30)',
    arrow: revealed ? '#059669' : '#9B9B9B',
    text: '#111111', muted: '#6B6B6B',
  }
  const bridgeLabel = bridgeType ? BRIDGE_LABELS[bridgeType] ?? bridgeType.toUpperCase() : null
  const isCross = originA && originB && originA !== originB

  return (
    <div style={{ background: '#FAFAF9', borderRadius: 14, padding: '20px 16px', border: '1px solid rgba(0,0,0,0.07)' }}>
      {isCross && (
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: '#7C3AED', textTransform: 'uppercase', textAlign: 'center', marginBottom: 12 }}>
          Cross-course bridge ✦
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 6, alignItems: 'center' }}>
        {/* Node A */}
        <div style={{ textAlign: 'center' }}>
          {originA && <div style={{ fontSize: 10, fontWeight: 700, color: '#6B6B6B', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{originA}</div>}
          <div style={{ padding: '12px 10px', borderRadius: 12, background: D.nodeBg, border: `1.5px solid ${D.nodeBorder}`, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: D.text, lineHeight: 1.3 }}>{conceptA}</div>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ textAlign: 'center' }}>
          {bridgeLabel && (
            <div style={{ fontSize: 9.5, fontWeight: 700, color: revealed ? '#059669' : '#9B9B9B', marginBottom: 4, letterSpacing: '0.08em' }}>
              {bridgeLabel}
            </div>
          )}
          <svg width="100%" height="24" viewBox="0 0 80 24" style={{ maxWidth: 90 }}>
            <line x1="4" y1="12" x2="72" y2="12" stroke={D.arrow} strokeWidth="2" strokeDasharray={revealed ? '0' : '4 3'} />
            <polygon points="70,6 78,12 70,18" fill={D.arrow} />
          </svg>
          {revealed && (
            <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 700, marginTop: 4 }}>REVEALED</div>
          )}
        </div>

        {/* Node B */}
        <div style={{ textAlign: 'center' }}>
          {originB && <div style={{ fontSize: 10, fontWeight: 700, color: '#6B6B6B', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{originB}</div>}
          <div style={{ padding: '12px 10px', borderRadius: 12, background: D.nodeBg, border: `1.5px solid ${D.nodeBorder}`, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: D.text, lineHeight: 1.3 }}>{conceptB}</div>
          </div>
        </div>
      </div>

      {revealed && idealAnswer && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(5,150,105,0.06)', borderRadius: 10, border: '1px solid rgba(5,150,105,0.22)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>The bridge</div>
          <div style={{ fontSize: 12.5, color: '#111', lineHeight: 1.5 }}>{idealAnswer}</div>
        </div>
      )}
    </div>
  )
}

export default function ConnectionsModeModal({ courses, onClose, onShowPaywall, learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [] }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const initialSmartCourse = useMemo(() => pickSmartCourse(courses).index, [courses])
  const [courseIdx, setCourseIdx] = useState(initialSmartCourse)
  const [showManual, setShowManual] = useState(false)
  // Cross-course mode is only meaningful when the student actually has 2+
  // courses to pool from. Otherwise the toggle disappears.
  const canCrossCourse = courses.length >= 2
  const [crossCourse, setCrossCourse] = useState(false)

  const bridge = useMemo(() => {
    const c = courses[courseIdx] ?? null
    return getLastSessionBridge({ courseId: c?.id ?? null, courseName: c?.name ?? null, currentTool: 'Connections' })
  }, [courseIdx, courses])
  const [step, setStep] = useState('setup') // setup | generating | cards | scoring | done
  const [connections, setConnections] = useState([])
  const [cardIdx, setCardIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [scores, setScores] = useState([]) // { score, feedback, keyRelationship }
  const latestScoresRef = useRef([])
  const [error, setError] = useState('')

  const course = courses[courseIdx] ?? null
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]
  const current = connections[cardIdx]
  const totalCards = connections.length
  const avgScore = scores.length ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : 0

  async function generate() {
    const { allowed } = canUseFeature('connectionsMode')
    if (!allowed) { onShowPaywall?.('connectionsMode'); return }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setStep('generating')
    setError('')
    track('connections_started', { courseName: course?.name ?? null, plan })

    const cached = getCachedStudyTools()
    const flashcards = cached?.flashcards ?? []
    const concepts = flashcards.map(c => c.front).filter(Boolean)
    const courseContext = hydrateCourseContext(course, {
      firstName, yearLevel, learningStyle, schoolType, assignments,
    })
    // Cross-course pool: hydrate context for every OTHER course so the API
    // can pair concepts across the student's whole curriculum. No generic
    // AI can do this — it needs the same student's other course data.
    const extraCourseContexts = crossCourse
      ? courses
          .filter((_, i) => i !== courseIdx)
          .map(c => hydrateCourseContext(c, { firstName, yearLevel, learningStyle, schoolType, assignments }))
      : []

    try {
      const token = await getAccessToken()
      const res = await fetch('/api/connections-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phase: 'generate',
          courseName: course?.name ?? 'this course',
          concepts: concepts.length ? concepts : undefined,
          courseContext,
          crossCourse,
          extraCourseContexts,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      if (data.needsMoreContext) {
        setError('Not enough course material yet to make real connections. Add a syllabus or run Study Tools first.')
        setStep('setup')
        return
      }
      incrementAIQuery()
      incrementFeatureUsage('connectionsMode')
      track('connections_generated', { cardCount: data.connections?.length ?? 0, plan, usingFlashcards: concepts.length > 0 })
      setConnections(data.connections ?? [])
      setCardIdx(0)
      setScores([])
      setAnswer('')
      setStep('cards')
    } catch (e) {
      track('connections_error', { error: e.message ?? 'unknown' })
      setError(e.message || 'Something went wrong. Please try again.')
      setStep('setup')
    }
  }

  async function scoreAnswer() {
    if (!answer.trim() || !current) return
    setStep('scoring')
    setError('')
    try {
      const token = await getAccessToken()
      const courseContext = hydrateCourseContext(course, {
        firstName, yearLevel, learningStyle, schoolType, assignments,
      })
      const res = await fetch('/api/connections-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phase: 'score',
          courseName: course?.name ?? 'this course',
          conceptA: current.conceptA,
          conceptB: current.conceptB,
          question: current.question,
          answer: answer.trim(),
          courseContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      track('connections_answer_scored', { score: data.score, cardNumber: cardIdx + 1 })
      // Feed the mastery store so this session actually moves the needle in
      // the student's other features (cheat sheet ranking, quiz burst focus).
      if (data.gapTopic) updateMastery(data.gapTopic, course?.id ?? null, data.score ?? 0, 'connections')
      if (current.conceptA) updateMastery(current.conceptA, course?.id ?? null, data.score ?? 0, 'connections')
      if (current.conceptB) updateMastery(current.conceptB, course?.id ?? null, data.score ?? 0, 'connections')
      // Failed connections (<70) auto-add to the deck so the student sees
      // this same relationship again in flashcard form. Studies show
      // spaced-repetition on the exact miss is the fastest way to lock it in.
      if ((data.score ?? 0) < 70) {
        addCardsToDeck([cardFromConnectionMiss(current, course?.id ?? null, course?.name ?? null)], { courseIdx })
          .then(({ added }) => {
            if (added > 0) {
              track('deck_auto_added', { source: 'connection_miss', count: added })
              window.dispatchEvent(new CustomEvent('studyedge:deck-updated', { detail: { added, source: 'connection_miss' } }))
            }
          })
          .catch(() => {})
      }
      const updatedScores = [...scores, data]
      setScores(updatedScores)
      latestScoresRef.current = updatedScores
      setStep('scored')
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setStep('cards')
    }
  }

  function nextCard() {
    if (cardIdx + 1 >= totalCards) {
      const finalScores = latestScoresRef.current.length ? latestScoresRef.current : scores
      const finalAvg = finalScores.length ? Math.round(finalScores.reduce((s, r) => s + r.score, 0) / finalScores.length) : 0
      addStudySession({ tool: 'Connections', score: finalAvg, topic: null, courseName: course?.name || null })
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'connections' } }))
      track('connections_session_complete', { avgScore: finalAvg, cardCount: totalCards })
      setStep('done')
    } else {
      setCardIdx(i => i + 1)
      setAnswer('')
      setStep('cards')
    }
  }

  function reset() {
    track('connections_retry')
    setStep('setup')
    setConnections([])
    setCardIdx(0)
    setScores([])
    setAnswer('')
    setError('')
  }

  const scoreColor = (s) => s >= 80 ? D.green : s >= 55 ? D.amber : D.red

  return (
    <div role="dialog" aria-modal="true" aria-label="Connections Mode" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <style>{`@keyframes cm-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 540,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden', animation: 'cm-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke={D.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
              <path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Connections</div>
            <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>
              {step === 'setup' && 'Explain the link between two concepts. AI scores how well you see it.'}
              {step === 'generating' && 'Finding connections...'}
              {(step === 'cards' || step === 'scoring') && totalCards > 0 && `Connection ${cardIdx + 1} of ${totalCards}`}
              {step === 'scored' && totalCards > 0 && `Connection ${cardIdx + 1} of ${totalCards}`}
              {step === 'done' && `Session complete · Avg ${avgScore}%`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          {(step === 'cards' || step === 'scored') && totalCards > 0 && (
            <div style={{ fontSize: 12, color: D.textDim, fontVariantNumeric: 'tabular-nums' }}>
              <div style={{ width: 80, height: 4, background: 'rgba(0,0,0,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((cardIdx + (step === 'scored' ? 1 : 0)) / totalCards) * 100}%`, background: D.accent, borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Setup */}
          {step === 'setup' && (
            <div style={{ padding: 24 }}>
              {bridge && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Since your last session</div>
                  <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.45 }}>{bridge.line}</div>
                </div>
              )}
              {course && !showManual && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: D.textDim, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>Best pick for you right now</div>
                  <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(5,150,105,0.08) 0%, rgba(5,150,105,0.02) 100%)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: courseColor }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textMuted }}>{course.name}</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: D.text, marginBottom: 4, letterSpacing: -0.3 }}>
                      {crossCourse ? '5 pairs across all your courses' : '5 concept pairs from this course'}
                    </div>
                    <div style={{ fontSize: 12.5, color: D.textMuted, marginBottom: 12 }}>
                      {crossCourse
                        ? `Bridges ${course.name} with your ${courses.length - 1} other course${courses.length - 1 === 1 ? '' : 's'}. No generic AI has this.`
                        : 'Prioritized around your weak topics · you\'ll explain each link, we\'ll score it'}
                    </div>

                    {canCrossCourse && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: 3, background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}>
                        <button
                          onClick={() => setCrossCourse(false)}
                          style={{
                            flex: 1, padding: '7px 8px', borderRadius: 6,
                            background: !crossCourse ? '#FFFFFF' : 'transparent',
                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 12, fontWeight: 700,
                            color: !crossCourse ? D.text : D.textMuted,
                            boxShadow: !crossCourse ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          In-course
                        </button>
                        <button
                          onClick={() => setCrossCourse(true)}
                          style={{
                            flex: 1, padding: '7px 8px', borderRadius: 6,
                            background: crossCourse ? '#FFFFFF' : 'transparent',
                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 12, fontWeight: 700,
                            color: crossCourse ? D.accent : D.textMuted,
                            boxShadow: crossCourse ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          Cross-course ✦
                        </button>
                      </div>
                    )}

                    <button
                      onClick={generate}
                      style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.35)' }}
                    >
                      Find my connections
                    </button>
                  </div>
                  <button
                    onClick={() => setShowManual(true)}
                    style={{ marginTop: 12, width: '100%', padding: '8px', fontSize: 12.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    Or pick a different course ▾
                  </button>
                </div>
              )}
              {showManual && courses.length > 0 && (
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

              {showManual && (
                <div style={{ padding: '12px 14px', background: 'rgba(5,150,105,0.05)', borderRadius: 10, border: '1px solid rgba(5,150,105,0.15)', marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: D.textMuted, lineHeight: 1.5 }}>
                    Generates 5 pairs of related concepts from your course and asks you to explain the connection between them. We score your answer and show you the key relationship.
                    {getCachedStudyTools()?.flashcards?.length > 0 && (
                      <span style={{ color: D.accent, fontWeight: 600 }}> Using your {getCachedStudyTools().flashcards.length} saved flashcards.</span>
                    )}
                  </p>
                </div>
              )}

              {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

              {showManual && (
                <button
                  onClick={generate}
                  style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.35)' }}
                >
                  Find connections
                </button>
              )}
            </div>
          )}

          {/* Generating */}
          {step === 'generating' && (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Spinner size="lg" />
              <div style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>Finding connections in your material...</div>
            </div>
          )}

          {/* Cards */}
          {step === 'cards' && current && (
            <div style={{ padding: 24 }}>
              {/* Visual concept pair — two nodes joined by a labeled arrow.
                  In cross-course mode we tag each node with its origin course
                  so the student sees the bridge. */}
              <ConnectionDiagram
                conceptA={current.conceptA}
                conceptB={current.conceptB}
                originA={current.conceptAOrigin}
                originB={current.conceptBOrigin}
                bridgeType={current.bridgeType}
                idealAnswer={null}
                revealed={false}
              />
              <p style={{ margin: '12px 0 20px', fontSize: 15, fontWeight: 600, color: D.text, lineHeight: 1.5, textAlign: 'center' }}>{current.question}</p>

              <div style={{ marginBottom: 6 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your answer</p>
              </div>
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                autoFocus
                placeholder="Explain how these two concepts connect or relate to each other..."
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 130,
                  padding: '14px', borderRadius: 12, border: `1px solid ${D.borderStrong}`,
                  fontSize: 14, color: D.text, background: D.bg, outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', marginBottom: 20,
                }}
              />

              <button
                onClick={scoreAnswer}
                disabled={!answer.trim()}
                style={{ width: '100%', padding: '13px', background: answer.trim() ? D.accent : 'rgba(5,150,105,0.3)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: answer.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}
              >
                Check my answer
              </button>
            </div>
          )}

          {/* Scoring */}
          {step === 'scoring' && (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Spinner size="lg" />
              <div style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>Scoring your answer...</div>
            </div>
          )}

          {/* Scored */}
          {step === 'scored' && scores.length > 0 && current && (() => {
            const latest = scores[scores.length - 1]
            const sc = scoreColor(latest.score)
            return (
              <div style={{ padding: 24 }}>
                {/* Concept pair recap — same visual pattern as the question,
                    but with the arrow now labeled with the ideal relationship
                    so the student sees the shape of the answer. */}
                <ConnectionDiagram
                  conceptA={current.conceptA}
                  conceptB={current.conceptB}
                  originA={current.conceptAOrigin}
                  originB={current.conceptBOrigin}
                  bridgeType={current.bridgeType}
                  idealAnswer={latest.keyRelationship}
                  revealed={true}
                />

                {/* Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: D.bg, borderRadius: 14, border: `1px solid ${D.border}`, marginBottom: 14 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: sc, letterSpacing: -1, lineHeight: 1, flexShrink: 0 }}>{latest.score}%</div>
                  <p style={{ margin: 0, fontSize: 13.5, color: D.text, lineHeight: 1.55 }}>{latest.feedback}</p>
                </div>

                {/* Key relationship */}
                <div style={{ padding: '12px 14px', background: 'rgba(5,150,105,0.05)', borderRadius: 10, border: '1px solid rgba(5,150,105,0.18)', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Key relationship</div>
                  <p style={{ margin: 0, fontSize: 13.5, color: D.text, lineHeight: 1.5, fontWeight: 500 }}>{latest.keyRelationship}</p>
                </div>

                {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

                <button
                  onClick={nextCard}
                  style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.30)' }}
                >
                  {cardIdx + 1 >= totalCards ? 'See results' : 'Next connection'}
                </button>
              </div>
            )
          })()}

          {/* Done */}
          {step === 'done' && (
            <div style={{ padding: 24 }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Avg score</div>
                <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(avgScore), letterSpacing: -3, lineHeight: 1 }}>{avgScore}%</div>
                <div style={{ fontSize: 14, color: D.textMuted, marginTop: 8 }}>
                  {avgScore >= 80 ? 'Strong relational understanding.' : avgScore >= 60 ? 'Decent grasp, a few connections to strengthen.' : 'Worth another pass on these relationships.'}
                </div>
              </div>

              {/* Per-card breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {connections.map((conn, i) => {
                  const sc = scores[i]
                  if (!sc) return null
                  const c = scoreColor(sc.score)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: D.bg, borderRadius: 10, border: `1px solid ${D.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{conn.conceptA}</span>
                        <span style={{ fontSize: 12, color: D.textDim, margin: '0 6px' }}>+</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{conn.conceptB}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: c, flexShrink: 0 }}>{sc.score}%</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={reset} style={{ padding: '12px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(5,150,105,0.30)' }}>
                  Go again
                </button>
                <button onClick={onClose} style={{ padding: '10px', background: 'none', border: 'none', color: D.textDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Done
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
