/**
 * ACT 3: THE BUILD. Ten seconds, not three.
 *
 * The instinct is to make loading fast. That instinct is wrong here and the
 * research is unambiguous: perceived effort equals perceived value, and users
 * given an instant result distrust the personalisation. We are claiming to
 * build a semester plan. Three seconds makes that claim look like a lie.
 *
 * If this feels slow in an internal demo, that is the design working. Shorten
 * it only if the funnel data says so, never because it felt long on the third
 * viewing.
 *
 * The real backend call starts at mount and runs in parallel. If it finishes
 * early the animation still runs its full ten seconds. If it is slower, the
 * ring HOLDS AT 92% with the last label pulsing rather than lying its way to
 * 100, and the real latency is reported so slow generation shows up as a
 * measurable bug instead of a silently bad experience.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { DURATION, SPRING, EASE, useReducedMotion } from '../../lib/motion'
import { celebrate, TIER } from '../../lib/celebration'
import { trackBuildCompleted } from '../../lib/analytics'
import { buildOnboardingPlan } from '../../lib/onboardingPlan'
import ExamCountdown from './ExamCountdown'
import { T, SERIF, RADIUS } from '../../theme/tokens'

const TOTAL_MS = 10000
const HOLD_PCT = 92        // where the ring waits if the backend is slow
const SETTLE_MS = 400      // hold at 100% before advancing

const RING_SIZE = 168
const RING_STROKE = 9
const RADIUS_PX = (RING_SIZE - RING_STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS_PX

function stagesFor(courseName, topicCount) {
  const course = courseName || 'your course'
  // Never a fabricated count. With no real number we name the course alone.
  const mapping = topicCount
    ? `Mapping ${course} to ${topicCount} core topics`
    : `Mapping ${course} to its core topics`

  return [
    { label: 'Reading your course profile',      at: 0,    to: 2400 },
    { label: mapping,                            at: 2400, to: 4900 },
    { label: 'Calculating your grade trajectory', at: 4900, to: 7300 },
    { label: 'Building your 14 day plan',         at: 7300, to: 10000 },
  ]
}

function StageRow({ stage, done, active, reduced }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 30 }}>
      <span
        aria-hidden="true"
        style={{
          width: 20, height: 20, flexShrink: 0, borderRadius: 999,
          background: done ? T.green : 'transparent',
          border: done ? 'none' : `2px solid ${T.border}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {done ? (
          <motion.svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduced ? { duration: DURATION.micro } : { ...SPRING.reward, duration: 0.32 }}
          >
            <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        ) : null}
      </span>

      <motion.span
        animate={{ opacity: done || active ? 1 : 0.6 }}
        transition={{ duration: reduced ? DURATION.micro : DURATION.standard }}
        style={{ fontSize: 14.5, color: T.text, fontWeight: done || active ? 600 : 500, lineHeight: 1.4 }}
      >
        {stage.label}
      </motion.span>
    </div>
  )
}

export default function BuildScreen({ state, onDone }) {
  const reduced = useReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [waiting, setWaiting] = useState(false)

  const progress = useMotionValue(0)
  const dash = useTransform(progress, (p) => `${(p / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`)
  const [pctText, setPctText] = useState(0)

  const startedRef = useRef(Date.now())
  const finishedRef = useRef(false)
  const resultRef = useRef(null)

  // ── Real work, kicked off at mount, in parallel with the theatre ──────────
  useEffect(() => {
    const controller = new AbortController()
    buildOnboardingPlan(state, { signal: controller.signal }).then((r) => {
      resultRef.current = r
      setResult(r)
    })
    return () => controller.abort()
  }, [state])

  // ── The clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf
    const tick = () => {
      const ms = Date.now() - startedRef.current
      setElapsed(ms)

      if (ms < TOTAL_MS) {
        raf = requestAnimationFrame(tick)
        return
      }
      // Ten seconds are up. Only finish if the real work is also done.
      if (!resultRef.current) {
        setWaiting(true)
        raf = requestAnimationFrame(tick)
        return
      }
      if (!finishedRef.current) {
        finishedRef.current = true
        finish()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Ring ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const linear = Math.min(100, (elapsed / TOTAL_MS) * 100)
    // Hold at 92 rather than stalling at 97 or faking forward motion.
    const target = waiting && !result ? Math.min(HOLD_PCT, linear) : linear
    const controls = animate(progress, target, { duration: 0.4, ease: EASE.out })
    return () => controls.stop()
  }, [elapsed, waiting, result, progress])

  useEffect(() => progress.on('change', (v) => setPctText(Math.round(v))), [progress])

  function finish() {
    const r = resultRef.current
    const actual = Date.now() - startedRef.current
    trackBuildCompleted({
      actual_duration_ms: actual,
      backend_latency_ms: r?.latencyMs ?? null,
      backend_ok: !!r?.ok,
    })
    celebrate({ tier: TIER.SMALL, trigger: 'build_screen_completed' })
    setTimeout(() => onDone?.(r), SETTLE_MS)
  }

  const stages = useMemo(
    () => stagesFor(state?.course?.name, result?.topicCount ?? null),
    [state?.course?.name, result?.topicCount],
  )

  const activeIndex = stages.findIndex((s) => elapsed >= s.at && elapsed < s.to)

  // ── Reduced motion: no stage theatre, still gated on the real call ────────
  if (reduced) {
    const pct = Math.min(100, (elapsed / TOTAL_MS) * 100)
    return (
      <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: T.text, margin: 0 }}>
            Building your plan
          </h1>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            style={{ marginTop: 20, height: 8, borderRadius: RADIUS.pill, background: T.neutralBg, overflow: 'hidden' }}
          >
            <div style={{ width: `${waiting && !result ? HOLD_PCT : pct}%`, height: '100%', background: T.blue }} />
          </div>
          <p style={{ marginTop: 14, fontSize: 14, color: T.muted }} aria-live="polite">
            {stages[Math.max(0, activeIndex)]?.label ?? 'Finishing up'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'absolute', top: 18, right: 20 }}>
        <ExamCountdown examDate={state?.examDate} compact />
      </div>

      <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS_PX}
            fill="none" stroke={T.neutralBg} strokeWidth={RING_STROKE}
          />
          <motion.circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS_PX}
            fill="none" stroke={T.blue} strokeWidth={RING_STROKE} strokeLinecap="round"
            style={{ strokeDasharray: dash }}
          />
        </svg>
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pctText}
        >
          <span style={{ fontSize: 38, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {pctText}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginTop: 3 }}>PERCENT</span>
        </div>
      </div>

      <div style={{ marginTop: 34, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
        {stages.map((stage, i) => (
          <StageRow
            key={stage.label}
            stage={stage}
            done={elapsed >= stage.to && !(waiting && !result && i === stages.length - 1)}
            active={i === activeIndex || (waiting && !result && i === stages.length - 1)}
            reduced={reduced}
          />
        ))}
      </div>

      {waiting && !result ? (
        <motion.p
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ marginTop: 22, fontSize: 13, color: T.muted }}
        >
          Still working. This one is taking a moment.
        </motion.p>
      ) : null}
    </div>
  )
}
