/**
 * motion.js - single source of truth for every animation value in the app.
 *
 * See `dopamine-onboarding-design-brief.md` section 5 (Motion System).
 * No component should declare a one-off duration or spring. If a value you
 * need is not here, add it here rather than inlining it.
 *
 * Reduced motion is not optional. Every animated component in the dopamine
 * onboarding build calls `useReducedMotion()` and routes its variants through
 * `motionSafe()`. Under reduced motion the reward information must still be
 * conveyed, it just arrives without the movement.
 */

import { useState, useEffect } from 'react'

// Seconds, because framer-motion transitions are in seconds.
export const DURATION = {
  micro: 0.12,
  standard: 0.24,
  screen: 0.32,
  reward: 0.5,
  peak: 1.4,
}

// Milliseconds, for setTimeout / Web Animations API call sites.
export const DURATION_MS = {
  micro: 120,
  standard: 240,
  screen: 320,
  reward: 500,
  peak: 1400,
}

export const SPRING = {
  ui:          { type: 'spring', stiffness: 260, damping: 26, mass: 1 }, // crisp, no bounce
  reward:      { type: 'spring', stiffness: 300, damping: 18, mass: 1 }, // slight overshoot
  celebration: { type: 'spring', stiffness: 200, damping: 12, mass: 1 }, // bouncy
}

export const EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
}

export const STAGGER = { children: 0.07, delayChildren: 0.05 }

// ── Reduced motion ──────────────────────────────────────────────────────────

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Imperative read, for non-React code such as the celebration controller.
 * Returns false in any environment without matchMedia.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try { return window.matchMedia(REDUCED_QUERY).matches } catch { return false }
}

/**
 * Live boolean. Re-renders when the user flips the OS setting, which matters
 * because Apple review and accessibility audits toggle it mid-session.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let mq
    try { mq = window.matchMedia(REDUCED_QUERY) } catch { return }

    const onChange = (e) => setReduced(e.matches)
    setReduced(mq.matches)

    // Safari below 14 only has the deprecated listener API.
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else if (typeof mq.addListener === 'function') mq.addListener(onChange)

    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
      else if (typeof mq.removeListener === 'function') mq.removeListener(onChange)
    }
  }, [])

  return reduced
}

// Anything that moves the element in space, plus filter because the reveal
// and the locked preview cards animate blur.
const TRANSFORM_KEYS = new Set([
  'x', 'y', 'z',
  'translateX', 'translateY', 'translateZ',
  'scale', 'scaleX', 'scaleY', 'scaleZ',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'skew', 'skewX', 'skewY',
  'perspective', 'transformPerspective',
  'filter', 'backdropFilter',
  'pathLength', 'pathOffset',
])

function sanitizeTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return target
  const out = {}
  for (const key of Object.keys(target)) {
    if (TRANSFORM_KEYS.has(key)) continue
    if (key === 'transition') continue
    out[key] = target[key]
  }
  // Collapse every duration to micro and drop orchestration, so a reduced
  // motion user is never left waiting on a stagger they cannot perceive.
  out.transition = { duration: DURATION.micro }
  return out
}

/**
 * Strip transforms and collapse durations when reduced motion is on.
 * Pass variants through untouched otherwise.
 *
 * Handles both plain variants and the custom-driven function form used by
 * directional slide transitions.
 */
export function motionSafe(variants, reduced) {
  if (!reduced || !variants || typeof variants !== 'object') return variants
  const out = {}
  for (const name of Object.keys(variants)) {
    const value = variants[name]
    out[name] = typeof value === 'function'
      ? (...args) => sanitizeTarget(value(...args))
      : sanitizeTarget(value)
  }
  return out
}

/** Spring when motion is allowed, a 120ms tween when it is not. */
export function springOr(reduced, spring = SPRING.ui) {
  return reduced ? { duration: DURATION.micro } : spring
}

/** Duration in seconds, collapsed to micro under reduced motion. */
export function durationOr(reduced, seconds) {
  return reduced ? DURATION.micro : seconds
}

/** Delay in seconds, collapsed to 0 under reduced motion so nothing is gated. */
export function delayOr(reduced, seconds) {
  return reduced ? 0 : seconds
}

export default {
  DURATION, DURATION_MS, SPRING, EASE, STAGGER,
  useReducedMotion, prefersReducedMotion, motionSafe, springOr, durationOr, delayOr,
}
