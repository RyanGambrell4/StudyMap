/**
 * analytics.js - PostHog wrapper for StudyEdge AI
 *
 * All tracking is no-op when VITE_POSTHOG_KEY is not set,
 * so local dev stays clean without any extra config.
 *
 * Usage:
 *   import { initAnalytics, identifyUser, track } from './analytics'
 *   initAnalytics()
 *   identifyUser(userId, { email, plan })
 *   track('onboarding_completed', { plan: 'free' })
 */

import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || '/ph'

let _ready = false

export function initAnalytics() {
  if (!KEY) {
    // Loud in prod, silent in dev - so a missing/empty key is caught next deploy, not 33 days later.
    if (import.meta.env.PROD) {
      console.error('[analytics] VITE_POSTHOG_KEY is missing or empty - no events will be sent')
    }
    return
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // manual events only - keep it clean
    session_recording: {
      maskAllInputs: true,   // never record passwords / typed text
      maskTextSelector: '[data-private]', // opt-in masking for extra-sensitive elements
    },
    loaded: () => { if (import.meta.env.DEV) console.info('[analytics] posthog ready') },
  })
  _ready = true
}

export function identifyUser(userId, props = {}) {
  if (!_ready) return
  posthog.identify(userId, props)
}

export function resetUser() {
  if (!_ready) return
  posthog.reset()
}

export function track(event, props = {}) {
  if (!_ready) return
  posthog.capture(event, props)
}

// Sticky props attached to every event (e.g. plan, school_type). Call when known.
export function register(props = {}) {
  if (!_ready) return
  posthog.register(props)
}

// Sticky props that only stick the first time set (e.g. acquisition_source, signup_date).
export function registerOnce(props = {}) {
  if (!_ready) return
  posthog.register_once(props)
}

// ── Dopamine onboarding funnel ──────────────────────────────────────────────
//
// The full event vocabulary from `dopamine-onboarding-design-brief.md`
// section 6. These are named helpers rather than raw `track` calls so the
// event names cannot drift between call sites, and so the web funnel stays
// comparable with the iOS one. Do not rename without changing both platforms.
//
// A PostHog funnel over onboarding_step_viewed -> onboarding_step_completed,
// broken down by step_index, shows the drop-off point without a query.

export const ONBOARDING_EVENTS = {
  stepViewed:        'onboarding_step_viewed',
  stepCompleted:     'onboarding_step_completed',
  abandoned:         'onboarding_abandoned',
  buildCompleted:    'build_screen_completed',
  revealViewed:      'reveal_viewed',
  revealCtaTapped:   'reveal_cta_tapped',
  proofAnswered:     'proof_question_answered',
  paywallViewed:     'paywall_viewed',
  purchaseStarted:   'paywall_purchase_started',
  purchaseCompleted: 'paywall_purchase_completed',
  exitOfferShown:    'paywall_exit_offer_shown',
  exitOfferTaken:    'paywall_exit_offer_taken',
  firstSession:      'day_one_first_session_completed',
  celebrationFired:  'celebration_fired',
}

export function trackStepViewed({ step_index, step_name, variant = null }) {
  track(ONBOARDING_EVENTS.stepViewed, { step_index, step_name, variant })
}

export function trackStepCompleted({ step_index, step_name, answer, time_on_step_ms }) {
  track(ONBOARDING_EVENTS.stepCompleted, {
    step_index,
    step_name,
    // Arrays are kept as arrays so PostHog can break down multi-select answers.
    answer: answer ?? null,
    time_on_step_ms,
  })
}

export function trackAbandoned(props = {}) {
  track(ONBOARDING_EVENTS.abandoned, props)
}

export function trackBuildCompleted({ actual_duration_ms, backend_latency_ms, backend_ok = true }) {
  track(ONBOARDING_EVENTS.buildCompleted, { actual_duration_ms, backend_latency_ms, backend_ok })
}

export function trackRevealViewed({ current_grade, target_grade, projected_grade }) {
  track(ONBOARDING_EVENTS.revealViewed, { current_grade, target_grade, projected_grade })
}

export function trackRevealCtaTapped({ time_to_tap_ms }) {
  track(ONBOARDING_EVENTS.revealCtaTapped, { time_to_tap_ms })
}

export function trackProofAnswered({ correct, time_to_answer_ms, source = 'generated' }) {
  track(ONBOARDING_EVENTS.proofAnswered, { correct, time_to_answer_ms, source })
}

export function trackPaywallViewed({ variant, seriousness_segment }) {
  track(ONBOARDING_EVENTS.paywallViewed, { variant, seriousness_segment })
}

export function trackFirstSessionCompleted(props = {}) {
  track(ONBOARDING_EVENTS.firstSession, props)
}
