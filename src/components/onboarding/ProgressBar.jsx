/**
 * ProgressBar for the Act 2 question stack.
 *
 * STARTS AT 15%, NOT 0. This is the endowed progress effect and it is
 * deliberate. A bar that starts partly filled outperforms one that starts
 * empty, because the user is completing something already underway rather than
 * beginning a chore. Do not "fix" this.
 *
 * It also never moves backward. Going back preserves state and keeps the bar
 * where it was; watching your own progress get taken away is a small punishment
 * for using a control we deliberately made available.
 *
 * The overshoot on each advance is the point. The bar moving is a micro reward
 * in itself, so it gets the reward spring rather than a linear tween.
 */

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { DURATION, SPRING, useReducedMotion } from '../../lib/motion'
import { STEP_COUNT } from './useOnboardingState'
import { T, RADIUS } from '../../theme/tokens'

const START_PCT = 15
const END_PCT = 100

export function percentForStep(index) {
  if (STEP_COUNT <= 1) return END_PCT
  const t = Math.min(1, Math.max(0, index / (STEP_COUNT - 1)))
  return START_PCT + (END_PCT - START_PCT) * t
}

export default function ProgressBar({ stepIndex }) {
  const reduced = useReducedMotion()
  const highWater = useRef(START_PCT)

  const target = percentForStep(stepIndex)
  if (target > highWater.current) highWater.current = target
  const pct = highWater.current

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Setup progress"
      style={{
        width: '100%',
        height: 6,
        borderRadius: RADIUS.pill,
        background: T.neutralBg,
        overflow: 'hidden',
      }}
    >
      <motion.div
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduced ? { duration: DURATION.micro } : SPRING.reward}
        style={{
          height: '100%',
          borderRadius: RADIUS.pill,
          background: T.blue,
        }}
      />
    </div>
  )
}
