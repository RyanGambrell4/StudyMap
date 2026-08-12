/**
 * XPFlyup - the "+N XP" pill that arcs from the thing you just did to the XP
 * counter, then ticks the counter up.
 *
 * Mounted once, near the root, as <XPFlyupLayer />. It listens to the
 * celebration controller rather than taking props, so any feature can award XP
 * without threading callbacks through the tree.
 *
 * The flight target is whatever element carries `data-xp-counter`. That keeps
 * the counter free to live wherever the layout needs it (app header, session
 * chrome, onboarding) with no prop drilling and no registry to keep in sync.
 *
 * Concurrent awards QUEUE rather than overlap. Two pills crossing each other
 * reads as a glitch, and the tick on the counter has to stay legible.
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { subscribeCelebration } from '../../lib/celebration'
import { DURATION, DURATION_MS, EASE, SPRING, useReducedMotion } from '../../lib/motion'
import { T, RADIUS } from '../../theme/tokens'

const FLIGHT_MS = DURATION_MS.reward // 500
const XP_LANDED_EVENT = 'studyedge:xp-landed'

function findTarget() {
  if (typeof document === 'undefined') return null
  return document.querySelector('[data-xp-counter]')
}

function centerOf(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** Quadratic bezier. The control point is lifted so the pill arcs up and over. */
function bezierPoint(t, p0, p1, p2) {
  const inv = 1 - t
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  }
}

const pillStyle = {
  position: 'fixed',
  left: 0,
  top: 0,
  zIndex: 115,
  pointerEvents: 'none',
  padding: '5px 11px',
  borderRadius: RADIUS.pill,
  background: T.blue,
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap',
  boxShadow: '0 6px 18px rgba(52,82,217,0.35)',
}

function Flyup({ item, reduced, onDone }) {
  const { amount, point } = item
  const t = useMotionValue(0)

  // Resolved once, at launch, so a scroll mid-flight cannot retarget the pill.
  const geom = useRef(null)
  if (geom.current === null) {
    const start = point ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.6 }
    const end = centerOf(findTarget()) ?? { x: start.x, y: Math.max(24, start.y - 120) }
    const lift = Math.max(70, Math.abs(end.y - start.y) * 0.55)
    geom.current = {
      p0: start,
      p1: { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - lift },
      p2: end,
    }
  }

  const x = useTransform(t, (v) => bezierPoint(v, geom.current.p0, geom.current.p1, geom.current.p2).x)
  const y = useTransform(t, (v) => bezierPoint(v, geom.current.p0, geom.current.p1, geom.current.p2).y)
  // Hold full opacity, then fade across the last 20% of the flight.
  const opacity = useTransform(t, [0, 0.8, 1], [1, 1, 0])
  const scale = useTransform(t, [0, 0.12, 1], [0.7, 1, 0.92])

  useEffect(() => {
    let cancelled = false
    const land = () => {
      if (cancelled) return
      const el = findTarget()
      if (el) {
        // The counter itself does the 1-to-2 digit tick; we just tell it to.
        el.dispatchEvent(new CustomEvent(XP_LANDED_EVENT, { detail: { amount }, bubbles: true }))
        if (typeof el.animate === 'function' && !reduced) {
          try {
            el.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
              { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            )
          } catch { /* ignore */ }
        }
      }
      onDone()
    }

    if (reduced) {
      // No arc. The information still lands, it just does not travel.
      const timer = setTimeout(land, DURATION_MS.micro)
      return () => { cancelled = true; clearTimeout(timer) }
    }

    const controls = animate(t, 1, {
      duration: FLIGHT_MS / 1000,
      ease: EASE.out,
      onComplete: land,
    })
    return () => { cancelled = true; controls.stop() }
  }, [amount, reduced, onDone, t])

  if (reduced) {
    // Static pill at the origin, scaled in over 120ms. No travel, no transform arc.
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.micro }}
        style={{
          ...pillStyle,
          transform: `translate(${(geom.current.p0.x) - 24}px, ${geom.current.p0.y - 14}px)`,
        }}
      >
        {`+${amount} XP`}
      </motion.div>
    )
  }

  return (
    <motion.div
      style={{ ...pillStyle, x, y, opacity, scale, translateX: '-50%', translateY: '-50%' }}
    >
      {`+${amount} XP`}
    </motion.div>
  )
}

const MemoFlyup = memo(Flyup)

export default function XPFlyupLayer() {
  const [queue, setQueue] = useState([])
  const [active, setActive] = useState(null)
  const idRef = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => subscribeCelebration((e) => {
    if (e.type !== 'xp' || !e.amount) return
    idRef.current += 1
    setQueue((q) => [...q, { id: idRef.current, amount: e.amount, point: e.point }])
  }), [])

  // Pull the next award only when the previous one has landed.
  useEffect(() => {
    if (active || queue.length === 0) return
    setActive(queue[0])
    setQueue((q) => q.slice(1))
  }, [active, queue])

  const handleDone = useCallback(() => setActive(null), [])

  if (typeof document === 'undefined' || !active) return null

  return createPortal(
    <MemoFlyup key={active.id} item={active} reduced={reduced} onDone={handleDone} />,
    document.body,
  )
}

/**
 * XP counter with a tick animation. Carries `data-xp-counter` so flyups know
 * where to land. Render one of these wherever the running total belongs.
 */
export function XPCounter({ value, style, label = 'XP' }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(value)
  const reduced = useReducedMotion()

  // Keep in step when the source of truth changes without a flyup.
  useEffect(() => { setDisplay(value) }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onLanded = () => {
      // The award already moved `value`; this just makes the digits roll.
      setDisplay((d) => d)
    }
    el.addEventListener(XP_LANDED_EVENT, onLanded)
    return () => el.removeEventListener(XP_LANDED_EVENT, onLanded)
  }, [])

  return (
    <span
      ref={ref}
      data-xp-counter=""
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontVariantNumeric: 'tabular-nums', ...style }}
    >
      <motion.span
        key={display}
        initial={reduced ? { opacity: 0 } : { y: -8, opacity: 0 }}
        animate={reduced ? { opacity: 1 } : { y: 0, opacity: 1 }}
        transition={reduced ? { duration: DURATION.micro } : SPRING.reward}
        style={{ fontWeight: 800, color: T.text }}
      >
        {display}
      </motion.span>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{label}</span>
    </span>
  )
}
