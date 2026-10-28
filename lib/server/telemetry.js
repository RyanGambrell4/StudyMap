// Server telemetry, sent to PostHog.
//
// This used to go to Axiom, whose `studyedge` dataset never existed: every
// ai.* event was dropped (found 2026-10-26). Decided 2026-10-28: drop Axiom,
// send to PostHog, which the product already uses. AI calls are captured as
// PostHog LLM analytics `$ai_generation` events (see aiCost.logAiCall); the
// rest as plain named events. Fire-and-forget: never blocks, never throws.

import { posthogCapture } from './posthog.js'

/**
 * Capture a structured server event. `data.userId` becomes the PostHog
 * distinct id; events with no user are attributed to "server".
 *
 * @param {string} event e.g. 'ai.rate_limited', 'usage.reserved'
 * @param {object} data
 */
export async function log(event, data = {}) {
  try {
    const { userId, ...props } = data || {}
    await posthogCapture(event, userId || 'server', props)
  } catch (err) {
    console.error(`[telemetry] '${event}' failed: ${err?.message ?? err}`)
  }
}

/**
 * Latency-only AI event used by the streaming endpoints (chat tutor,
 * session blueprint). Token counts and cost are in aiCost.logAiCall's
 * $ai_generation event; this one records time to finish.
 */
export async function logAiCall({ endpoint, userId, plan, model, tokens, latencyMs, error }) {
  await log('ai.request', {
    endpoint,
    userId,
    plan,
    model: model ?? null,
    inputTokens: tokens?.input ?? null,
    outputTokens: tokens?.output ?? null,
    latencyMs: latencyMs ?? null,
    error: error ?? null,
    success: !error,
  })
}

/** A user action (subscription, trial, ...). */
export async function logUserEvent({ event, userId, plan, metadata = {} }) {
  await log(`user.${event}`, { userId, plan, ...metadata })
}
