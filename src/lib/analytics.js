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
    // Session replay is OFF. It was active on this surface (the marketing site
    // has always disabled it) and recorded 620 sessions in four weeks, 158 of
    // them belonging to users who identified as high school students. maskAllInputs
    // covered typed text but not rendered content, so recordings contained grades,
    // course names, syllabus text and tutor conversations on screen.
    //
    // Off rather than masked: the privacy policy does not disclose replay and the
    // retention period is not established, so off is the only defensible state
    // until both are. Revisit with maskAllText once those are settled.
    disable_session_recording: true,
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
