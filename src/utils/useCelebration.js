/**
 * useCelebration - thin React binding over the celebration controller.
 *
 * This hook no longer owns any celebration logic. It delegates to
 * `src/lib/celebration.js`, which is the only place that fires confetti,
 * enforces frequency caps and reports to PostHog.
 *
 * The legacy call signature `celebrate('light' | 'medium' | 'big')` still works
 * so existing callers do not break, but new code should pass the options form:
 *
 *   const celebrate = useCelebration()
 *   celebrate({ tier: TIER.MEDIUM, trigger: 'streak_milestone', anchorEl: ref, meta: { xp: 10 } })
 *
 * Passing an `anchorEl` matters. Without it a MEDIUM burst originates from the
 * middle of the viewport instead of the element the user just interacted with.
 */

import { useCallback } from 'react'
import { celebrate as fire, TIER } from '../lib/celebration'

// Safety net for any call site that still passes a legacy string. Every known
// call site has been audited and migrated to an explicit tier; see the tier
// table in `dopamine-onboarding-design-brief.md` section 4.
const LEGACY_TIER = {
  light:  TIER.MICRO,
  medium: TIER.SMALL,
  big:    TIER.MEDIUM,
}

export function useCelebration() {
  return useCallback((arg = {}, extra = {}) => {
    if (typeof arg === 'string') {
      return fire({
        tier: LEGACY_TIER[arg] ?? TIER.MICRO,
        trigger: extra.trigger ?? `legacy_${arg}`,
        anchorEl: extra.anchorEl ?? null,
        meta: extra.meta ?? {},
      })
    }
    return fire(arg)
  }, [])
}

export { TIER }
export default useCelebration
