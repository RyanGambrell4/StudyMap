import { describe, it, expect } from 'vitest'
import { routeHash, routeState, parseRoute, previousRoute } from './coachRoute.js'

describe('routeHash', () => {
  it('gives each sub-view its own URL', () => {
    expect(routeHash('plans', 1)).toBe('#coach')
    expect(routeHash('building', 1)).toBe('#coach/build/1')
    expect(routeHash('building', 2)).toBe('#coach/build/2')
    expect(routeHash('viewing', 3)).toBe('#coach/plan')
  })

  it('every sub-view is distinct, which is what gives each a history entry', () => {
    const hashes = [
      routeHash('plans', 1), routeHash('building', 1),
      routeHash('building', 2), routeHash('viewing', 3),
    ]
    expect(new Set(hashes).size).toBe(4)
  })
})

describe('routeState', () => {
  it('keeps the section key the existing OutputView listener reads', () => {
    expect(routeState('building', 2)).toEqual({ section: 'coach', coach: { uiMode: 'building', step: 2 } })
  })
})

describe('parseRoute: refresh lands on the view you were looking at', () => {
  it('round trips every sub-view', () => {
    for (const [uiMode, step] of [['plans', 1], ['building', 1], ['building', 2], ['viewing', 3]]) {
      expect(parseRoute(routeHash(uiMode, step))).toEqual({ uiMode, step })
    }
  })

  it('ignores hashes belonging to other sections', () => {
    expect(parseRoute('#dashboard')).toBe(null)
    expect(parseRoute('#grades')).toBe(null)
    expect(parseRoute('')).toBe(null)
    expect(parseRoute(undefined)).toBe(null)
  })

  it('falls back to the hub for an unrecognised coach hash', () => {
    expect(parseRoute('#coach/nonsense')).toEqual({ uiMode: 'plans', step: 1 })
    expect(parseRoute('#coach/build/99')).toEqual({ uiMode: 'building', step: 1 })
  })
})

describe('previousRoute: Back unwinds one level at a time', () => {
  it('step 2 returns to step 1, not out of Study Coach', () => {
    expect(previousRoute({ uiMode: 'building', step: 2 })).toEqual({ uiMode: 'building', step: 1 })
  })

  it('step 1 returns to the hub', () => {
    expect(previousRoute({ uiMode: 'building', step: 1 })).toEqual({ uiMode: 'plans', step: 1 })
  })

  it('the plan view returns to the hub', () => {
    expect(previousRoute({ uiMode: 'viewing', step: 3 })).toEqual({ uiMode: 'plans', step: 1 })
  })

  it('the hub is the last coach level, so Back leaves the section', () => {
    expect(previousRoute({ uiMode: 'plans', step: 1 })).toBe(null)
  })

  it('unwinding from step 2 reaches the hub in exactly two Backs', () => {
    let route = { uiMode: 'building', step: 2 }
    const trail = [route]
    while (route) { route = previousRoute(route); if (route) trail.push(route) }
    expect(trail).toEqual([
      { uiMode: 'building', step: 2 },
      { uiMode: 'building', step: 1 },
      { uiMode: 'plans', step: 1 },
    ])
  })
})
