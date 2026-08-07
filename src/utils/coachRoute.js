/**
 * coachRoute.js - the URL shape for Study Coach views.
 *
 * Extends the section-level history in OutputView rather than adding a second
 * mechanism: every entry is still `{ section, ... }` pushed with pushState,
 * with one extra `coach` key describing which sub-view is showing.
 *
 * Encoding and parsing live here, pure, so the back and refresh behaviour can
 * be tested without a DOM.
 */

/** The hash for a given coach sub-view. */
export function routeHash(uiMode, step) {
  if (uiMode === 'plans') return '#coach'
  if (step === 3) return '#coach/plan'
  return `#coach/build/${step === 2 ? 2 : 1}`
}

/** The history state object pushed for a coach sub-view. */
export function routeState(uiMode, step) {
  return { section: 'coach', coach: { uiMode, step } }
}

/**
 * Reads a hash back into a sub-view. Returns null for anything that is not a
 * coach route, so the caller leaves other sections alone.
 *
 * Step 3 resolves to the plan screen, which rehydrates from the stored plan.
 * A build step resolves to the wizard, which rehydrates from the saved draft.
 */
export function parseRoute(hash) {
  const h = String(hash ?? '')
  if (!h.startsWith('#coach')) return null
  if (h === '#coach' || h === '#coach/') return { uiMode: 'plans', step: 1 }
  if (h.startsWith('#coach/plan')) return { uiMode: 'viewing', step: 3 }
  const m = /^#coach\/build\/(\d+)/.exec(h)
  if (m) {
    const n = Number(m[1])
    return { uiMode: 'building', step: n === 2 ? 2 : 1 }
  }
  return { uiMode: 'plans', step: 1 }
}

/**
 * Where Back should land from a given sub-view, used to assert the wizard
 * unwinds one level at a time instead of leaving the section.
 */
export function previousRoute(route) {
  if (!route) return null
  if (route.uiMode === 'plans') return null                       // Back leaves Study Coach
  if (route.uiMode === 'building' && route.step === 2) return { uiMode: 'building', step: 1 }
  if (route.uiMode === 'building' && route.step === 1) return { uiMode: 'plans', step: 1 }
  if (route.uiMode === 'viewing') return { uiMode: 'plans', step: 1 }
  return { uiMode: 'plans', step: 1 }
}
