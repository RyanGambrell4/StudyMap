/**
 * Step 10: THE LOCKED PREVIEW. The Zeigarnik screen.
 *
 * "Based on your answers, we found 3 things holding your grade back."
 *
 * The highest leverage screen in Act 2. The user now has a reason to finish
 * that has nothing to do with us. The cards are the REAL insights from
 * buildInsights, blurred: partially legible so the shape is visible but the
 * content is not. They unblur on the reveal, which is what closes the loop.
 *
 * Do not swap these for placeholder bars. The loop only pays off if the thing
 * that unlocks is visibly the same thing that was locked.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import { DURATION, EASE, STAGGER, useReducedMotion } from '../../../lib/motion'
import { buildInsights } from '../../../lib/onboardingInsights'
import { T, RADIUS } from '../../../theme/tokens'

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke={T.muted} strokeWidth="2" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke={T.muted} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function Step10LockedPreview({ state, onAdvance }) {
  const reduced = useReducedMotion()
  const insights = useMemo(() => buildInsights(state), [state])

  return (
    <QuestionShell
      title="We found 3 things holding your grade back."
      subtitle="Two more questions and we will show you."
      footer={<ContinueButton enabled onClick={onAdvance}>Show me the other two questions</ContinueButton>}
    >
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: reduced ? { duration: DURATION.micro } : { staggerChildren: STAGGER.children } } }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {insights.map((ins) => (
          <motion.div
            key={ins.id}
            variants={reduced
              ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DURATION.micro } } }
              : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.out } } }}
            aria-hidden="true"
            style={{
              position: 'relative',
              padding: 16,
              borderRadius: RADIUS.lg,
              background: T.card,
              border: `1px solid ${T.border}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                // Enough blur that it cannot be read, little enough that the
                // shape of a real sentence is obvious.
                filter: 'blur(5.5px)',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
                {ins.headline}
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                {ins.body.slice(0, 96)}
              </div>
            </div>

            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 26,
                height: 26,
                borderRadius: 999,
                background: T.neutralBg,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LockIcon />
            </span>
          </motion.div>
        ))}
      </motion.div>

      <p style={{ marginTop: 12, fontSize: 12.5, color: T.dim }}>
        Locked until your plan finishes building.
      </p>
    </QuestionShell>
  )
}
