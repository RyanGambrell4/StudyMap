/**
 * ACT 4: THE REVEAL. This is the peak.
 *
 * The choreography below is not approximate. The payoff depends on the
 * ordering, and specifically on the CTA arriving LAST. If the CTA is available
 * at 400ms the user taps past the peak and it never lands.
 *
 *   0ms      content blurred, 96% scale
 *   0-400ms  blur clears, scale resolves, ui spring
 *   400ms    headline legible
 *   500ms    axes draw, 300ms
 *   800ms    two lines draw left to right, 1200ms
 *   1400ms   the big number starts counting
 *   2300ms   number lands, MEDIUM celebration at the number itself
 *   2500ms   subhead fades in
 *   2700ms   the three locked cards unblur, staggered 80ms
 *   3400ms   CTA fades in
 *
 * The chart is two inline SVG paths. It does not get a chart library: two
 * animated paths do not justify a dependency, and a library will fight this
 * timeline.
 *
 * HONESTY GUARDRAIL: the projection is a modeled outcome, not a guarantee. The
 * caption under the chart is required, legible, and not a 9px grey footnote.
 * A grade guarantee is both an App Store risk and a refund magnet.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { DURATION, SPRING, EASE, useReducedMotion } from '../../lib/motion'
import { celebrate, TIER } from '../../lib/celebration'
import { trackRevealViewed, trackRevealCtaTapped } from '../../lib/analytics'
import { buildInsights, currentGradeValue, targetGradeValue } from '../../lib/onboardingInsights'
import { formatShortDate } from '../../utils/dateUtils'
import ExamCountdown from './ExamCountdown'
import { T, SERIF, RADIUS } from '../../theme/tokens'

// Millisecond marks. Keep these in one place so the sequence stays auditable.
const MARK = {
  headline: 400,
  axes: 500,
  lines: 800,
  countStart: 1400,
  countEnd: 2300,
  subhead: 2500,
  cards: 2700,
  cta: 3400,
}

const CHART_W = 320
const CHART_H = 150
const PAD_L = 8
const PAD_R = 8
const PAD_T = 12
const PAD_B = 22

/** Map a grade value to a y coordinate. 55 to 100 covers every anchor we use. */
function yFor(grade) {
  const lo = 55
  const hi = 100
  const t = Math.min(1, Math.max(0, (grade - lo) / (hi - lo)))
  return PAD_T + (1 - t) * (CHART_H - PAD_T - PAD_B)
}

function CountingNumber({ from, to, start, reduced, onLand }) {
  const ref = useRef(null)
  const mv = useMotionValue(from)
  const [shown, setShown] = useState(reduced ? to : from)
  const [pop, setPop] = useState(false)

  useEffect(() => mv.on('change', (v) => setShown(Math.round(v))), [mv])

  useEffect(() => {
    if (reduced) {
      setShown(to)
      const t = setTimeout(() => onLand?.(ref), 200)
      return () => clearTimeout(t)
    }
    const timer = setTimeout(() => {
      const controls = animate(mv, to, {
        duration: (MARK.countEnd - MARK.countStart) / 1000,
        ease: EASE.out,
        onComplete: () => {
          setPop(true)
          onLand?.(ref)
          setTimeout(() => setPop(false), 320)
        },
      })
      return () => controls.stop()
    }, start)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.span
      ref={ref}
      animate={{ scale: pop ? 1.08 : 1 }}
      transition={reduced ? { duration: DURATION.micro } : SPRING.celebration}
      style={{
        display: 'inline-block',
        fontSize: 58,
        fontWeight: 800,
        color: T.blue,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}
    >
      {shown}
    </motion.span>
  )
}

function ProjectionChart({ current, projected, reduced }) {
  const yNow = yFor(current)
  const yEnd = yFor(projected)
  const x0 = PAD_L
  const x1 = CHART_W - PAD_R
  const xMid = (x0 + x1) / 2

  // Flat grey line: where they finish on current pace.
  const flat = `M ${x0} ${yNow} L ${x1} ${yNow}`
  // Climbing accent line: gentle curve so it reads as a trajectory, not a ramp.
  const climb = `M ${x0} ${yNow} Q ${xMid} ${yNow - (yNow - yEnd) * 0.72} ${x1} ${yEnd}`

  const drawTransition = reduced
    ? { duration: DURATION.micro }
    : { duration: 1.2, ease: EASE.out, delay: MARK.lines / 1000 }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label={`Projected grade rising from ${current} to ${projected}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Axes */}
      <motion.line
        x1={x0} y1={CHART_H - PAD_B} x2={x1} y2={CHART_H - PAD_B}
        stroke={T.border} strokeWidth="1"
        initial={reduced ? { opacity: 1 } : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={reduced ? { duration: DURATION.micro } : { duration: 0.3, delay: MARK.axes / 1000, ease: EASE.out }}
      />

      <motion.path
        d={flat}
        fill="none"
        stroke={T.neutral}
        strokeWidth="2.5"
        strokeDasharray="5 5"
        strokeLinecap="round"
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={drawTransition}
      />

      <motion.path
        d={climb}
        fill="none"
        stroke={T.blue}
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={drawTransition}
      />

      <motion.circle
        cx={x1} cy={yEnd} r="5.5" fill={T.blue}
        initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduced ? { duration: DURATION.micro } : { ...SPRING.reward, delay: (MARK.lines + 1100) / 1000 }}
      />

      <text x={x0} y={CHART_H - 6} fill={T.dim} fontSize="10" fontWeight="600">Today</text>
      <text x={x1} y={CHART_H - 6} fill={T.dim} fontSize="10" fontWeight="600" textAnchor="end">Exam</text>
    </svg>
  )
}

function InsightCard({ insight, index, reduced }) {
  const delay = reduced ? 0 : (MARK.cards + index * 80) / 1000

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', y: 10 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)', y: 0 }}
      transition={reduced ? { duration: DURATION.micro } : { ...SPRING.ui, delay }}
      style={{
        padding: 16,
        borderRadius: RADIUS.lg,
        background: T.card,
        border: `1px solid ${T.border}`,
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
        {insight.headline}
      </div>
      <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6, lineHeight: 1.55 }}>
        {insight.body}
      </div>
    </motion.div>
  )
}

export default function RevealScreen({ state, plan, onContinue }) {
  const reduced = useReducedMotion()
  const mountedAt = useRef(Date.now())
  const celebratedRef = useRef(false)

  const current = useMemo(() => currentGradeValue(state), [state])
  const projected = useMemo(() => targetGradeValue(state), [state])
  const insights = useMemo(
    () => buildInsights(state, { topicCount: plan?.topicCount ?? null }),
    [state, plan?.topicCount],
  )

  const courseName = state?.course?.name ?? 'your course'
  const examLabel = state?.examDate ? formatShortDate(state.examDate) : null

  useEffect(() => {
    trackRevealViewed({
      current_grade: state?.currentGrade ?? null,
      target_grade: state?.targetGrade ?? null,
      projected_grade: projected,
    })
  }, [state?.currentGrade, state?.targetGrade, projected])

  const handleLand = (numberRef) => {
    if (celebratedRef.current) return
    celebratedRef.current = true
    // Originates at the number, not the top of the window. Under reduced motion
    // the controller substitutes a static badge instead of the burst.
    celebrate({
      tier: TIER.MEDIUM,
      trigger: 'reveal_number_landed',
      anchorEl: numberRef,
      title: 'Your forecast is ready',
    })
  }

  const handleCta = () => {
    trackRevealCtaTapped({ time_to_tap_ms: Date.now() - mountedAt.current })
    onContinue?.()
  }

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(10px)', scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)', scale: 1 }}
      transition={reduced ? { duration: DURATION.micro } : { ...SPRING.ui, duration: 0.4 }}
      style={{
        minHeight: '100dvh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 20px 40px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <ExamCountdown examDate={state?.examDate} compact />
        </div>

        <motion.h1
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: DURATION.micro } : { duration: DURATION.standard, delay: MARK.headline / 1000, ease: EASE.out }}
          style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 5.6vw, 30px)', fontWeight: 600, color: T.text, margin: 0, lineHeight: 1.18 }}
        >
          {`Your ${courseName} forecast`}
        </motion.h1>

        <div style={{ marginTop: 22, padding: 18, borderRadius: RADIUS.lg, background: T.card, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <CountingNumber
              from={current}
              to={projected}
              start={MARK.countStart}
              reduced={reduced}
              onLand={handleLand}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: T.muted }}>projected</span>
          </div>

          <div style={{ marginTop: 10 }}>
            <ProjectionChart current={current} projected={projected} reduced={reduced} />
          </div>

          {/* Required. Not optional, not a 9px grey footnote. */}
          <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.muted }}>
            Modeled on students with similar starting grades and study hours.
          </p>
        </div>

        <motion.p
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: DURATION.micro } : { duration: DURATION.standard, delay: MARK.subhead / 1000, ease: EASE.out }}
          style={{ fontSize: 15, lineHeight: 1.55, color: T.text, margin: '18px 0 0' }}
        >
          {`On your current pace you finish at a ${current}. Your plan gets you to a ${projected}${examLabel ? ` by ${examLabel}` : ''}.`}
        </motion.p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {insights.map((ins, i) => (
            <InsightCard key={ins.id} insight={ins} index={i} reduced={reduced} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: DURATION.micro } : { duration: DURATION.standard, delay: MARK.cta / 1000 }}
          style={{ marginTop: 22 }}
        >
          <button
            type="button"
            onClick={handleCta}
            style={{
              width: '100%',
              minHeight: 52,
              padding: '15px 22px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: T.blue,
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(52,82,217,0.28)',
            }}
          >
            Save my plan
          </button>
        </motion.div>
      </div>
    </motion.div>
  )
}
