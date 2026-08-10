/**
 * ChoiceButton - one tappable answer.
 *
 * Single-select: the fill sweeps over 120ms, a MICRO celebration fires on this
 * element, and the flow auto-advances after 220ms. Never make someone tap an
 * answer and then tap Continue.
 *
 * Multi-select: toggles, no auto-advance. The parent's Continue button owns the
 * advance and stays disabled until the minimum selection is met.
 */

import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { DURATION, SPRING, useReducedMotion } from '../../../lib/motion'
import { celebrate, TIER } from '../../../lib/celebration'
import { T, RADIUS } from '../../../theme/tokens'

const AUTO_ADVANCE_MS = 220

function CheckDot({ selected, multi }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 21,
        height: 21,
        flexShrink: 0,
        borderRadius: multi ? 6 : 999,
        border: `2px solid ${selected ? T.blue : 'rgba(0,0,0,0.18)'}`,
        background: selected ? T.blue : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {selected ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  )
}

export default function ChoiceButton({
  label,
  sublabel = null,
  selected = false,
  multi = false,
  onSelect,
  onAdvance = null,
  disabled = false,
}) {
  const ref = useRef(null)
  const [ring, setRing] = useState(false)
  const reduced = useReducedMotion()

  const handleClick = useCallback(() => {
    if (disabled) return
    onSelect?.()

    // Tier 0. A tap is not a milestone; it gets a 180ms scale and nothing more.
    celebrate({ tier: TIER.MICRO, trigger: multi ? 'onboarding_option_toggled' : 'onboarding_option_selected', anchorEl: ref })

    if (!multi && onAdvance) {
      // Long enough to see the fill land, short enough not to feel like a wait.
      setTimeout(onAdvance, reduced ? 0 : AUTO_ADVANCE_MS)
    }
  }, [disabled, onSelect, multi, onAdvance, reduced])

  const handleFocus = useCallback((e) => {
    try { setRing(e.target.matches(':focus-visible')) } catch { setRing(true) }
  }, [])

  return (
    <motion.button
      ref={ref}
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={() => setRing(false)}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={SPRING.ui}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        textAlign: 'left',
        minHeight: 56,
        padding: '14px 16px',
        borderRadius: RADIUS.md,
        border: `1.5px solid ${selected ? T.blue : T.border}`,
        background: selected ? T.blueBg : T.card,
        color: T.text,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        // 120ms fill, per the motion table.
        transition: `background ${DURATION.micro * 1000}ms ease, border-color ${DURATION.micro * 1000}ms ease`,
        boxShadow: ring ? `0 0 0 3px ${T.blueBg}, 0 0 0 1px ${T.blue}` : 'none',
        outline: 'none',
      }}
    >
      <CheckDot selected={selected} multi={multi} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>
          {label}
        </span>
        {sublabel ? (
          <span style={{ display: 'block', fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>
            {sublabel}
          </span>
        ) : null}
      </span>
    </motion.button>
  )
}
