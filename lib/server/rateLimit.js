import { getRedis } from './redis.js'
import { log } from './telemetry.js'

/**
 * Sliding window rate limiter
 * @param {string} key - unique key (e.g. `ai:${userId}`)
 * @param {number} limit - max requests
 * @param {number} windowSeconds - window size in seconds
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
export async function rateLimit(key, limit, windowSeconds) {
  const redis = getRedis()

  // No Redis configured. Report `degraded` rather than deciding here: this
  // primitive cannot know whether its caller can afford to fail open, and
  // returning allowed:true with no signal is what let a Redis outage silently
  // remove every AI ceiling at once. checkAiRateLimit decides by plan.
  if (!redis) {
    return { allowed: true, remaining: limit - 1, resetIn: windowSeconds, degraded: true }
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`

    const count = await redis.incr(windowKey)
    if (count === 1) {
      // First request in this window — set expiry
      await redis.expire(windowKey, windowSeconds * 2)
    }

    const allowed = count <= limit
    const remaining = Math.max(0, limit - count)
    const resetIn = windowSeconds - (now % windowSeconds)

    return { allowed, remaining, resetIn, degraded: false }
  } catch (err) {
    // Redis threw. Same reasoning as the no-Redis branch above: report the
    // degradation and let the caller choose.
    console.error('[rateLimit] Redis error:', err.message)
    return { allowed: true, remaining: 0, resetIn: windowSeconds, degraded: true }
  }
}

/**
 * Ceiling for endpoints that cost real money but are deliberately NOT charged
 * against the monthly AI allowance.
 *
 * Some calls are too cheap, or too central to the moment that sells the
 * product, to spend one of a free user's five actions on — grade prediction is
 * a tenth of a cent, and voice input is the entry point to a chat message that
 * is already being charged for. Charging them would cost more in conversion
 * than it saves in tokens.
 *
 * "Not metered" must not mean "unlimited", though, which is what it meant
 * before this existed: skipping reserveAiUsage also skips checkAiRateLimit, so
 * these endpoints had no ceiling of any kind. This gives each one its own,
 * keyed per feature so a burst of grade predictions cannot exhaust the budget
 * for voice input or vice versa.
 *
 * Limits are per user, per feature. Deliberately generous relative to real use
 * and still small enough to make automated abuse pointless.
 *
 * NOTE: rateLimit() fails open when Redis is unreachable or unconfigured. That
 * is the existing, deliberate choice and is right for a metered endpoint, where
 * the quota is the real backstop. Here it is the ONLY backstop, so a Redis
 * outage removes the ceiling entirely. Acceptable for calls at this price;
 * revisit if anything expensive is ever added to this path.
 */
export async function checkFeatureRateLimit(userId, feature, { perMinute, perDay }) {
  const [minute, day] = await Promise.all([
    rateLimit(`feat:${feature}:${userId}:min`, perMinute, 60),
    rateLimit(`feat:${feature}:${userId}:day`, perDay, 86400),
  ])

  if (!minute.allowed) {
    return {
      allowed: false,
      error: "Slow down. You're sending requests too fast. Wait a moment.",
      retryAfter: minute.resetIn,
    }
  }
  if (!day.allowed) {
    return {
      allowed: false,
      error: `You've hit today's limit for this. Try again in ${Math.ceil(day.resetIn / 3600)} hours.`,
      retryAfter: day.resetIn,
    }
  }

  return { allowed: true, remaining: Math.min(minute.remaining, day.remaining) }
}

/**
 * Accounts with their own AI rate limit. The App Review demo account stays
 * on the free plan (so reviewers can buy a subscription in the sandbox) and
 * keeps its bonus actions, but at the free limit of 3 a minute a reviewer
 * clicking through the tools hit "Slow down" (2026-10-26 probe: 20 of 23).
 * Decided 2026-10-28: 30 a minute for this account only.
 */
export const AI_RATE_OVERRIDES = {
  '73d99048-ec1d-47fe-a600-7355281f484f': { perMinute: 30, perHour: 300 }, // reviewer@studyedgeai.com
}

/**
 * Per-user AI rate limits:
 * - 10 req/minute burst limit (paid), 3 (free)
 * - 60 req/hour (paid), 10 (free)
 * - AI_RATE_OVERRIDES above for named accounts
 */
export async function checkAiRateLimit(userId, plan) {
  const override = AI_RATE_OVERRIDES[userId]
  const minuteLimit = override?.perMinute ?? (plan === 'free' ? 3 : 10)
  const hourLimit = override?.perHour ?? (plan === 'free' ? 10 : 60)

  const [minute, hour] = await Promise.all([
    rateLimit(`ai:${userId}:min`, minuteLimit, 60),
    rateLimit(`ai:${userId}:hour`, hourLimit, 3600),
  ])

  // Redis is the only thing standing between one account and unlimited bursts,
  // so when it is unavailable the two plans get different answers. Free users
  // are the abuse surface and the ones we can afford to inconvenience; a paid
  // user losing AI because our cache is down is a worse outcome than the spend,
  // so they pass and the outage is made loud instead of silent.
  if (minute.degraded || hour.degraded) {
    if (plan === 'free') {
      return {
        allowed: false,
        status: 503,
        error: 'AI is briefly unavailable. Please try again in a moment.',
        retryAfter: 30,
        degraded: true,
      }
    }
    log('ai.gate.ratelimit_degraded', { userId, plan })
    return { allowed: true, remaining: 0, degraded: true }
  }

  if (!minute.allowed) {
    return {
      allowed: false,
      error: "Slow down. You're sending requests too fast. Wait a moment.",
      retryAfter: minute.resetIn,
    }
  }
  if (!hour.allowed) {
    return {
      allowed: false,
      error: `You've hit your hourly limit. Try again in ${Math.ceil(hour.resetIn / 60)} minutes.`,
      retryAfter: hour.resetIn,
    }
  }

  return { allowed: true, remaining: Math.min(minute.remaining, hour.remaining) }
}
