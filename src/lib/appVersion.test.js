// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Covers both halves of the stale-client fix.
 *
 * watchForUpdates is the DETECTOR: it decides whether the banner appears at all,
 * including every case where it must NOT, since a banner that cries wolf gets
 * ignored. Matching builds, an offline fetch, a 404 from a mid-flight deploy, a
 * malformed body, and dev where no build id is compiled in.
 *
 * applyUpdate is the APPLIER, exercised against a hand-rolled registration
 * because jsdom implements no ServiceWorker at all. It is tested because it
 * shipped broken once, in the specific case where the user presses Refresh
 * before the browser has fetched the new worker. See the note above that
 * describe block.
 *
 * The full path was also walked in a real browser against a real service worker
 * on localhost: deploy under an open tab, banner appears on focus, Refresh
 * reloads onto the new bundle hash.
 */

const RUNNING = 'abc123deploy'

/** Import fresh with a chosen compiled-in build id. */
async function load(buildId) {
  vi.resetModules()
  globalThis.__BUILD_ID__ = buildId
  return import('./appVersion.js')
}

let originalFetch

beforeEach(() => {
  originalFetch = globalThis.fetch
  vi.useFakeTimers()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
  delete globalThis.__BUILD_ID__
})

/** Resolve the microtasks the checker awaits, without advancing the poll timer. */
const settle = () => vi.advanceTimersByTimeAsync(0)

function mockVersionEndpoint(impl) {
  globalThis.fetch = vi.fn(impl)
}

describe('watchForUpdates', () => {
  it('fires when the deployed build differs from the running one', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: 'a-newer-build' }) }))
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stays silent when the deployed build is the running one', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: RUNNING }) }))
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).not.toHaveBeenCalled()
    stop()
  })

  it('notifies at most once, however many checks run', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: 'a-newer-build' }) }))
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()
    // Three more triggers: a focus, an online event, and a full poll interval.
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('treats an offline check as no signal, not as an update', async () => {
    mockVersionEndpoint(async () => { throw new TypeError('Failed to fetch') })
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).not.toHaveBeenCalled()
    stop()
  })

  it('ignores a non-200, which is what a mid-flight deploy can serve', async () => {
    mockVersionEndpoint(async () => ({ ok: false, json: async () => ({ buildId: 'nope' }) }))
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).not.toHaveBeenCalled()
    stop()
  })

  it('ignores a malformed body rather than prompting on garbage', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({}) }))
    const { watchForUpdates } = await load(RUNNING)

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).not.toHaveBeenCalled()
    stop()
  })

  it('does nothing in dev, where no build id is compiled in', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: 'whatever' }) }))
    const { watchForUpdates } = await load('')

    const onUpdate = vi.fn()
    const stop = watchForUpdates(onUpdate)
    await settle()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    stop()
  })

  it('busts caches on the way out, or it inherits the bug it detects', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: RUNNING }) }))
    const { watchForUpdates } = await load(RUNNING)

    const stop = watchForUpdates(vi.fn())
    await settle()

    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/^\/version\.json\?t=\d+/)
    expect(init).toMatchObject({ cache: 'no-store' })
    stop()
  })

  it('stops checking after cleanup', async () => {
    mockVersionEndpoint(async () => ({ ok: true, json: async () => ({ buildId: RUNNING }) }))
    const { watchForUpdates } = await load(RUNNING)

    const stop = watchForUpdates(vi.fn())
    await settle()
    const callsBefore = globalThis.fetch.mock.calls.length

    stop()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore)
  })
})

/**
 * Regression cover for a bug found in the browser, not by these tests.
 *
 * The first version of applyUpdate() only posted SKIP_WAITING when
 * `registration.waiting` already existed. It usually does not: the banner is
 * raised by the version.json poll, which learns about the deploy before the
 * browser has fetched the new worker. So Refresh fell straight through to
 * location.reload(), the still-active OLD worker served its OLD precache, and
 * the page came back on the same build. Verified against a real service worker
 * on localhost: the bundle hash was identical before and after the click, and
 * the banner was still there.
 */
describe('applyUpdate', () => {
  function mockServiceWorker({ waitingNow = false, installsAfterMs = null } = {}) {
    const waitingWorker = { postMessage: vi.fn() }
    const listeners = {}
    const installing = installsAfterMs === null ? null : { state: 'installing', _l: {},
      addEventListener(t, f) { (this._l[t] ||= []).push(f) },
      emit(t) { (this._l[t] || []).forEach((f) => f()) } }

    const reg = {
      waiting: waitingNow ? waitingWorker : null,
      installing: null,
      update: vi.fn(async () => {
        if (installsAfterMs === null) return
        reg.installing = installing
        listeners.updatefound?.forEach((f) => f())
        setTimeout(() => {
          installing.state = 'installed'
          reg.waiting = waitingWorker
          installing.emit('statechange')
        }, installsAfterMs)
      }),
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f) },
      removeEventListener: () => {},
    }

    const swListeners = {}
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => reg,
        controller: {},
        addEventListener: (t, f) => { (swListeners[t] ||= []).push(f) },
        removeEventListener: () => {},
        _fireControllerChange: () => (swListeners.controllerchange || []).forEach((f) => f()),
      },
    })
    return { reg, waitingWorker }
  }

  let reload
  beforeEach(() => {
    reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
  })

  it('hands over to a worker that is already waiting', async () => {
    const { waitingWorker } = mockServiceWorker({ waitingNow: true })
    const { applyUpdate } = await load(RUNNING)

    const done = applyUpdate()
    await vi.advanceTimersByTimeAsync(0)
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })

    navigator.serviceWorker._fireControllerChange()
    await done
    expect(reload).toHaveBeenCalled()
  })

  it('waits for a worker that has not installed yet, then hands over to it', async () => {
    // This is the case that shipped broken.
    const { reg, waitingWorker } = mockServiceWorker({ waitingNow: false, installsAfterMs: 500 })
    const { applyUpdate } = await load(RUNNING)

    const done = applyUpdate()
    await vi.advanceTimersByTimeAsync(600)

    expect(reg.update).toHaveBeenCalled()
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })

    navigator.serviceWorker._fireControllerChange()
    await done
    expect(reload).toHaveBeenCalled()
  })

  it('still reloads when no worker ever arrives, rather than hanging', async () => {
    mockServiceWorker({ waitingNow: false, installsAfterMs: null })
    const { applyUpdate } = await load(RUNNING)

    const done = applyUpdate()
    await vi.advanceTimersByTimeAsync(10000)
    await done

    expect(reload).toHaveBeenCalled()
  })

  it('reloads even if the handover stalls past the activation timeout', async () => {
    const { waitingWorker } = mockServiceWorker({ waitingNow: true })
    const { applyUpdate } = await load(RUNNING)

    const done = applyUpdate()
    await vi.advanceTimersByTimeAsync(0)
    expect(waitingWorker.postMessage).toHaveBeenCalled()

    // controllerchange never fires.
    await vi.advanceTimersByTimeAsync(4000)
    await done
    expect(reload).toHaveBeenCalled()
  })
})
