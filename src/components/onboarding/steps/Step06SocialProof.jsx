/**
 * Step 6: SOCIAL PROOF INTERSTITIAL.
 *
 * Not a question. A pause with a payoff, placed exactly where the interrogation
 * starts to feel long. Card enters with the reward spring over 400ms.
 *
 * See socialProof.js for why there is a rating here and not a conversion
 * multiplier.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import { DURATION, SPRING, useReducedMotion } from '../../../lib/motion'
import { pickTestimonial, initialsFor, RATING_STAT, TARGET_GRADE_STAT } from '../../../lib/socialProof'
import { T, RADIUS } from '../../../theme/tokens'

export default function Step06SocialProof({ state, onAdvance }) {
  const reduced = useReducedMotion()

  // Stable per run so it does not reshuffle between renders.
  const seed = useMemo(() => state.startedAt ?? 0, [state.startedAt])
  const t = useMemo(() => pickTestimonial(seed / 1000), [seed])

  return (
    <QuestionShell
      title="You are not the only one."
      subtitle="Two more questions and we will show you what we found."
      footer={<ContinueButton enabled onClick={onAdvance}>Keep going</ContinueButton>}
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: DURATION.micro } : SPRING.reward}
        style={{
          padding: 20,
          borderRadius: RADIUS.lg,
          background: T.card,
          border: `1px solid ${T.border}`,
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        }}
      >
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: T.text, fontWeight: 500 }}>
          {`"${t.quote}"`}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 16 }}>
          <span
            aria-hidden="true"
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              background: T.blueBg,
              color: T.blue,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {initialsFor(t.name)}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: T.text }}>{t.name}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: T.muted, marginTop: 1 }}>{t.detail}</span>
          </span>
        </div>
      </motion.div>

      <div style={{ marginTop: 14, fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>
        {TARGET_GRADE_STAT ?? RATING_STAT}
      </div>
    </QuestionShell>
  )
}
