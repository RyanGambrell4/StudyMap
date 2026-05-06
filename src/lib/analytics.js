/**
 * analytics.js — PostHog wrapper for StudyEdge AI
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
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let _ready = false

export function initAnalytics() {
  if (!KEY) return
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // manual events only — keep it clean
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
