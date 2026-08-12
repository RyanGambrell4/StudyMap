/**
 * StatNumber - the one way a meaningful number is displayed in this app.
 *
 * In a study app the numbers ARE the reward. Streak count, mastery percent,
 * hours this week, questions answered, days to exam. They were previously
 * rendered at roughly the same visual weight as their own labels, so none of
 * them landed. This gives them the weight and the entrance they were missing.
 *
 * Three things it guarantees, which is why it is one component rather than a
 * pattern copied per view:
 *
 *   1. Tabular numerals. Proportional digits change width as they tick, so an
 *      animated number visibly jitters. `tnum` pins every digit to one width.
 *   2. The number carries the weight, the label does not. The label is small,
 *      muted, and never competes.
 *   3. It counts up on a spring, and it does not under reduced motion. The
 *      final value is rendered immediately in that case, never a zero that
 *      stays.
 *
 * Motion is an enhancement here and never load-bearing: the text content is
 * the real value from the first paint under reduced motion, and the animated
 * path is driven by a motion value rather than React state, so counting costs
 * no re-renders.
 */

import { useEffect, useRef, useState } from 'react'
// `motion` is only ever referenced from JSX. This project's eslint config has
// no eslint-plugin-react, so its jsx-uses-vars rule is absent and no-unused-vars
// cannot see JSX identifiers. Uppercase component names slip through the
// varsIgnorePattern; a lowercase one like this does not.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { useMotionValue, useTransform, animate } from 'framer-motion'
import { SPRING, useReducedMotion } from '../../lib/motion'
import { T } from '../../theme/tokens'

/**
 * Size steps. `hero` is for the single most important number on a screen,
 * `standard` for numbers on cards, `inline` for numbers inside running text or
 * dense rows. Adding a fourth step should be a deliberate decision, not a
 * reflex, which is why they live here rather than being free-form props.
 */
const SIZES = {
  hero:     { value: 46, label: 12,   gap: 6, weight: 700, tracking: '-0.03em' },
  standard: { value: 28, label: 11,   gap: 4, weight: 700, tracking: '-0.02em' },
  inline:   { value: 17, label: 10.5, gap: 2, weight: 700, tracking: '-0.01em' },
}

const TABULAR = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum'",
}

function formatValue(n, { decimals, prefix, suffix }) {
  const safe = Number.isFinite(n) ? n : 0
  const body = decimals > 0 ? safe.toFixed(decimals) : String(Math.round(safe))
  return `${prefix}${body}${suffix}`
}

/**
 * @param {object} props
 * @param {number} props.value        the number itself
 * @param {string} [props.label]      small muted caption under the number
 * @param {'hero'|'standard'|'inline'} [props.size]
 * @param {string} [props.suffix]     e.g. '%', 'h'
 * @param {string} [props.prefix]
 * @param {number} [props.decimals]
 * @param {string} [props.color]      defaults to primary text
 * @param {boolean} [props.animateOnMount] set false for numbers that are
 *                  already on screen when the view loads and would otherwise
 *                  all count at once
 * @param {boolean} [props.showDelta] when true, an increase caused by
 *                  something the student just did rises and fades above it
 */
export default function StatNumber({
  value,
  label = null,
  size = 'standard',
  suffix = '',
  prefix = '',
  decimals = 0,
  color = null,
  animateOnMount = true,
  showDelta = false,
  align = 'left',
  style = null,
  labelStyle = null,
  ariaLabel = null,
}) {
  const reduced = useReducedMotion()
  const step = SIZES[size] ?? SIZES.standard
  const numeric = Number.isFinite(value) ? value : 0

  const mv = useMotionValue(animateOnMount && !reduced ? 0 : numeric)
  const text = useTransform(mv, v => formatValue(v, { decimals, prefix, suffix }))

  // Previous value, so a change can be animated FROM it rather than from zero,
  // and so the delta knows how much was gained.
  const prevRef = useRef(numeric)
  const mountedRef = useRef(false)
  const [delta, setDelta] = useState(null)

  useEffect(() => {
    // Reduced motion: the value is simply correct, immediately, always.
    if (reduced) {
      mv.set(numeric)
      return
    }

    const isMount = !mountedRef.current
    mountedRef.current = true
    if (isMount && !animateOnMount) {
      mv.set(numeric)
      return
    }

    // Guard on where the number ACTUALLY is, not on what the last render
    // thought it was. StrictMode double-invokes effects in dev: the first pass
    // would record the target and the second pass would then see "no change"
    // and skip, stranding the display at zero. Reading the motion value makes
    // that second pass re-animate, and still correctly skips a re-render that
    // genuinely did not move the number.
    const from = prevRef.current
    prevRef.current = numeric
    if (mv.get() === numeric) return

    const controls = animate(mv, numeric, SPRING.count)

    if (!isMount && showDelta && numeric > from) {
      setDelta(numeric - from)
    }
    return () => controls.stop()
  }, [numeric, reduced, animateOnMount, showDelta, mv])

  // The delta clears itself. Kept separate from the count so stopping one
  // never strands the other.
  useEffect(() => {
    if (delta == null) return
    const timer = setTimeout(() => setDelta(null), 1100)
    return () => clearTimeout(timer)
  }, [delta])

  const readable = ariaLabel ?? (label ? `${formatValue(numeric, { decimals, prefix, suffix })} ${label}` : undefined)

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: step.gap,
        position: 'relative',
        ...style,
      }}
    >
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline' }}>
        {/* The live region announces the settled value, not every tick, which
            is why the animated span itself is hidden from assistive tech. */}
        <motion.span
          aria-hidden="true"
          style={{
            fontSize: step.value,
            fontWeight: step.weight,
            letterSpacing: step.tracking,
            lineHeight: 1,
            color: color ?? T.text,
            ...TABULAR,
          }}
        >
          {text}
        </motion.span>
        <span style={{
          position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
          overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
        }}
        >
          {readable ?? formatValue(numeric, { decimals, prefix, suffix })}
        </span>

        {/* The increment, when the student caused it. Not an XP flyup: that
            layer is branded "+N XP" and this app deliberately has no points
            economy. This just shows the number moving. */}
        {delta != null && !reduced ? (
          <motion.span
            aria-hidden="true"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [4, -10, -14, -20] }}
            transition={{ duration: 1.1, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: '100%',
              bottom: '55%',
              marginLeft: 6,
              fontSize: Math.max(11, step.value * 0.34),
              fontWeight: 700,
              color: T.blue,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              ...TABULAR,
            }}
          >
            {`+${decimals > 0 ? delta.toFixed(decimals) : Math.round(delta)}`}
          </motion.span>
        ) : null}
      </div>

      {label ? (
        <div style={{
          fontSize: step.label,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: T.dim,
          lineHeight: 1.2,
          ...labelStyle,
        }}
        >
          {label}
        </div>
      ) : null}
    </div>
  )
}
