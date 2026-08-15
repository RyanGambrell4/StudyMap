// @vitest-environment jsdom
/**
 * "Set up my course" looked like a dead button.
 *
 * Confirming is slow: the caller saves the course, uploads the syllabus, and
 * then asks the model for a full study plan (an 8k-token call with a possible
 * second repair pass). That is easily tens of seconds. The button had no
 * pending state, so for that entire window nothing on screen changed. Worse,
 * the caller is an async function whose rejection nobody awaited, so any throw
 * inside it became an unhandled rejection and the modal just sat there forever.
 *
 * The contract these pin: clicking tells the user something is happening,
 * refuses to fire twice, and surfaces a failure instead of swallowing it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const SyllabusOnboardingModal = (await import('./SyllabusOnboardingModal')).default

const PARSED = {
  course: { name: 'Intro to Psychology', code: 'PSY 101' },
  exams: [],
  dueDates: [],
  topics: [{ title: 'Memory' }, { title: 'Social psychology' }],
  gradingBreakdown: [{ category: 'Final Exam', percentage: 30 }],
  classMeetings: [],
}

const EXISTING_COURSE = { id: 'c1', name: 'Intro to Psychology', examDate: '2099-01-01' }

function footerButton(container, text) {
  return [...container.querySelectorAll('button')].find(b => b.textContent.includes(text))
}

let container, root

async function mount(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <SyllabusOnboardingModal
        parsedData={PARSED}
        existingCourse={EXISTING_COURSE}
        onConfirm={vi.fn()}
        onSkipPlan={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    )
  })
}

beforeEach(() => { document.body.innerHTML = '' })

describe('Set up my course', () => {
  it('shows a pending state while the slow commit runs', async () => {
    // A commit that never settles, standing in for the study-plan generation.
    const onConfirm = vi.fn(() => new Promise(() => {}))
    await mount({ onConfirm })

    const btn = footerButton(container, 'Set up my course')
    expect(btn.disabled).toBe(false)

    await act(async () => { btn.click() })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    // The regression: this used to still read "Set up my course", enabled,
    // with nothing else on screen changing for the whole call.
    const pending = footerButton(container, 'Building your study plan')
    expect(pending).toBeTruthy()
    expect(pending.disabled).toBe(true)
    expect(container.textContent).toContain('Your course is already saved')
  })

  it('does not fire a second commit while one is in flight', async () => {
    const onConfirm = vi.fn(() => new Promise(() => {}))
    await mount({ onConfirm })

    const btn = footerButton(container, 'Set up my course')
    await act(async () => { btn.click() })
    await act(async () => { footerButton(container, 'Building your study plan').click() })

    // Two plan generations would double-charge the user's AI quota.
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failure instead of dying silently, and lets you retry', async () => {
    const onConfirm = vi.fn(async () => { throw new Error('Network is down') })
    await mount({ onConfirm })

    await act(async () => { footerButton(container, 'Set up my course').click() })

    expect(container.textContent).toContain('Network is down')
    // Back to a usable button rather than a stuck spinner.
    const btn = footerButton(container, 'Set up my course')
    expect(btn.disabled).toBe(false)
  })

  it('does not leave the button stuck when the caller returns without unmounting', async () => {
    // e.g. the caller hits the AI paywall and returns early.
    const onConfirm = vi.fn(async () => {})
    await mount({ onConfirm })

    await act(async () => { footerButton(container, 'Set up my course').click() })

    const btn = footerButton(container, 'Set up my course')
    expect(btn.disabled).toBe(false)
  })

  it('"Skip the plan for now" gets the same protection', async () => {
    const onSkipPlan = vi.fn(() => new Promise(() => {}))
    await mount({ onSkipPlan })

    await act(async () => { footerButton(container, 'Skip the plan for now').click() })

    expect(footerButton(container, 'Saving your course')).toBeTruthy()
    expect(footerButton(container, 'Set up my course').disabled).toBe(true)
  })
})
