/**
 * Detect that the running build is no longer the deployed build.
 *
 * Why this exists: three bugs were reported in one week that had already been
 * fixed, because the reporter's browser was serving days-old code. A student on
 * a stale bundle sees retired prices and clicks buttons that no longer work.
 *
 * Why the service worker did not already handle it. `src/sw.js` called
 * `skipWaiting()` on install with the comment "take over immediately on update
 * so users don't see stale UI". That is the opposite of what it does. The new
 * worker does activate immediately, but the page that is already open keeps
 * executing the JavaScript it loaded into memory, and nothing reloads it. The
 * navigation route then serves app.html straight from the precache, so moving
 * around inside the SPA never fetches anything new either. The tab can run
 * week-old code forever.
 *
 * skipWaiting was also a correctness hazard, not just a UX one: the new worker
 * starts serving the NEW precache to a page still running OLD code, so any
 * lazily imported chunk the old code asks for by its old hashed filename is a
 * 404. Removing it fixes that too.
 *
 * The design here is deliberately two halves, because neither is sufficient:
 *
 *   version.json is the DETECTOR. It is the only authoritative answer to "what
 *   is actually deployed right now". Relying on the service worker's own update
 *   check is not enough, because the browser only looks for a new worker on a
 *   navigation or roughly every 24 hours, and a tab left open for days may never
 *   look at all. That is exactly the failure we are fixing.
 *
 *   The waiting worker is the APPLIER. Detecting staleness is useless on its own
 *   because a plain reload is still served the OLD precached bundle. The new
 *   worker has to be told to activate before the reload, or the refresh button
 *   appears to do nothing, which is worse than no button.
 *
 * We do not silently auto-update. Reloading underneath someone destroys whatever
 * they were in the middle of, and a focus session or a half-written brain dump is
 * exactly the thing a student would lose. So we detect, we say so, and they choose.
 */

/** Injected at build time by the build-id plugin in vite.config.js. */
const RUNNING_BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : ''

/** How often to ask the server what is deployed. */
const POLL_MS = 15 * 60 * 1000

/** Give the new worker this long to take over before reloading anyway. */
const ACTIVATION_TIMEOUT_MS = 3000

/**
 * Give a new worker this long to finish installing when the user presses
 * Refresh before the browser has fetched it. Generous on purpose: this is a
 * deliberate user action, and a reload that lands back on the old build is the
 * exact failure this whole file exists to remove.
 */
const INSTALL_TIMEOUT_MS = 8000

async function fetchDeployedBuildId() {
  try {
    // Cache-busted twice on purpose: no-store for the browser, and a query
    // param so no intermediate CDN can answer from its own copy.
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body?.buildId === 'string' && body.buildId ? body.buildId : null
  } catch {
    // Offline, or the deploy is mid-flight. Not an update signal.
    return null
  }
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

/**
 * Start watching. Calls `onUpdateAvailable()` at most once.
 * Returns a cleanup function.
 */
export function watchForUpdates(onUpdateAvailable) {
  // Without a build id there is nothing to compare against, which is the case
  // in `vite dev`. Staying silent beats a banner that can never be satisfied.
  if (!RUNNING_BUILD_ID) return () => {}

  let stopped = false
  let notified = false

  const notify = () => {
    if (stopped || notified) return
    notified = true
    onUpdateAvailable()
  }

  const check = async () => {
    if (stopped || notified) return

    const deployed = await fetchDeployedBuildId()
    if (deployed && deployed !== RUNNING_BUILD_ID) {
      notify()
      return
    }

    // Ask the browser to look for a new worker now rather than on its own
    // schedule, and treat one already parked in `waiting` as the same signal.
    const reg = await getRegistration()
    if (!reg) return
    if (reg.waiting) { notify(); return }
    try { await reg.update() } catch { /* transient, try again next tick */ }
    if (reg.waiting) notify()
  }

  const onVisible = () => { if (document.visibilityState === 'visible') check() }

  const interval = setInterval(check, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', check)
  window.addEventListener('focus', check)

  // A worker that finishes installing while the tab is open is an update too.
  getRegistration().then((reg) => {
    if (!reg || stopped) return
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        // `controller` is null on the very first install, which is not an update.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) notify()
      })
    })
  })

  check()

  return () => {
    stopped = true
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', check)
    window.removeEventListener('focus', check)
  }
}

/**
 * Wait for a worker to reach `waiting`, up to `timeoutMs`. Resolves null if
 * none arrives.
 *
 * This is load-bearing, and its absence was a real bug caught in the browser.
 * The banner is usually raised by the version.json check, which beats the
 * browser to the news: at the moment the user presses Refresh there is often no
 * waiting worker yet, only one part-way through installing. Reloading at that
 * point is served by the still-active OLD worker out of its OLD precache, so
 * the page comes back on exactly the build the user was trying to leave and the
 * button looks broken.
 */
function waitForWaitingWorker(reg, timeoutMs) {
  if (reg.waiting) return Promise.resolve(reg.waiting)

  return new Promise((resolve) => {
    let done = false
    const finish = (worker) => {
      if (done) return
      done = true
      clearTimeout(timer)
      reg.removeEventListener('updatefound', onUpdateFound)
      resolve(worker)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)

    const watch = (worker) => {
      if (!worker) return
      worker.addEventListener('statechange', () => {
        // `installed` is the state that puts it in `waiting`. `activated`
        // without us asking means it took over by itself and a plain reload is
        // already correct; `redundant` means the install failed.
        if (worker.state === 'installed') finish(reg.waiting ?? worker)
        else if (worker.state === 'activated' || worker.state === 'redundant') finish(null)
      })
    }

    const onUpdateFound = () => watch(reg.installing)
    reg.addEventListener('updatefound', onUpdateFound)
    // It may already have been installing before we started listening.
    watch(reg.installing)
  })
}

/**
 * Activate the new worker, then reload onto the new build.
 *
 * A bare `location.reload()` is not enough: the old worker is still in control
 * and serves the old precache straight back, so the button looks broken. We
 * always reload in the end, including on timeout, because a reload that lands
 * on the old build is still better than a button that does nothing.
 */
export async function applyUpdate() {
  const reg = await getRegistration()

  if (reg) {
    // Nudge the browser to fetch the new worker now rather than on its own
    // schedule, so there is something to hand over to.
    if (!reg.waiting) {
      try { await reg.update() } catch { /* offline; the reload below still runs */ }
    }

    const waiting = reg.waiting ?? (await waitForWaitingWorker(reg, INSTALL_TIMEOUT_MS))

    if (waiting) {
      await new Promise((resolve) => {
        let done = false
        const finish = () => { if (!done) { done = true; resolve() } }
        navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true })
        waiting.postMessage({ type: 'SKIP_WAITING' })
        setTimeout(finish, ACTIVATION_TIMEOUT_MS)
      })
    }
  }

  window.location.reload()
}
