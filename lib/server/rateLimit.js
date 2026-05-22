import { getRedis } from './redis.js'

/**
 * Sliding window rate limiter
 * @param {string} key - unique key (e.g. `ai:${userId}`)
 * @param {number} limit - max requests
 * @param {number} windowSeconds - window size in seconds
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
export async function rateLimit(key, limit, windowSeconds) {
  const redis = getRedis()

  // No Redis configured — allow but log
  if (!redis) {
    return { allowed: true, remaining: limit - 1, resetIn: windowSeconds }
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

    return { allowed, remaining, resetIn }
  } catch (err) {
    // Redis error — fail open (allow request)
    console.error('[rateLimit] Redis error:', err.message)
    return { allowed: true, remaining: 0, resetIn: windowSeconds }
  }
}

/**
 * Per-user AI rate limits:
 * - 10 req/minute burst limit (all plans)
 * - 100 req/hour (pro/unlimited)
 * - 20 req/hour (free)
 */
export async function checkAiRateLimit(userId, plan) {
  const minuteLimit = plan === 'free' ? 3 : 10
  const hourLimit = plan === 'free' ? 10 : 60

  const [minute, hour] = await Promise.all([
    rateLimit(`ai:${userId}:min`, minuteLimit, 60),
    rateLimit(`ai:${userId}:hour`, hourLimit, 3600),
  ])

  if (!minute.allowed) {
    return {
      allowed: false,
      error: "Slow down — you're sending requests too fast. Wait a moment.",
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
