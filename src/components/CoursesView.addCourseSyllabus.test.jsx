// @vitest-environment jsdom
/**
 * Add course -> "Import syllabus" -> pick a PDF used to throw the whole entry away.
 *
 * The file input's onChange called onClose() and then started the parse with a
 * null course index. Three things went wrong at once: the modal vanished
 * mid-entry, every field already typed was discarded, and because the parse ran
 * unscoped there was no course to fall back on. When the parse then failed
 * (wrong file, no dates found, API error) the user was left with nothing at all
 * and no message explaining why. The dashboard drop zone was unaffected because
 * it uploads onto a course that already exists.
 *
 * The contract these pin: picking a file only stages it, and the course is
 * created BEFORE the syllabus import starts, scoped to that new course's index
 * so a failed parse can never cost the user the course.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/subscription', () => ({
  canAddCourse: () => true,
  getActivePlan: () => 'pro',
  getPlanLimits: () => ({ courses: Infinity }),
  hasUsedTrial: () => false,
}))
vi.mock('../lib/db', () => ({ saveExamContext: vi.fn(async () => {}) }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const CoursesView = (await import('./CoursesView')).default

/** React tracks input values internally, so set through the native setter. */
function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function buttonWithText(container, text) {
  return [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text)
}

function futureDate() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

let container, root, onAddCourse, onStartSyllabusOnboarding

async function openAddCourseModal() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  onAddCourse = vi.fn()
  onStartSyllabusOnboarding = vi.fn()

  await act(async () => {
    root.render(
      <CoursesView
        courses={[]}
        allSessions={[]}
        syllabusEventsByDate={{}}
        completedIds={new Set()}
        assignments={[]}
        onAddCourse={onAddCourse}
        onStartSyllabusOnboarding={onStartSyllabusOnboarding}
      />
    )
  })

  await act(async () => { buttonWithText(container, 'Add Course').click() })
}

/** Fill the basics, switch on Import syllabus, and choose a PDF. */
async function fillBasicsAndPickFile() {
  const name = container.querySelector('input[placeholder^="e.g. Introduction to Psychology"]')
  const date = container.querySelector('input[type="date"].cv-input')
  await act(async () => { type(name, 'Organic Chemistry') })
  await act(async () => { type(date, futureDate()) })

  const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Import syllabus'))
  await act(async () => { toggle.click() })

  const fileInput = container.querySelector('input[type="file"][accept=".pdf,.docx,.pptx"]')
  const file = new File(['syllabus'], 'chem-syllabus.pdf', { type: 'application/pdf' })
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  await act(async () => { fileInput.dispatchEvent(new window.Event('change', { bubbles: true })) })
  return file
}

// This jsdom build ships without localStorage. The syllabus section is behind a
// localStorage flag, so without a stub it never renders and the tests pass vacuously.
beforeEach(() => {
  document.body.innerHTML = ''
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
})

describe('Add course with syllabus import', () => {
  it('stays open and keeps what was typed when a file is chosen', async () => {
    await openAddCourseModal()
    await fillBasicsAndPickFile()

    // The modal is still mounted, and the name survived the file pick.
    expect(container.querySelector('.cv-modal')).not.toBeNull()
    const name = container.querySelector('input[placeholder^="e.g. Introduction to Psychology"]')
    expect(name.value).toBe('Organic Chemistry')

    // Nothing is parsed yet. This is the regression: it used to fire here,
    // after onClose() had already torn the modal down.
    expect(onStartSyllabusOnboarding).not.toHaveBeenCalled()
    expect(container.textContent).toContain('chem-syllabus.pdf')
  })

  it('creates the course first, then imports the syllabus onto it', async () => {
    await openAddCourseModal()
    const file = await fillBasicsAndPickFile()

    await act(async () => { buttonWithText(container, 'Add course').click() })

    // The course is created with what was typed, not with parsed placeholders.
    expect(onAddCourse).toHaveBeenCalledTimes(1)
    expect(onAddCourse.mock.calls[0][0]).toMatchObject({ name: 'Organic Chemistry' })

    // The import is scoped to the new course's index (0, the first course), so
    // a parse failure leaves the course intact instead of creating nothing, and
    // a success updates it instead of adding a duplicate. `null` here was the bug.
    expect(onStartSyllabusOnboarding).toHaveBeenCalledTimes(1)
    expect(onStartSyllabusOnboarding).toHaveBeenCalledWith(file, 0)
  })

  it('does not start an import when no syllabus was attached', async () => {
    await openAddCourseModal()
    const name = container.querySelector('input[placeholder^="e.g. Introduction to Psychology"]')
    const date = container.querySelector('input[type="date"].cv-input')
    await act(async () => { type(name, 'Linear Algebra') })
    await act(async () => { type(date, futureDate()) })
    await act(async () => { buttonWithText(container, 'Add course').click() })

    expect(onAddCourse).toHaveBeenCalledTimes(1)
    expect(onStartSyllabusOnboarding).not.toHaveBeenCalled()
  })
})
