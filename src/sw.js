import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

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
