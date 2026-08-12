/**
 * celebration.js - the single controller that owns every celebration in the app.
 *
 * Features do not fire confetti directly. They request a tier and the
 * controller decides what actually happens, including whether the request is
 * over its frequency cap. This exists specifically so celebration creep cannot
 * happen: there is one place to audit and one place to enforce caps.
 *
 * See `dopamine-onboarding-design-brief.md` section 4 (Celebration Tiers).
 *
 *   MICRO  scale spring on the anchor + XP flyup       no cap
 *   SMALL  card lift + glow, XP bar fill w/ overshoot  no cap
 *   MEDIUM 60 particle confetti at the anchor + toast  2 per calendar day
 *   MAJOR  full screen, 200 particles, share card      1 per rolling 7 days
 *
 * A capped request is DOWNGRADED one tier, never dropped. The user still gets
 * feedback, it is just quieter. Every fire reports `was_capped` to PostHog so
 * celebration fatigue is measurable rather than guessed at.
 */

import confetti from 'canvas-confetti'
import { track } from './analytics'
import { DURATION_MS, prefersReducedMotion } from './motion'

// Defined in celebrationTiers.js and re-exported here so every existing
// `import { TIER } from './celebration'` keeps working unchanged.
import { TIER, TIER_NAME } from './celebrationTiers'
export { TIER, TIER_NAME }

const CAPS_KEY_PREFIX = 'studyedge_celebration_caps_v1'
const SOUND_KEY = 'studyedge_sound_enabled_v1'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const MEDIUM_PER_DAY = 2
const MAJOR_PER_WEEK = 1

// ── Module state ────────────────────────────────────────────────────────────

const listeners = new Set()
let currentUserId = 'anon'
let capsCache = null          // in-memory mirror so we do not re-read storage per fire
let capsCacheKey = null

function capsKey() {
  return `${CAPS_KEY_PREFIX}:${currentUserId}`
}

function todayStr(now = Date.now()) {
  // Local calendar day, not UTC. A cap that resets at 8pm local would be a bug.
  const d = new Date(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const EMPTY_CAPS = { day: null, mediumCount: 0, majorAt: 0 }

function readCaps() {
  const key = capsKey()
  if (capsCache && capsCacheKey === key) return capsCache
  let parsed = EMPTY_CAPS
  try {
    const raw = localStorage.getItem(key)
    if (raw) parsed = { ...EMPTY_CAPS, ...JSON.parse(raw) }
  } catch { /* storage unavailable, fall back to in-memory only */ }
  capsCache = parsed
  capsCacheKey = key
  return parsed
}

function writeCaps(next) {
  capsCache = next
  capsCacheKey = capsKey()
  try { localStorage.setItem(capsKey(), JSON.stringify(next)) } catch { /* ignore */ }
}

/**
 * Bind caps to a user. Call on login and on logout (with null) so one user's
 * caps never leak into another's session on a shared machine.
 */
export function setCelebrationUser(userId) {
  const next = userId || 'anon'
  if (next === currentUserId) return
  currentUserId = next
  capsCache = null
  capsCacheKey = null
}

// ── Sound ───────────────────────────────────────────────────────────────────
// Off by default on web per the brief. One global toggle, respected everywhere.

let soundEnabled = null

export function isSoundEnabled() {
  if (soundEnabled === null) {
    try { soundEnabled = localStorage.getItem(SOUND_KEY) === '1' } catch { soundEnabled = false }
  }
  return soundEnabled
}

export function setSoundEnabled(on) {
  soundEnabled = !!on
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* ignore */ }
  emit({ type: 'sound-changed', enabled: soundEnabled })
}

// Synthesised so we do not ship audio binaries or risk a 404 on a reward beat.
// Exported so the Account toggle can preview the real tone. Firing a whole
// celebrate() there would raise a toast for flipping a switch, which is the
// empty reward the tier system exists to prevent.
export function playTone(tier) {
  if (!isSoundEnabled()) return
  if (typeof window === 'undefined') return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  try {
    const ctx = new Ctx()
    const now = ctx.currentTime
    const notes = tier >= TIER.MAJOR ? [523.25, 659.25, 783.99] : [523.25, 783.99]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.09
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })
    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 900)
  } catch { /* audio blocked before a user gesture, silently skip */ }
}

// ── Subscription ────────────────────────────────────────────────────────────

/**
 * Surfaces (CelebrationOverlay, XPFlyup) subscribe here. The controller stays
 * framework-free so it can be called from anywhere, including non-React code.
 */
export function subscribeCelebration(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function emit(event) {
  listeners.forEach((fn) => {
    try { fn(event) } catch { /* one bad listener must not kill a celebration */ }
  })
}

// ── Geometry ────────────────────────────────────────────────────────────────

function resolveEl(anchorEl) {
  if (!anchorEl) return null
  const el = anchorEl.current ?? anchorEl
  return el && typeof el.getBoundingClientRect === 'function' ? el : null
}

/** canvas-confetti wants normalised viewport coordinates, not page pixels. */
function originFromEl(el) {
  const fallback = { x: 0.5, y: 0.6 }
  if (!el || typeof window === 'undefined') return fallback
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return fallback
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  return {
    x: Math.min(1, Math.max(0, (r.left + r.width / 2) / w)),
    y: Math.min(1, Math.max(0, (r.top + r.height / 2) / h)),
  }
}

function rectFromEl(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// ── Caps ────────────────────────────────────────────────────────────────────

/**
 * Returns the tier that may actually fire. Walks down one tier at a time until
 * it finds one that is under cap. MICRO and SMALL are uncapped so this always
 * terminates.
 */
function applyCaps(requested, now) {
  const caps = readCaps()
  const today = todayStr(now)
  let tier = requested

  while (tier > TIER.SMALL) {
    if (tier === TIER.MAJOR) {
      if (!caps.majorAt || now - caps.majorAt >= WEEK_MS) return tier
      tier = TIER.MEDIUM
      continue
    }
    if (tier === TIER.MEDIUM) {
      const count = caps.day === today ? caps.mediumCount : 0
      if (count < MEDIUM_PER_DAY) return tier
      tier = TIER.SMALL
      continue
    }
  }
  return tier
}

function recordFire(tier, now) {
  const caps = readCaps()
  const today = todayStr(now)
  if (tier === TIER.MAJOR) {
    writeCaps({ ...caps, majorAt: now })
    return
  }
  if (tier === TIER.MEDIUM) {
    const count = caps.day === today ? caps.mediumCount : 0
    writeCaps({ ...caps, day: today, mediumCount: count + 1 })
  }
}

// ── Visual primitives ───────────────────────────────────────────────────────

/**
 * Web Animations API rather than framer-motion, because the anchor is an
 * arbitrary DOM node the controller does not own and must not re-render.
 */
function pulse(el, { scale = 1.08, duration = 180 }) {
  if (!el || typeof el.animate !== 'function') return
  try {
    el.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }],
      { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  } catch { /* ignore */ }
}

function liftAndGlow(el, { duration = 400, glow = 'rgba(52,82,217,0.35)' }) {
  if (!el || typeof el.animate !== 'function') return
  try {
    el.animate(
      [
        { transform: 'translateY(0) scale(1)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
        { transform: 'translateY(-6px) scale(1.02)', boxShadow: `0 12px 32px ${glow}` },
        { transform: 'translateY(0) scale(1)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
      ],
      { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  } catch { /* ignore */ }
}

function burst(origin, particleCount, ticks) {
  try {
    confetti({
      particleCount,
      spread: particleCount >= 200 ? 100 : 55,
      startVelocity: particleCount >= 200 ? 45 : 32,
      ticks,
      origin,
      // We gate on prefersReducedMotion ourselves and substitute a badge, but
      // keep this on as a second line of defence.
      disableForReducedMotion: true,
      colors: ['#3452D9', '#10A56E', '#E8B14A', '#8B5CF6', '#EC4899'],
    })
  } catch { /* ignore */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Request a celebration.
 *
 * @param {object}  opts
 * @param {number}  opts.tier      One of TIER.*
 * @param {string}  opts.trigger   Stable event name for analytics, e.g. 'streak_milestone'
 * @param {Element|React.RefObject} [opts.anchorEl] Element the reward originates from
 * @param {object}  [opts.meta]    Extra analytics props. `meta.xp` drives the XP flyup.
 * @returns {number} the tier that actually fired
 */
export function celebrate({ tier = TIER.MICRO, trigger = 'unknown', anchorEl = null, meta = {} } = {}) {
  const now = Date.now()
  const requested = Math.max(TIER.MICRO, Math.min(TIER.MAJOR, tier))
  const fired = applyCaps(requested, now)
  const wasCapped = fired !== requested
  const reduced = prefersReducedMotion()

  const el = resolveEl(anchorEl)
  const origin = originFromEl(el)
  const point = rectFromEl(el)

  recordFire(fired, now)

  track('celebration_fired', {
    tier: TIER_NAME[fired],
    tier_level: fired,
    requested_tier: TIER_NAME[requested],
    trigger,
    was_capped: wasCapped,
    reduced_motion: reduced,
    ...meta,
  })

  // XP flyup rides along with any tier when the caller supplies an amount.
  if (typeof meta.xp === 'number' && meta.xp > 0) {
    emit({ type: 'xp', amount: meta.xp, point, reduced })
  }

  if (reduced) {
    // Never just skip the reward. The user still needs to know something good
    // happened, it simply arrives as a static badge that scales in over 120ms.
    if (fired >= TIER.MEDIUM) {
      emit({
        type: 'badge',
        tier: fired,
        trigger,
        title: meta.title ?? null,
        body: meta.body ?? null,
        durationMs: fired >= TIER.MAJOR ? DURATION_MS.peak : 700,
      })
    } else if (el) {
      // A 120ms opacity nudge conveys "registered" without moving anything.
      try { el.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: DURATION_MS.micro }) } catch { /* ignore */ }
    }
    if (fired >= TIER.MEDIUM) playTone(fired)
    return fired
  }

  switch (fired) {
    case TIER.MICRO:
      pulse(el, { scale: 1.08, duration: 180 })
      break

    case TIER.SMALL:
      if (el) {
        liftAndGlow(el, { duration: 400 })
      } else {
        // Without an anchor there is nothing to lift, and the xpbar event below
        // has no subscriber, so a SMALL used to be a silent no-op on web (the
        // tone is off by default there). A tier that can vanish is not a tier.
        // Fall back to the same non-blocking strip MEDIUM uses, which is still
        // clearly quieter than confetti.
        emit({
          type: 'toast',
          tier: fired,
          trigger,
          title: meta.title ?? null,
          body: meta.body ?? null,
          durationMs: 700,
        })
      }
      // KEEP THIS EMIT. It currently has no subscriber, which makes it look
      // like dead code, and a previous audit flagged it as exactly that. It is
      // the input signal for the Mastery Map home surface (see
      // engagement-audit-and-build-order.md section 3.1): every SMALL is one
      // unit of progress against a topic, which is what lights a node on that
      // map. Deleting it means rebuilding the emit side later. The surface is
      // planned, not shipped.
      emit({ type: 'xpbar', trigger, meta })
      playTone(fired)
      break

    case TIER.MEDIUM:
      burst(origin, 60, 120)
      playTone(fired)
      emit({
        type: 'toast',
        tier: fired,
        trigger,
        title: meta.title ?? null,
        body: meta.body ?? null,
        durationMs: 700,
      })
      break

    case TIER.MAJOR:
      burst(origin.y > 0.9 ? { x: origin.x, y: 0.7 } : origin, 200, 260)
      playTone(fired)
      emit({
        type: 'overlay',
        tier: fired,
        trigger,
        title: meta.title ?? null,
        body: meta.body ?? null,
        shareCard: meta.shareCard ?? null,
        durationMs: DURATION_MS.peak,
      })
      break

    default:
      break
  }

  return fired
}

/**
 * The other half of the response system: what happens when a session went badly.
 *
 * This is deliberately NOT celebrate() at a low tier. It fires no confetti, no
 * tone, no lift, and it consumes no cap, because nothing here is a reward. It
 * raises one strip that names the concept she lost and offers a single button
 * that drills only that concept.
 *
 * It lives in this file rather than alongside the tool listener for the same
 * reason celebrate() does: there is exactly one module allowed to paint over
 * the app, so there is exactly one place to audit what the student can be
 * interrupted by.
 *
 * @param {object} opts
 * @param {string} opts.concept      the thing she lost points on. Required.
 * @param {string} [opts.alsoConcept] one more, at most.
 * @param {string} [opts.courseName]
 * @param {string} [opts.courseId]
 * @param {number} [opts.pct]        the score, for analytics only. Not shown.
 * @param {string} [opts.actionLabel]
 */
export function showRepair({
  trigger = 'unknown', concept = null, alsoConcept = null,
  courseName = null, courseId = null, pct = null,
  actionLabel = 'Six minutes on just that',
} = {}) {
  // Without a concept there is nothing specific to say and nothing to scope a
  // drill to. Silence beats a generic "keep going", which is the consolation
  // copy this whole branch exists to avoid.
  if (!concept) return false

  // Emit BEFORE reporting. Analytics is not allowed to decide whether the
  // student sees a response: if track() throws (no key configured, blocked by
  // an extension, transport wedged) the prompt must still appear.
  emit({
    type: 'repair',
    trigger,
    concept,
    alsoConcept,
    courseName,
    courseId,
    actionLabel,
  })

  try { track('repair_prompt_shown', { trigger, concept, course_name: courseName, pct }) } catch { /* never block the prompt */ }
  return true
}

/** Test and debug helper. Not called in product code. */
export function _resetCapsForTesting() {
  writeCaps({ ...EMPTY_CAPS })
}

export default { TIER, celebrate, showRepair, subscribeCelebration, setCelebrationUser, isSoundEnabled, setSoundEnabled }
