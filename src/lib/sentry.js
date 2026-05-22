// npm install @sentry/react
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

export function initSentry() {
  if (!DSN) return // gracefully skip if no key yet
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: 0.2,   // 20% of transactions
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  })
}

export function captureError(err, context = {}) {
  if (!DSN) return
  Sentry.captureException(err, { extra: context })
}

export function setUser(id, email) {
  if (!DSN) return
  Sentry.setUser({ id, email })
}

export function clearUser() {
  if (!DSN) return
  Sentry.setUser(null)
}
