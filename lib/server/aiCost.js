// AI cost telemetry.
//
// Why this file exists: before it, nothing recorded how many tokens any
// Anthropic call consumed, so "which endpoint spent this money" was only
// answerable by reading git history. Every Anthropic call in api/ now reports
// its usage through here.
//
// The call is logged as soon as Anthropic's response body is parsed, before the
// endpoint does anything with it. That placement is deliberate: tokens are
// billed the moment the model generates them, so a call that succeeds at
// Anthropic and then fails our own JSON validation still cost real money. That
// is exactly the spend that used to be invisible, and logging at the response
// boundary captures it whatever the endpoint does next.
//
// A fetch that throws before any response (DNS, connection reset) is not logged
// here. It also costs nothing, so no spend is hidden by that gap.

import { log } from './axiom.js'

// USD per million tokens. Verified against the Anthropic pricing page on
// 2026-09-09. These are the only two models api/ sends to Anthropic; an unknown
// model costs 0 rather than throwing, and its name still reaches the log so a
// new model shows up as a visible gap instead of a crash.
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
}

// Cache tokens are not separately published rates, they are fixed multiples of
// the model's input rate: a 5 minute cache write costs 1.25x input, a cache read
// 0.1x. Deriving them keeps one pair of numbers per model in the table above.
// generate-study-coach-plan sends cache_control, so these are load bearing.
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

const PER_MILLION = 1_000_000

/** A token count we are willing to bill for: finite, positive, a number. */
function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Estimate what one Anthropic call cost, in USD.
 *
 * `usage` is the `usage` object from the Anthropic response body. A failed call
 * may not have one at all, so every shape that is not a populated object has to
 * come back as 0 rather than throw: this runs on the error path, and a cost
 * estimator that throws would turn a recoverable API error into a 500.
 */
export function estimateCostUsd(model, usage) {
  const price = PRICING[model]
  if (!price) return 0
  if (!usage || typeof usage !== 'object') return 0

  const usd = (
    toCount(usage.input_tokens) * price.input +
    toCount(usage.output_tokens) * price.output +
    toCount(usage.cache_creation_input_tokens) * price.input * CACHE_WRITE_MULTIPLIER +
    toCount(usage.cache_read_input_tokens) * price.input * CACHE_READ_MULTIPLIER
  ) / PER_MILLION

  // Six decimals: a single Haiku call can legitimately cost less than a cent,
  // and rounding those to zero would make the cheap endpoints look free.
  return Math.round(usd * 1e6) / 1e6
}

/**
 * Log one Anthropic call. Emits `ai.call` through the same Axiom channel as the
 * rest of the operational events (see lib/server/usage.js for `ai.gate.*`).
 *
 * Returns the estimated cost so a caller can use it without recomputing.
 * Never throws: telemetry must not be able to fail a request.
 */
export async function logAiCall({ endpoint, model, userId, plan, usage, ok, reason }) {
  const costUsd = estimateCostUsd(model, usage)
  const u = usage && typeof usage === 'object' ? usage : {}

  try {
    await log('ai.call', {
      endpoint: endpoint ?? null,
      model: model ?? null,
      userId: userId ?? null,
      plan: plan ?? null,
      inputTokens: toCount(u.input_tokens),
      outputTokens: toCount(u.output_tokens),
      cacheWriteTokens: toCount(u.cache_creation_input_tokens),
      cacheReadTokens: toCount(u.cache_read_input_tokens),
      costUsd,
      ok: ok !== false,
      reason: reason ?? null,
    })
  } catch (err) {
    console.error(`[aiCost] failed to log ${endpoint}: ${err?.message ?? err}`)
  }

  return costUsd
}
