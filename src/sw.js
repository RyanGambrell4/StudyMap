import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// A new worker WAITS. It does not skipWaiting().
//
// This used to call skipWaiting() with the comment "take over immediately on
// update so users don't see stale UI", which is the opposite of what it did.
// The new worker activated at once, but the open page kept running the
// JavaScript already in memory and nothing ever reloaded it, so the tab served
// week-old code indefinitely. That is how three already-fixed bugs came to be
// reported in a single week.
//
// It was also a correctness hazard: the new worker began serving the NEW
// precache to a page still running OLD code, so any lazily imported chunk the
// old code requested by its old hashed filename 404'd.
//
// Waiting instead makes staleness observable. src/lib/appVersion.js notices the
// waiting worker (and independently polls version.json), the user is shown a
// banner, and only when they press Refresh do we get the message below.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// clients.claim() still matters for the FIRST install, so a page loaded before
// any worker existed comes under control without needing a reload.
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()))

// Precache all Vite-built assets
precacheAndRoute(self.__WB_MANIFEST)

// Navigate to app.html for all app routes
const handler = createHandlerBoundToURL('/app.html')
const navRoute = new NavigationRoute(handler, {
  denylist: [/^\/api\//, /^\/login/, /^\/signup/, /^\/$/, /^\/blog/, /^\/privacy/, /^\/terms/],
})
registerRoute(navRoute)

// Cache Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  })
)

// ── Push notification handler ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch {}
  const title = data.title ?? 'StudyEdge AI'
  const body = data.body ?? 'Time to study!'
  const tag = data.tag ?? 'studyedge'
  const url = data.url ?? '/app'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.png',
      badge: '/favicon-192x192.png',
      tag,
      renotify: true,
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/app'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/app') && 'focus' in c) return c.focus()
      }
      return clients.openWindow(url)
    })
  )
})
