/**
 * GeneratingScreen - the shared "the machine is working for you" wait.
 *
 * Replaces the bare spinner on every AI generation. A student cannot see a
 * model think, so narrating the work is the only evidence they get that
 * something expensive happened on their behalf. That is the whole point:
 * perceived effort drives perceived value.
 *
 * DELIBERATELY NOT a fixed-length theatre. The onboarding BuildScreen holds a
 * full ten seconds because it is claiming to build a semester plan, once, and
 * an instant result there reads as a lie. Padding every quiz to ten seconds
 * would just be a slow app. So:
 *
 *   - Stages advance on an estimate while the request is in flight.
 *   - Work finishes early  -> jump to the final stage, complete, brief settle
 *                             so the last label is actually legible, then done.
 *   - Work finishes late   -> HOLD at 92% with the last stage breathing.
 *                             Never walk to 100% before the data exists.
 *
 * The ring refuses to lie in either direction. That is what makes it trustable
 * the tenth time a student sees it.
 */

import { useState, useEffect, useRef } from 'react'
// `motion` is only ever referenced from JSX. This project's eslint config has no
// eslint-plugin-react, so its jsx-uses-vars rule is absent and no-unused-vars
// cannot see JSX identifiers. Uppercase component names slip through the
// varsIgnorePattern; a lowercase one like this does not.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { useMotionValue, useTransform, animate } from 'framer-motion'
import { DURATION, SPRING, EASE, useReducedMotion } from '../../lib/motion'
import { T, SERIF, RADIUS } from '../../theme/tokens'

const HOLD_PCT = 92        // where the ring waits when the backend is slower than the estimate
const SETTLE_MS = 420      // hold at 100% so the final stage can be read
const RUSH_MS = 340        // how fast we close the gap when work lands early

const RING = 132
const STROKE = 8
const R = (RING - STROKE) / 2
const CIRC = 2 * Math.PI * R

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StageRow({ label, done, active, reduced }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }}>
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, flexShrink: 0, borderRadius: RADIUS.pill,
          background: done ? T.green : 'transparent',
          border: done ? 'none' : `2px solid ${T.border}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {done ? (
          <motion.span
            initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduced ? { duration: DURATION.micro } : SPRING.reward}
            style={{ display: 'inline-flex' }}
          >
            <Check />
          </motion.span>
        ) : null}
      </span>

      <motion.span
        animate={{ opacity: done || active ? 1 : 0.55 }}
        transition={{ duration: reduced ? DURATION.micro : DURATION.standard }}
        style={{
          fontSize: 14, lineHeight: 1.4, color: T.text,
          fontWeight: done || active ? 600 : 500,
        }}
      >
        {label}
      </motion.span>
    </div>
  )
}

/**
 * @param {string[]} stages       honest labels naming the real work, in order
 * @param {boolean}  ready        true once the request has actually resolved
 * @param {function} onComplete   called after the ring reaches 100% and settles
 * @param {string}   [title]
 * @param {number}   [estimatedMs] how long this generation usually takes
 * @param {string}   [error]      when set, the ring stops and the caller shows the error
 */
export default function GeneratingScreen({
  stages = [],
  ready = false,
  onComplete,
  title = 'Working on it',
  estimatedMs = 6000,
  error = null,
}) {
  const reduced = useReducedMotion()
  const [pct, setPct] = useState(0)
  const [stageIdx, setStageIdx] = useState(0)
  const [overrunning, setOverrunning] = useState(false)

  const progress = useMotionValue(0)
  const dash = useTransform(progress, (p) => `${(p / 100) * CIRC} ${CIRC}`)

  const startedRef = useRef(Date.now())
  const finishedRef = useRef(false)   // the ring has reached 100 and handed off
  const readyRef = useRef(false)      // the request has landed; stop scheduling
  const settleRef = useRef(null)

  // Stage boundaries spread across the estimate. The last stage owns the tail,
  // because that is the one left on screen when a request runs long.
  const count = Math.max(1, stages.length)
  const stageMs = estimatedMs / count

  // The scheduled walk. Writes the motion value directly rather than starting
  // an animation per frame, and leans on React bailing out of same-value
  // setState so a 60fps loop does not mean 60 renders a second.
  useEffect(() => {
    if (error) return undefined
    let raf
    const tick = () => {
      if (!readyRef.current) {
        const elapsed = Date.now() - startedRef.current
        progress.set(Math.min(HOLD_PCT, (elapsed / estimatedMs) * 100))
        setStageIdx(Math.min(count - 1, Math.floor(elapsed / stageMs)))
        setOverrunning(elapsed > estimatedMs)
      }
      if (!finishedRef.current) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [error, estimatedMs, count, stageMs, progress])

  // Work has landed. Close the remaining gap quickly rather than waiting out an
  // estimate we now know was wrong.
  useEffect(() => {
    if (error || !ready) return undefined
    readyRef.current = true
    setStageIdx(count - 1)
    setOverrunning(false)

    const controls = animate(progress, 100, {
      duration: reduced ? DURATION.micro : RUSH_MS / 1000,
      ease: EASE.out,
      onComplete: () => {
        if (finishedRef.current) return
        finishedRef.current = true
        settleRef.current = setTimeout(() => onComplete?.(), reduced ? 0 : SETTLE_MS)
      },
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, error, count, reduced])

  // A closed modal must not fire a handoff into a screen nobody is looking at.
  useEffect(() => () => clearTimeout(settleRef.current), [])

  useEffect(() => progress.on('change', (v) => setPct(Math.round(v))), [progress])

  const activeIdx = ready ? count - 1 : stageIdx

  // ── Reduced motion: a determinate bar, still gated on the real request ─────
  if (reduced) {
    return (
      <div style={{ padding: '44px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 500, color: T.text, margin: 0 }}>{title}</h2>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{ width: '100%', maxWidth: 320, height: 8, borderRadius: RADIUS.pill, background: T.neutralBg, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: T.blue }} />
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: T.muted }} aria-live="polite">
          {stages[activeIdx] ?? title}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 28px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: RING, height: RING }}>
        <svg width={RING} height={RING} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={T.neutralBg} strokeWidth={STROKE} />
          <motion.circle
            cx={RING / 2} cy={RING / 2} r={R}
            fill="none" stroke={T.blue} strokeWidth={STROKE} strokeLinecap="round"
            style={{ strokeDasharray: dash }}
          />
        </svg>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ fontSize: 31, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {pct}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: '0.08em', marginTop: 3 }}>
            PERCENT
          </span>
        </div>
      </div>

      <div
        style={{ marginTop: 28, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 9 }}
        aria-live="polite"
      >
        {stages.map((label, i) => (
          <StageRow
            key={label}
            label={label}
            done={ready ? true : i < stageIdx}
            active={i === activeIdx}
            reduced={reduced}
          />
        ))}
      </div>

      {overrunning ? (
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ marginTop: 18, fontSize: 12.5, color: T.muted }}
        >
          Still working. This one is taking a moment.
        </motion.p>
      ) : null}
    </div>
  )
}
