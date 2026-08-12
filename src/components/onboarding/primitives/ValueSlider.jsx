/**
 * ValueSlider - the study hours question (step 8).
 *
 * The reward here is the live response to the drag, not the value. The track
 * gradient interpolates cool to warm in real time and the label rewrites itself
 * at thresholds, so the screen is visibly reacting to the user's own hand.
 *
 * Built on a native <input type="range"> so arrow keys, Home/End and screen
 * readers work with no extra code. The visible track is painted underneath it
 * and the real input sits on top at zero opacity.
 *
 * Haptics: web has none. On device we reach the Capacitor plugin through the
 * runtime global rather than an import, because `@capacitor/haptics` is not a
 * dependency of this project and a bare import would fail the web build.
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { SPRING, useReducedMotion } from '../../../lib/motion'
import { T, RADIUS } from '../../../theme/tokens'

const MIN = 0
const MAX = 20

// Cool at zero, warm at the top of the range.
const COOL = [52, 82, 217]    // T.blue
const WARM = [232, 177, 74]   // amber

function lerpColor(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function labelFor(hours) {
  if (hours <= 1) return 'Almost nothing. That is usually where the grade goes.'
  if (hours <= 3) return 'That is below average for a course this hard.'
  if (hours <= 6) return 'About average. Most students here are still short.'
  if (hours <= 10) return 'Solid. The problem is usually what you do with it.'
  if (hours <= 15) return 'That is a lot of hours. Let us make them count.'
  return 'That is a heavy load. Efficiency matters more than more time.'
}

function selectionHaptic() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null
    if (!cap?.isNativePlatform?.()) return
    const haptics = cap.Plugins?.Haptics
    if (!haptics) return
    // selectionChanged is the detent-tick equivalent on both platforms.
    haptics.selectionChanged?.() ?? haptics.impact?.({ style: 'LIGHT' })
  } catch { /* never let feedback break the control */ }
}

export default function ValueSlider({ value, onChange }) {
  const [dragging, setDragging] = useState(false)
  const lastDetent = useRef(value)
  const reduced = useReducedMotion()

  const pct = useMemo(() => (value - MIN) / (MAX - MIN), [value])
  const fill = useMemo(() => lerpColor(COOL, WARM, pct), [pct])

  const handleInput = useCallback((e) => {
    const next = Number(e.target.value)
    if (next !== lastDetent.current) {
      lastDetent.current = next
      selectionHaptic()
    }
    onChange?.(next)
  }, [onChange])

  return (
    <div>
      <style>{`
        .se-value-slider {
          -webkit-appearance: none;
          appearance: none;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          opacity: 0;
          cursor: grab;
        }
        .se-value-slider:active { cursor: grabbing; }
        .se-value-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 44px; height: 44px;
        }
        .se-value-slider::-moz-range-thumb {
          width: 44px; height: 44px; border: none; opacity: 0;
        }
        .se-value-slider:focus-visible + .se-slider-track {
          box-shadow: 0 0 0 3px rgba(52,82,217,0.28);
        }
      `}
      </style>

      {/* Big live number. Proximity, never abstraction. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <motion.span
          key={value}
          initial={reduced ? false : { y: -6, opacity: 0.4 }}
          animate={{ y: 0, opacity: 1 }}
          transition={reduced ? { duration: 0.12 } : SPRING.reward}
          style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </motion.span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.muted }}>
          {value === 1 ? 'hour a week' : 'hours a week'}
        </span>
      </div>

      <div style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          className="se-value-slider"
          min={MIN}
          max={MAX}
          step={1}
          value={value}
          onChange={handleInput}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onFocus={() => setDragging(false)}
          onBlur={() => setDragging(false)}
          aria-label="Hours you study for this class each week"
          aria-valuetext={`${value} hours a week`}
        />

        <div
          className="se-slider-track"
          style={{
            position: 'relative',
            width: '100%',
            height: 10,
            borderRadius: RADIUS.pill,
            background: T.neutralBg,
            overflow: 'visible',
            transition: 'box-shadow 120ms ease',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct * 100}%`,
              borderRadius: RADIUS.pill,
              background: `linear-gradient(90deg, ${lerpColor(COOL, WARM, Math.max(0, pct - 0.35))}, ${fill})`,
            }}
          />
          {/* Web has no haptics, so the thumb compensates with a stronger scale. */}
          <motion.div
            animate={{ scale: dragging && !reduced ? 1.12 : 1 }}
            transition={reduced ? { duration: 0.12 } : SPRING.ui}
            style={{
              position: 'absolute',
              left: `${pct * 100}%`,
              top: '50%',
              width: 26,
              height: 26,
              marginLeft: -13,
              marginTop: -13,
              borderRadius: 999,
              background: '#FFFFFF',
              border: `2.5px solid ${fill}`,
              boxShadow: '0 3px 12px rgba(0,0,0,0.16)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      <div
        aria-live="polite"
        style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5, color: T.muted, minHeight: 42 }}
      >
        {labelFor(value)}
      </div>
    </div>
  )
}
