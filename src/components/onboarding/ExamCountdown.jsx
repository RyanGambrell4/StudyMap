/**
 * ExamCountdown - the live ticking pill that appears in the header from step 3
 * onward and never leaves. It follows the user through the build, the reveal,
 * the proof and the paywall.
 *
 * Urgency is the cheapest, most honest motivator we have. "18 days" sitting at
 * the top of every subsequent screen does more work than any copy we could
 * write, and it costs the user nothing because it is their own real date.
 *
 * Date logic comes from `utils/dateUtils` so this and ExamCountdownCard can
 * never disagree about what day it is.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { countdownParts } from '../../utils/dateUtils'
import { DURATION, SPRING, useReducedMotion } from '../../lib/motion'
import { T, RADIUS } from '../../theme/tokens'

const TICK_MS = 60 * 1000

export default function ExamCountdown({ examDate, courseName = null, compact = false }) {
  const reduced = useReducedMotion()
  const [parts, setParts] = useState(() => countdownParts(examDate))

  useEffect(() => {
    if (!examDate) return
    setParts(countdownParts(examDate))
    const id = setInterval(() => setParts(countdownParts(examDate)), TICK_MS)
    return () => clearInterval(id)
  }, [examDate])

  if (!examDate || !parts) return null

  const urgent = !parts.past && parts.days <= 7
  const text = parts.past
    ? 'Exam day'
    : `${parts.days}d ${parts.hours}h${courseName && !compact ? ` until ${courseName}` : ''}`

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: DURATION.micro } : SPRING.ui}
      aria-live="off"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: compact ? '5px 10px' : '6px 12px',
        borderRadius: RADIUS.pill,
        background: urgent ? T.redBg : T.neutralBg,
        color: urgent ? T.red : T.muted,
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: urgent ? T.red : T.neutral,
          flexShrink: 0,
        }}
      />
      {text}
    </motion.div>
  )
}
