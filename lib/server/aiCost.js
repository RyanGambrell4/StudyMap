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

import { posthogCapture } from './posthog.js'
import { installAnthropicTiming } from './aiTiming.js'
import { getRedis } from './redis.js'

// Every module that logs AI calls imports this one, so this times them all.
installAnthropicTiming()

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
export async function logAiCall({ endpoint, model, userId, plan, usage, ok, reason, latencyMs }) {
  const costUsd = estimateCostUsd(model, usage)
  const u = usage && typeof usage === 'object' ? usage : {}
  const latency = typeof latencyMs === 'number' ? latencyMs : (typeof u._latency_ms === 'number' ? u._latency_ms : null)

  // PostHog LLM analytics: one $ai_generation per Anthropic call, with the
  // tool name as the span. Property names follow PostHog's LLM schema.
  try {
    await posthogCapture('$ai_generation', userId || 'server', {
      $ai_provider: 'anthropic',
      $ai_model: model ?? null,
      $ai_span_name: endpoint ?? null,
      $ai_input_tokens: toCount(u.input_tokens),
      $ai_output_tokens: toCount(u.output_tokens),
      $ai_cache_read_input_tokens: toCount(u.cache_read_input_tokens),
      $ai_cache_creation_input_tokens: toCount(u.cache_creation_input_tokens),
      $ai_latency: latency == null ? null : latency / 1000,
      $ai_total_cost_usd: costUsd,
      $ai_is_error: ok === false,
      $ai_error: ok === false ? (reason ?? 'error') : null,
      tool: endpoint ?? null,
      plan: plan ?? null,
    })
  } catch (err) {
    console.error(`[aiCost] posthog capture failed for ${endpoint}: ${err?.message ?? err}`)
  }

  await recordSpend(costUsd)

  return costUsd
}

// ─── Org-wide daily spend cap ────────────────────────────────────────────────
//
// Every other ceiling in the product is per user, so N accounts is N times the
// ceiling. Email confirmation is not the account-farming friction it appears to
// be either: Google OAuth signups arrive with confirmed_at already set. This is
// the one limit that does not scale with the number of accounts.
//
// It is a backstop behind the spend limit set in the Anthropic console, not the
// primary control, which is why every failure mode here allows rather than
// denies. A bug in this file must not be able to take AI down on its own.

const SPEND_KEY_PREFIX = 'ai:spend:'
const SPEND_TTL_SECONDS = 48 * 3600
const DEFAULT_CAP_USD = 25

// The counter is kept in micro-dollars rather than the cents the task document
// specified. Cents cannot represent a Haiku call: most of them cost well under
// a cent, so Math.round(cost * 100) is 0 and 25 of the 29 endpoints would
// contribute nothing at all to a cap that is supposed to be org-wide. Storing
// millionths keeps the integer counter Redis needs without discarding the
// cheap traffic. spentUsd is still reported in dollars.
const MICRO_PER_USD = 1_000_000

function spendKeyForToday() {
  return `${SPEND_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`
}

function capUsd() {
  const raw = Number(process.env.AI_DAILY_SPEND_CAP_USD)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CAP_USD
}

/** Add one call's cost to today's counter. Silent no-op without Redis. */
async function recordSpend(costUsd) {
  if (!(costUsd > 0)) return
  const redis = getRedis()
  if (!redis) return

  const micros = Math.round(costUsd * MICRO_PER_USD)
  if (micros <= 0) return

  try {
    const key = spendKeyForToday()
    const total = await redis.incrby(key, micros)
    // Set the TTL once, on the write that created the key. The window is 48h so
    // a UTC-day counter is still readable either side of midnight.
    if (total === micros) await redis.expire(key, SPEND_TTL_SECONDS)
  } catch (err) {
    console.error(`[aiCost] spend counter increment failed: ${err?.message ?? err}`)
  }
}

/**
 * Is the org under its daily AI spend cap?
 *
 * Fails open on every error path and when Redis is absent: this sits in front
 * of every AI request in the product, and the real ceiling is the one set in
 * the Anthropic console.
 */
export async function checkGlobalSpendCap() {
  const cap = capUsd()
  const redis = getRedis()
  if (!redis) return { ok: true, spentUsd: 0, capUsd: cap }

  try {
    const raw = await redis.get(spendKeyForToday())
    const spentUsd = Number(raw) > 0 ? Number(raw) / MICRO_PER_USD : 0
    return { ok: spentUsd < cap, spentUsd, capUsd: cap }
  } catch (err) {
    console.error(`[aiCost] spend cap read failed, allowing: ${err?.message ?? err}`)
    return { ok: true, spentUsd: 0, capUsd: cap }
  }
}
