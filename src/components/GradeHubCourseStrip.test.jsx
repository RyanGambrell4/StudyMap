/**
 * The Grade Hub course switcher was clipped on desktop.
 *
 * Its only overflow rules lived inside the `@media(max-width:760px)` block, so
 * on desktop the row fell back to the flex default of nowrap, ran past the
 * 1080px content column, and was cut off by the page's overflow-x:hidden. With
 * eight courses the last chip was sliced in half and could not be reached, and
 * because the mobile rule also hides the scrollbar there was no affordance
 * telling anyone the row scrolled.
 *
 * The fix is layout, not markup: every chip was always in the DOM, so these
 * pin the CSS contract that keeps them on screen.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

vi.mock('../lib/supabase', () => ({ supabase: {}, getAccessToken: async () => 'token' }))
vi.mock('../lib/db', () => ({ saveCoachPlanStruggles: async () => {}, getCachedCoachPlan: () => null }))
vi.mock('../lib/subscription', () => ({ getActivePlan: () => 'pro', hasUsedTrial: () => false }))
vi.mock('../lib/analytics', () => ({ track: () => {} }))

const { default: GradeHubView } = await import('./GradeHubView')

beforeAll(() => {
  globalThis.window = globalThis.window ?? {}
  globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
})

const DOTS = ['#1a9e5c', '#D97706', '#8B5CF6', '#3452D9', '#0891B2', '#E11D48', '#F59E0B', '#10B981']

/** The eight courses from the bug report, long names included. */
const COURSES = [
  'Cell Biology', 'Organic Chemistry', 'Cognitive Psychology', 'Linear Algebra',
  'Data Structures & Algorithms', 'Modern World History',
  'Introduction to Macroeconomics', 'Comparative Political Systems',
].map((name, i) => ({
  id: `c${i}`,
  name,
  color: { dot: DOTS[i] },
  examDate: null,
  gradeData: {
    targetGrade: 93,
    components: [
      { component: 'Midterm', weight: 40, grade: 95, graded: true },
      { component: 'Final', weight: 60, grade: null, graded: false },
    ],
  },
}))

const render = (courses) => renderToStaticMarkup(
  <GradeHubView courses={courses} onEditCourse={() => {}} onShowPaywall={() => {}} />
)

const SOURCE = readFileSync(new URL('./GradeHubView.jsx', import.meta.url), 'utf8')

describe('Grade Hub course switcher', () => {
  it('every course renders, including the two that were cut off', () => {
    const html = render(COURSES)
    expect(html).toContain('Modern World History')
    expect(html).toContain('Comparative Political Systems')
    expect(html).toContain('Data Structures &amp; Algorithms')
    const escape = (t) => t.replace(/&/g, '&amp;')
    for (const c of COURSES) expect(html, `missing ${c.name}`).toContain(escape(c.name))
  })

  it('the strip wraps on desktop instead of running off the column', () => {
    const html = render(COURSES)
    const strip = html.match(/<div class="gh-course-strip" style="([^"]*)"/)
    expect(strip, 'course strip not found').toBeTruthy()
    expect(strip[1]).toContain('flex-wrap:wrap')
  })

  it('no chip can overflow on its own, however long the course name is', () => {
    const long = [{
      ...COURSES[0],
      name: 'Advanced Interdisciplinary Studies in Comparative Historical Political Economy',
    }]
    const html = render(long)
    expect(html).toContain('text-overflow:ellipsis')
    expect(html).toContain('overflow:hidden')
  })

  it('mobile keeps its single line scroll, and still overrides the desktop wrap', () => {
    // An inline style loses to an !important declaration, which is what lets
    // the mobile rule keep the row on one scrollable line.
    expect(SOURCE).toContain('.gh-course-strip{flex-wrap:nowrap!important;overflow-x:auto!important;')
  })

  it('renders with one course and with none', () => {
    expect(() => render([COURSES[0]])).not.toThrow()
    expect(() => render([])).not.toThrow()
  })
})
