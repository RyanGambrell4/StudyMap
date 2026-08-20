/**
 * The first-course gate.
 *
 * Onboarding used to end with zero courses by construction (App.jsx tracked
 * `n_courses: 0` with the comment "0 here by definition") and hand the user a
 * dashboard where every AI endpoint 400s. This gate stands in front of that.
 *
 * The invariant these tests defend: there is no way past this screen except by
 * adding a course. No skip, no dismiss, no "later", no close button.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'fs'

beforeAll(() => {
  globalThis.window = globalThis.window ?? {}
  globalThis.window.addEventListener = globalThis.window.addEventListener ?? (() => {})
  globalThis.window.removeEventListener = globalThis.window.removeEventListener ?? (() => {})
})

vi.mock('../lib/analytics', () => ({
  track: () => {}, register: () => {}, registerOnce: () => {},
  identifyUser: () => {}, resetUser: () => {}, initAnalytics: () => {},
}))

const { default: CourseRequiredGate } = await import('./CourseRequiredGate')

function render(props = {}) {
  return renderToStaticMarkup(<CourseRequiredGate {...props} />)
}

describe('CourseRequiredGate', () => {
  it('renders the syllabus path by default, because it produces a full course in one action', () => {
    const html = render()
    expect(html).toContain('Add your first course')
    expect(html).toContain('Drop your syllabus here')
  })

  it('offers typing a course name as the fallback', () => {
    const html = render()
    expect(html).toContain('I do not have my syllabus handy')
  })

  it('cannot be skipped, dismissed, or closed', () => {
    const html = render()
    for (const escape of ['Skip', 'skip', 'Later', 'Maybe later', 'Not now', 'Dismiss', 'Continue without', 'aria-label="Close"']) {
      expect(html, `the gate offers an escape hatch: "${escape}"`).not.toContain(escape)
    }
  })

  it('does not show a card ask, a price, or a trial offer', () => {
    const html = render()
    for (const ask of ['trial', 'Trial', '$', 'card', 'Card', 'Upgrade', 'Pro']) {
      expect(html, `the gate mentions billing: "${ask}"`).not.toContain(ask)
    }
  })

  it('shows progress rather than an error while a syllabus is parsing', () => {
    const html = render({ parsing: true })
    expect(html).toContain('Reading your syllabus')
  })

  it('offers the manual path when a syllabus fails to parse, rather than dead-ending', () => {
    const html = render({ parseError: 'I could not read that file.' })
    expect(html).toContain('I could not read that file.')
    expect(html).toContain('Enter the course name instead')
  })

  it('uses no em dashes in user-facing copy', () => {
    for (const props of [{}, { parsing: true }, { parseError: 'x' }]) {
      expect(render(props)).not.toContain('—')
    }
  })

  it('uses the V2 brand blue rather than a per-component palette', () => {
    // #3452D9 is T.blue in src/theme/tokens.js.
    expect(render()).toContain('#3452D9')
  })
})

describe('the gate is actually in the path', () => {
  const outputView = readFileSync(new URL('./OutputView.jsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

  it('OutputView returns the gate before rendering the shell when there are no courses', () => {
    const gateIdx = outputView.indexOf('if (courses.length === 0) {')
    expect(gateIdx, 'OutputView has no zero-course branch').toBeGreaterThan(-1)
    expect(outputView.slice(gateIdx, gateIdx + 400)).toContain('<CourseRequiredGate')

    // It must come before the main return, otherwise the shell renders first.
    const mainReturn = outputView.indexOf('\n  return (\n    <>', gateIdx)
    expect(mainReturn).toBeGreaterThan(gateIdx)
  })

  it('the condition is the course list, so returning accounts are gated too', () => {
    // Deliberately NOT a "new user" or "just onboarded" flag: roughly 400
    // existing accounts have zero courses and must hit the same gate.
    const gateIdx = outputView.indexOf('if (courses.length === 0) {')
    const branch = outputView.slice(gateIdx, gateIdx + 200)
    expect(branch).not.toContain('isNewUser')
    expect(branch).not.toContain('justOnboarded')
  })

  it('onboarding hands off to the app, which then gates', () => {
    expect(app).toContain('setShowOutput(true)')
  })
})
