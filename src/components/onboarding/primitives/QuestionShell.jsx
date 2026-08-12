/**
 * QuestionShell - the consistent frame every onboarding step renders into.
 *
 * One question, one screen, large type, thumb-reachable options. Steps supply
 * a title, an optional subtitle and their control; the shell owns the layout,
 * the entrance stagger and the footer so twelve screens cannot drift apart.
 */

import { motion } from 'framer-motion'
import { DURATION, EASE, STAGGER, useReducedMotion } from '../../../lib/motion'
import { T, SERIF, RADIUS } from '../../../theme/tokens'

export default function QuestionShell({
  eyebrow = null,
  title,
  subtitle = null,
  children,
  footer = null,
  maxWidth = 480,
}) {
  const reduced = useReducedMotion()

  const container = {
    hidden: {},
    show: {
      transition: reduced
        ? { duration: DURATION.micro }
        : { staggerChildren: STAGGER.children, delayChildren: STAGGER.delayChildren },
    },
  }

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DURATION.micro } } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.out } } }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        width: '100%',
        maxWidth,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {eyebrow ? (
        <motion.div
          variants={item}
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: T.muted,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </motion.div>
      ) : null}

      <motion.h1
        variants={item}
        style={{
          fontFamily: SERIF,
          fontSize: 'clamp(24px, 5.4vw, 31px)',
          fontWeight: 600,
          lineHeight: 1.18,
          letterSpacing: '-0.01em',
          color: T.text,
          margin: 0,
        }}
      >
        {title}
      </motion.h1>

      {subtitle ? (
        <motion.p
          variants={item}
          style={{
            fontSize: 14.5,
            lineHeight: 1.55,
            color: T.muted,
            margin: '10px 0 0',
          }}
        >
          {subtitle}
        </motion.p>
      ) : null}

      <motion.div variants={item} style={{ marginTop: 24 }}>
        {children}
      </motion.div>

      {footer ? (
        <motion.div variants={item} style={{ marginTop: 20 }}>
          {footer}
        </motion.div>
      ) : null}
    </motion.div>
  )
}

/**
 * Primary advance button. Disabled and desaturated until the step's minimum is
 * met, then it springs to full colour. That state flip is a designed reward,
 * not a styling detail, so it gets a real spring rather than a CSS transition.
 */
export function ContinueButton({ enabled, onClick, children = 'Continue', ...rest }) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      type="button"
      disabled={!enabled}
      onClick={enabled ? onClick : undefined}
      aria-disabled={!enabled}
      animate={
        reduced
          ? { opacity: enabled ? 1 : 0.5 }
          : { scale: enabled ? 1 : 0.985, opacity: enabled ? 1 : 0.55 }
      }
      transition={reduced ? { duration: DURATION.micro } : { type: 'spring', stiffness: 300, damping: 18, mass: 1 }}
      style={{
        width: '100%',
        minHeight: 52,
        padding: '15px 22px',
        borderRadius: RADIUS.md,
        border: 'none',
        background: enabled ? T.blue : T.neutralBg,
        color: enabled ? '#FFFFFF' : T.muted,
        fontSize: 15,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: enabled ? 'pointer' : 'not-allowed',
        boxShadow: enabled ? '0 8px 24px rgba(52,82,217,0.28)' : 'none',
      }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
