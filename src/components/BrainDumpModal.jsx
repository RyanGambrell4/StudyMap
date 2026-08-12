/**
 * BrainDumpModal - the Brain Dump flow.
 *
 * Matches design/knowledge-map/ states 3 through 7: topic pick, writing,
 * final 30 seconds, result with material, result without material. All flow
 * rules live in src/utils/brainDumpFlow.js so they can be tested without a
 * DOM; this file renders and holds state.
 *
 * Three things changed from the modal this replaces, and each fixed a way it
 * lost student work or overclaimed:
 *
 *   The student picks the topic. The old setup screen chose one for them and
 *   hid the picker behind a disclosure, and a dump with a blank topic scored
 *   into nothing because the mastery write was topic-gated. A topic is now an
 *   invariant: the timer cannot start and Submit cannot fire without one.
 *
 *   Leaving is always possible. The old modal hid its close button during the
 *   timer, so the only exits were submitting or waiting it out, and browser
 *   Back silently destroyed the text. Discard and Back now run the same
 *   confirm, and every screen has its own history entry.
 *
 *   The result screen only claims what the scorer actually did. "You missed"
 *   renders only when the server confirms the dump was compared against
 *   uploaded material, and "Added to your map." renders only after the write
 *   succeeds.
 *
 * The voice-input button and its wiring are gone. The shared transcription
 * helper it called sends no auth header to an endpoint that checks auth
 * first, so every recording failed and surfaced an error to the student. The
 * design has no such control. See the redesign report for the one-line fix
 * that would revive the helper for its other caller.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getAccessToken } from '../lib/supabase'
import { fetchWithRetry, aiErrorMessage } from '../lib/utils'
import { incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage } from '../lib/subscription'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { updateMastery } from '../lib/masteryStore'
import { hydrateCourseContext } from '../lib/courseContext'
import { recordBrainDumpGaps } from '../lib/brainDumpGaps'
import { listUploads } from '../lib/uploadRegistry'
import { KNOWLEDGE_MAP as C, KM_SERIF } from '../theme/tokens'
import {
  SCREENS, SCREEN_HASH, DUMP_SECONDS,
  canSubmit, canStart, isFinalStretch, formatClock, progressFraction,
  resolveBackAction, DISCARD_CONFIRM_MESSAGE, pickerTopics, NO_PLAN_TOPICS_HINT,
} from '../utils/brainDumpFlow'
import { planTopicsFor } from '../lib/knowledgeEvidence'
import TopicTile from './ui/TopicTile'
import { useIsMobile } from '../utils/useIsMobile'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

const EYEBROW = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: C.secondary,
}

// Score colour on the result screen. Three bands, per the design.
function scoreColor(score) {
  if (score >= 85) return C.solid
  if (score >= 70) return C.ink
  return C.shaky
}

function Eyebrow({ children }) {
  return <div style={EYEBROW}>{children}</div>
}

function Title({ text, mobile, serifSize }) {
  return (
    <h1 style={{
      fontFamily: KM_SERIF, fontWeight: 500,
      fontSize: serifSize ?? (mobile ? 32 : 44),
      lineHeight: 1.1, margin: '10px 0 0', color: C.ink,
    }}>
      {text}<span style={{ color: C.blue }}>.</span>
    </h1>
  )
}

function Primary({ label, onClick, disabled, full }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnReset,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: disabled ? C.disabled : hover ? C.blueHover : C.blue,
        color: '#fff', fontSize: 14, fontWeight: 600,
        padding: '13px 22px', borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : 'auto',
      }}
    >
      {label}
    </button>
  )
}

function BackToMap({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 500, color: C.secondary }}>
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
        <path d="M6 1L1 6l5 5" stroke={C.stale} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to map
    </button>
  )
}

function Card({ children, mobile, maxWidth }) {
  return (
    <div style={{
      margin: '30px 0 0', maxWidth: maxWidth ?? 780,
      background: C.card, border: `1px solid ${C.cardBorder}`,
      borderRadius: 16, boxShadow: C.cardShadow,
      padding: mobile ? '24px 20px' : '32px 36px 34px',
    }}>
      {children}
    </div>
  )
}

function CheckIcon({ color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ marginTop: 4, flex: 'none' }} aria-hidden="true">
      <path d="M2 7.5l3.2 3.2L12 3.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BrainDumpModal({
  courses = [], onClose, onShowPaywall, onDrillGaps, onUploadNotes,
  initialTopic = '', initialCourseIdx = 0,
  learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [],
  embedded = false,
}) {
  const mobile = useIsMobile()

  const [courseIdx, setCourseIdx] = useState(initialCourseIdx || 0)
  const [topic, setTopic] = useState(initialTopic ?? '')
  const [screen, setScreen] = useState(SCREENS.PICK)
  const [text, setText] = useState('')
  const [timeLeft, setTimeLeft] = useState(DUMP_SECONDS)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [hasUploads, setHasUploads] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const intervalRef = useRef(null)
  const textareaRef = useRef(null)
  const submittingRef = useRef(false)
  const screenRef = useRef(screen)
  const textRef = useRef(text)
  useEffect(() => { screenRef.current = screen }, [screen])
  useEffect(() => { textRef.current = text }, [text])

  const course = courses[courseIdx] ?? null
  const courseId = course?.id ?? null

  const suggestions = useMemo(
    () => pickerTopics({ planTopics: planTopicsFor(courseId) }).slice(0, 8),
    [courseId],
  )

  // Whether this course has anything uploaded, so the pick screen can promise
  // what the scorer will actually do rather than the design's happy path.
  useEffect(() => {
    let cancelled = false
    if (courseId == null) { setHasUploads(false); return }
    listUploads(courseId)
      .then(u => { if (!cancelled) setHasUploads(Array.isArray(u) && u.length > 0) })
      .catch(() => { if (!cancelled) setHasUploads(false) })
    return () => { cancelled = true }
  }, [courseId])

  const exitToMap = useCallback(() => { onClose?.() }, [onClose])

  const discard = useCallback(() => {
    if (!window.confirm(DISCARD_CONFIRM_MESSAGE)) return false
    track('brain_dump_discarded', { topic: topic.trim() || null })
    clearInterval(intervalRef.current)
    setRunning(false)
    exitToMap()
    return true
  }, [exitToMap, topic])

  // ── History ────────────────────────────────────────────────────────────────
  // Every screen gets its own entry, following the overlay pattern in
  // OutputView: push on entry, and let popstate decide what Back means.
  // Back from the writing screen runs the same confirm as Discard, so it can
  // never silently throw away what the student wrote.
  useEffect(() => {
    if (embedded) return
    window.history.pushState({ brainDump: screen }, '', `#${SCREEN_HASH[screen]}`)
  }, [screen, embedded])

  useEffect(() => {
    if (embedded) return
    const onPop = () => {
      const action = resolveBackAction(screenRef.current)
      if (action === 'ignore') {
        // Nothing to return to mid-request; hold the student where they are.
        window.history.pushState({ brainDump: screenRef.current }, '', `#${SCREEN_HASH[screenRef.current]}`)
        return
      }
      if (action === 'confirm-discard') {
        if (!discard()) {
          // Declined. Put back the entry the browser just consumed so a
          // second Back offers the same choice again.
          window.history.pushState({ brainDump: SCREENS.WRITING }, '', `#${SCREEN_HASH[SCREENS.WRITING]}`)
        }
        return
      }
      exitToMap()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [discard, exitToMap, embedded])

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          handleSubmit({ auto: true })
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    if (screen === SCREENS.WRITING) setTimeout(() => textareaRef.current?.focus(), 80)
  }, [screen])

  // Arriving from the hero, a topic row, or the session bundle means the topic
  // is already chosen, so the pick screen is skipped. The paywall check still
  // runs, because startTimer is the only way into the writing screen.
  const prefillHandled = useRef(false)
  useEffect(() => {
    if (prefillHandled.current) return
    if (!(initialTopic ?? '').trim()) return
    prefillHandled.current = true
    startTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic])

  function startTimer() {
    if (!canStart({ topic })) return
    const { allowed } = canUseFeature('brainDump')
    if (!allowed) { onShowPaywall?.('brainDump'); return }
    setTimeLeft(DUMP_SECONDS)
    setRunning(true)
    setScreen(SCREENS.WRITING)
  }

  async function handleSubmit({ auto = false } = {}) {
    const currentText = textRef.current
    // At 0:00 the dump submits itself. With nothing written there is nothing
    // to score, so an auto-submit on an empty page returns to the map rather
    // than burning an AI credit on whitespace.
    if (!canSubmit({ topic, text: currentText })) {
      if (auto) { exitToMap(); return }
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true

    clearInterval(intervalRef.current)
    setRunning(false)
    setScreen(SCREENS.SCORING)
    setError('')
    track('brain_dump_started', { topic: topic.trim(), courseName: course?.name ?? null, auto })

    try {
      const token = await getAccessToken()
      const courseContext = hydrateCourseContext(course, { firstName, yearLevel, learningStyle, schoolType, assignments })
      const res = await fetchWithRetry('/api/brain-dump-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: currentText,
          courseName: course?.name ?? 'unknown course',
          courseId: courseId ?? undefined,
          topic: topic.trim(),
          courseContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(aiErrorMessage(res.status, data.error)), { status: res.status })

      incrementAIQuery()
      incrementFeatureUsage('brainDump')
      addWeakTopics(data.possibleGaps ?? [])
      recordBrainDumpGaps({ courseId, topic: topic.trim(), gaps: data.possibleGaps ?? [], score: data.score })
      addStudySession({ tool: 'Brain Dump', score: data.score, topic: topic.trim(), courseName: course?.name || null })
      // masteryStore is no longer what the Knowledge Map reads, but other
      // surfaces still do (Smart Start, Comeback, Review Queue), so the write
      // stays until those are migrated.
      updateMastery(topic.trim(), courseId, data.score, 'brainDump')
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', {
        detail: {
          tool: 'brainDump',
          score: data.score,
          topic: topic.trim() || null,
          courseId,
          courseName: course?.name ?? null,
          // What she could not produce from memory is exactly what a sub-floor
          // score should offer to drill.
          gaps: data.possibleGaps ?? [],
        },
      }))
      track('brain_dump_scored', { score: data.score, topic: topic.trim(), recorded: Boolean(data.recorded), plan: getActivePlan() })

      setResult(data)
      setScreen(SCREENS.RESULT)
    } catch (e) {
      track('brain_dump_error', { error: e.message ?? 'unknown' })
      setError(aiErrorMessage(e.status, e.message))
      setScreen(SCREENS.WRITING)
    } finally {
      submittingRef.current = false
    }
  }

  // Retry the evidence write only. This never re-scores: the score on screen
  // stays the score, and no AI credit is spent fixing a database problem.
  async function retryRecord() {
    if (retrying || !result?.artifactId) return
    setRetrying(true)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/record-brain-dump-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifactId: result.artifactId }),
      })
      const data = await res.json()
      setResult(prev => ({ ...prev, recorded: Boolean(data.recorded), retryable: Boolean(data.retryable) }))
      if (data.recorded) {
        track('brain_dump_record_retry_succeeded', { topic: topic.trim() })
        // `silent` because this is a database retry, not a second session.
        // Consumers that count completions still want the event; the reward
        // layer must not respond again to a score already shown to the student.
        window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'brainDump', silent: true } }))
      } else {
        track('brain_dump_record_retry_failed', { topic: topic.trim(), retryable: Boolean(data.retryable) })
      }
    } catch {
      setResult(prev => ({ ...prev, recorded: false, retryable: true }))
    } finally {
      setRetrying(false)
    }
  }

  const shell = (children) => (
    <div style={{
      ...(embedded
        ? {}
        : { position: 'fixed', inset: 0, zIndex: 70, overflowY: 'auto' }),
      background: C.pageBg, minHeight: embedded ? undefined : '100vh',
      padding: mobile ? '28px 18px 64px' : '44px 100px 96px',
      overflowX: 'hidden',
    }}>
      {children}
    </div>
  )

  // ── Topic pick ─────────────────────────────────────────────────────────────
  if (screen === SCREENS.PICK) {
    return shell(
      <>
        {!embedded && <BackToMap onClick={exitToMap} />}
        <div style={{ margin: embedded ? 0 : '36px 0 0' }}><Eyebrow>Brain Dump</Eyebrow></div>
        <Title text="Prove what you know" mobile={mobile} />

        <Card mobile={mobile}>
          {courses.length > 0 && (
            <>
              <Eyebrow>Course</Eyebrow>
              <div style={{ display: 'flex', gap: 8, margin: '14px 0 0', flexWrap: 'wrap' }}>
                {courses.map((c, i) => (
                  <button
                    key={c.id ?? i}
                    type="button"
                    onClick={() => { setCourseIdx(i); setTopic('') }}
                    style={{
                      ...btnReset,
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                      background: courseIdx === i ? C.blue : C.card,
                      color: courseIdx === i ? '#fff' : C.ink,
                      border: `1px solid ${courseIdx === i ? C.blue : C.cardBorder}`,
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ margin: '28px 0 0' }}><Eyebrow>Topic</Eyebrow></div>
          {suggestions.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, margin: '14px 0 0', flexWrap: 'wrap' }}>
              {suggestions.map(t => (
                <TopicTile key={t} label={t} active={topic === t} onClick={() => setTopic(t)} />
              ))}
            </div>
          ) : (
            <p style={{ margin: '14px 0 0', fontSize: 13, color: C.stale }}>{NO_PLAN_TOPICS_HINT}</p>
          )}

          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Or type any topic"
            style={{
              margin: '18px 0 0', width: mobile ? '100%' : 360, maxWidth: '100%',
              padding: '11px 14px', border: `1px solid ${C.cardBorder}`, borderRadius: 10,
              font: 'inherit', fontSize: 14, color: C.ink, background: C.card, outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          <div style={{ height: 1, background: C.rowRule, margin: '28px 0 0' }} />
          <p style={{ margin: '22px 0 0', fontSize: 14, color: C.secondary }}>
            You will get 3 minutes to write everything you can.{' '}
            {hasUploads
              ? 'It gets scored against your own material.'
              : 'It gets scored on general coverage of the topic, since nothing is uploaded for this course yet.'}
          </p>
          <div style={{ margin: '20px 0 0' }}>
            <Primary
              label="Start, 3 minutes on the clock"
              full={mobile}
              disabled={!canStart({ topic })}
              onClick={startTimer}
            />
          </div>
          {error && <p style={{ margin: '14px 0 0', fontSize: 13, color: C.shaky }}>{error}</p>}
        </Card>
      </>,
    )
  }

  // ── Writing ────────────────────────────────────────────────────────────────
  if (screen === SCREENS.WRITING) {
    const finalStretch = isFinalStretch(timeLeft)
    const clockColor = finalStretch ? C.shaky : C.ink
    const words = text.trim() ? text.trim().split(/\s+/).length : 0

    return shell(
      <>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: mobile ? 16 : 40, flexDirection: mobile ? 'column' : 'row',
        }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Brain Dump</Eyebrow>
            <Title text={topic.trim()} mobile={mobile} serifSize={mobile ? 28 : 44} />
          </div>
          <div style={{ textAlign: mobile ? 'left' : 'right', paddingTop: 6, flex: 'none' }}>
            <div style={{
              fontFamily: KM_SERIF, fontSize: mobile ? 34 : 44, fontWeight: 500,
              lineHeight: 1, letterSpacing: '.01em', color: clockColor,
            }}>
              {formatClock(timeLeft)}
            </div>
            <div style={{
              width: mobile ? 140 : 180, height: 4, borderRadius: 2,
              background: C.cardBorder, margin: '12px 0 0', overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressFraction(timeLeft) * 100}%`, height: '100%',
                background: finalStretch ? C.shaky : C.blue, borderRadius: 2,
                transition: 'width 1s linear',
              }} />
            </div>
            <div style={{ ...EYEBROW, color: finalStretch ? C.shaky : C.secondary, margin: '9px 0 0' }}>
              {finalStretch ? 'Final 30 seconds' : 'Time left'}
            </div>
          </div>
        </div>

        <div style={{
          margin: '28px 0 0', background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 16, boxShadow: C.cardShadow,
          padding: mobile ? '20px 18px' : '28px 32px 26px',
        }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); if (error) setError('') }}
            placeholder="Just write. Do not stop, do not edit."
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: mobile ? 240 : 340,
              border: 'none', outline: 'none', resize: 'vertical',
              font: 'inherit', fontSize: 16, lineHeight: 1.75, color: C.ink,
              background: 'transparent',
            }}
          />
          <div style={{ height: 1, background: C.rowRule, margin: '8px 0 0' }} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            margin: '20px 0 0', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 13, color: C.secondary }}>
              {words} {words === 1 ? 'word' : 'words'} so far
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <button type="button" onClick={discard} style={{ ...btnReset, fontSize: 13, fontWeight: 500, color: C.secondary }}>
                Discard
              </button>
              <Primary
                label="Submit"
                disabled={!canSubmit({ topic, text })}
                onClick={() => handleSubmit()}
              />
            </div>
          </div>
        </div>

        {error && <p style={{ margin: '16px 0 0', fontSize: 13, color: C.shaky }}>{error}</p>}
        <p style={{ margin: '16px 0 0', fontSize: 13, color: C.secondary }}>
          {isFinalStretch(timeLeft)
            ? 'At 0:00 the dump submits itself. Nothing you have written is lost.'
            : 'Submitting early is fine. Discard asks you to confirm, then returns you to the map with nothing recorded.'}
        </p>
      </>,
    )
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  if (screen === SCREENS.SCORING) {
    return shell(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
        <Spinner size="md" />
        <div style={{ fontSize: 15, color: C.secondary }}>Scoring your dump on {topic.trim()}.</div>
      </div>,
    )
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  const score = typeof result?.score === 'number' ? result.score : null
  const compared = Boolean(result?.material?.compared)
  const covered = result?.covered ?? []
  const missed = compared ? (result?.missed ?? []) : []
  const files = result?.material?.files ?? []
  const recorded = Boolean(result?.recorded)

  return shell(
    <>
      <Eyebrow>Brain Dump result</Eyebrow>
      <div style={{
        display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end',
        justifyContent: 'space-between', gap: mobile ? 12 : 40, margin: '10px 0 0',
        flexDirection: mobile ? 'column' : 'row',
      }}>
        <h1 style={{
          fontFamily: KM_SERIF, fontWeight: 500, fontSize: mobile ? 30 : 44,
          lineHeight: 1.1, margin: 0, color: C.ink,
        }}>
          {topic.trim()}<span style={{ color: C.blue }}>.</span>
        </h1>
        {score !== null && (
          <div style={{ textAlign: mobile ? 'left' : 'right', flex: 'none' }}>
            <div style={{
              fontFamily: KM_SERIF, fontSize: mobile ? 52 : 62, fontWeight: 500,
              lineHeight: .95, color: scoreColor(score),
            }}>
              {score}
            </div>
            <div style={{ ...EYEBROW, margin: '8px 0 0' }}>Readiness</div>
          </div>
        )}
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 15, color: C.secondary, maxWidth: 640 }}>
        {compared
          ? `Scored against ${files.length ? files.join(' and ') : 'your uploaded material'}.`
          : 'Scored on general coverage of this topic, upload notes for a sharper read.'}
      </p>

      <div style={{
        margin: '30px 0 0', maxWidth: compared ? undefined : 720,
        background: C.card, border: `1px solid ${C.cardBorder}`,
        borderRadius: 16, boxShadow: C.cardShadow,
        padding: mobile ? '24px 20px' : '30px 34px 32px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: compared && !mobile ? '1fr 1fr' : '1fr',
          gap: mobile ? 28 : 48,
        }}>
          <div>
            <Eyebrow>You covered</Eyebrow>
            {covered.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0 0' }}>
                {covered.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <CheckIcon color={C.solid} />
                    <span style={{ fontSize: 15, lineHeight: 1.5, color: C.ink }}>{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: '18px 0 0', fontSize: 14, color: C.secondary }}>
                Nothing specific came through clearly enough to list.
              </p>
            )}
          </div>

          {compared && (
            <div>
              <Eyebrow>You missed</Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0 0' }}>
                {missed.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.shaky, marginTop: 7, flex: 'none' }} />
                    <div>
                      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.ink }}>{m.point}</div>
                      {m.source && <div style={{ fontSize: 13, color: C.secondary, marginTop: 3 }}>{m.source}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!compared && (
          <>
            <div style={{ height: 1, background: C.rowRule, margin: '26px 0' }} />
            <div style={{ fontSize: 15, lineHeight: 1.6, color: C.ink, fontWeight: 500 }}>
              No material uploaded for this topic yet
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: C.secondary, maxWidth: 520 }}>
              There is no missed list here because there is nothing of yours to compare against. Add your lecture
              notes or slides for {course?.name ?? 'this course'} and the next dump on this topic gets checked point by point.
            </p>
            {onUploadNotes && courseId != null && (
              <button
                type="button"
                onClick={() => onUploadNotes(courseId)}
                style={{ ...btnReset, display: 'inline-block', margin: '14px 0 0', fontSize: 13, fontWeight: 500, color: C.blue }}
              >
                Upload notes for {course?.name ?? 'this course'}
              </button>
            )}
          </>
        )}

        <div style={{ height: 1, background: C.rowRule, margin: '26px 0 0' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '20px 0 0', fontSize: 14, color: C.secondary }}>
          {recorded ? (
            <>
              <CheckIcon color={C.secondary} />
              <span>Added to your map. {topic.trim()} now reads {score !== null && score >= 80 ? 'Solid' : 'Shaky'}.</span>
            </>
          ) : (
            <span style={{ color: C.shaky }}>
              This score was not saved to your map. Your {score} still stands and nothing you wrote was lost.
              {result?.retryable && result?.artifactId ? (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={retryRecord}
                    disabled={retrying}
                    style={{ ...btnReset, color: C.blue, fontWeight: 600, cursor: retrying ? 'default' : 'pointer' }}
                  >
                    {retrying ? 'Saving.' : 'Try saving it again'}
                  </button>
                </>
              ) : (
                ' Retrying will not help with this one, so it is worth reporting.'
              )}
            </span>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 26, margin: '26px 0 0',
        flexDirection: mobile ? 'column' : 'row',
        alignItems: mobile ? 'stretch' : 'center',
      }}>
        <Primary
          label={embedded && onDrillGaps ? 'Next up' : 'Back to the map'}
          full={mobile}
          onClick={() => { if (embedded && onDrillGaps) onDrillGaps(topic.trim()); else exitToMap() }}
        />
        <button
          type="button"
          onClick={() => { setResult(null); setText(''); setTimeLeft(DUMP_SECONDS); setScreen(SCREENS.PICK) }}
          style={{ ...btnReset, fontSize: 13, fontWeight: 500, color: C.secondary, textAlign: 'center' }}
        >
          Dump this topic again
        </button>
      </div>
    </>,
  )
}
