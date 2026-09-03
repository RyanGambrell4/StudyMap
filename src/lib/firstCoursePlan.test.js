import { describe, it, expect, vi } from 'vitest'
import { armFirstPlan } from './firstCoursePlan'

/**
 * These assert ORDERING, not wiring.
 *
 * The previous test for this checked that handleAddCourse returned the savePlan
 * promise and that the call site read `const saved = savePlan(`. Both were true
 * while the bug was live, because returning a promise is not awaiting one. That
 * test passed against racy code, which is worse than having no test: it was
 * cited as evidence the ordering was handled.
 *
 * The only thing worth asserting is that the generation is not armed until the
 * course write has resolved. Deleting the `await` in armFirstPlan must turn
 * these red.
 */

// A promise we control, so "has the write landed" is a decision this test makes
// rather than a timing accident.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('armFirstPlan ordering', () => {
  it('does not arm the generation while the course write is still in flight', async () => {
    const write = deferred()
    const arm = vi.fn()

    armFirstPlan({ persisted: write.promise, courseId: 'c1', arm })

    // Give the microtask queue every chance to run. If arm() is reachable
    // without the write resolving, it has run by now.
    await flush()
    expect(arm).not.toHaveBeenCalled()

    write.resolve()
    await flush()
    expect(arm).toHaveBeenCalledWith('c1')
  })

  it('arms exactly once, after the write, with the right course', async () => {
    const write = deferred()
    const arm = vi.fn()
    const done = armFirstPlan({ persisted: write.promise, courseId: 'course-abc', arm })

    write.resolve({ ok: true })
    await done

    expect(arm).toHaveBeenCalledTimes(1)
    expect(arm).toHaveBeenCalledWith('course-abc')
  })

  it('records the ordering as observed, not as intended', async () => {
    // A stricter form of the first test: capture the real sequence of events
    // and assert on it, so a future refactor that arms early fails here even if
    // it happens to arm inside a .then() somewhere else.
    const order = []
    const write = deferred()
    const persisted = write.promise.then(() => { order.push('write-landed') })

    await Promise.all([
      armFirstPlan({ persisted, courseId: 'c1', arm: () => order.push('armed') }),
      (async () => { await flush(); write.resolve() })(),
    ])

    expect(order).toEqual(['write-landed', 'armed'])
  })

  it('propagates a failed write instead of arming on top of it', async () => {
    // If the course never persisted, arming would guarantee a
    // course_context_failed on the server. Better to reject and let the caller
    // fall through to the dashboard, which is where it lands today anyway.
    const arm = vi.fn()
    await expect(
      armFirstPlan({ persisted: Promise.reject(new Error('upsert failed')), courseId: 'c1', arm })
    ).rejects.toThrow('upsert failed')
    expect(arm).not.toHaveBeenCalled()
  })
})
