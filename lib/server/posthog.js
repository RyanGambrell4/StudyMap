/**
 * Server-side PostHog capture.
 *
 * Single source of truth for every server-fired analytics event. Replaces the
 * two divergent copies that used to live in api/stripe.js and
 * api/resend-webhook.js.
 *
 * Why this file exists:
 *   Server-side analytics landed 5 events between 2026-07-27 and 2026-08-20.
 *   The old implementations awaited fetch() but never inspected the response,
 *   so a rejected key produced no log line, no throw, and no event. From the
 *   outside that is indistinguishable from "nobody signed up".
 *
 * Two failure modes this guards against, both verified against the live
 * PostHog ingest endpoint on 2026-08-20:
 *
 *   1. Wrong key TYPE. A personal API key (phx_...) is rejected outright:
 *        401 {"type":"authentication_error","code":"invalid_personal_api_key",
 *             "detail":"API key is not valid: personal_api_key"}
 *      Project write keys (phc_...) are the correct credential here.
 *
 *   2. Wrong key VALUE. PostHog returns 200 for ANY phc_-shaped key, valid or
 *      not, because ingest validates asynchronously behind the queue. res.ok
 *      therefore CANNOT prove an event landed. It only proves the request was
 *      accepted for processing. Confirming delivery requires reading the event
 *      back out via the query API, which is a deploy-time check, not a runtime
 *      one. assertPosthogKeyShape() below is the runtime half of that story.
 *
 * Environment:
 *   POSTHOG_API_KEY  — project write key, phc_... (plain runtime env var).
 *                      NOT VITE_POSTHOG_KEY: that is a build-time Vite
 *                      replacement and is undefined in a Vercel function.
 *                      NOT POSTHOG_PERSONAL_API_KEY: that is a phx_ read key
 *                      for the query API and is rejected by ingest.
 *   POSTHOG_HOST     — optional, defaults to https://us.i.posthog.com
 */

const DEFAULT_HOST = 'https://us.i.posthog.com'

/**
 * True when we are anywhere other than production. Preview and local
 * deployments should fail loudly on a broken analytics pipeline so the
 * breakage is caught at deploy time instead of discovered in a funnel audit
 * three weeks later.
 */
function isStrictEnv() {
  if (process.env.POSTHOG_STRICT === '1') return true
  if (process.env.POSTHOG_STRICT === '0') return false
  const env = process.env.VERCEL_ENV
  // No VERCEL_ENV at all means local dev or a test runner — not strict.
  if (!env) return false
  return env !== 'production'
}

/**
 * Classify the configured key without ever logging the key itself.
 * Returns one of: 'missing' | 'project' | 'personal' | 'unknown'.
 */
export function posthogKeyKind(key = process.env.POSTHOG_API_KEY) {
  if (!key) return 'missing'
  if (key.startsWith('phc_')) return 'project'
  if (key.startsWith('phx_')) return 'personal'
  return 'unknown'
}

/**
 * Synchronous configuration check. This is the diagnostic that answers
 * "is the server analytics key the right TYPE" without waiting for, or
 * depending on, a response from PostHog.
 *
 * Logs loudly on anything other than a project key. Throws in strict envs.
 */
export function assertPosthogKeyShape() {
  const kind = posthogKeyKind()
  if (kind === 'project') return { ok: true, kind }

  const detail = {
    missing:  'POSTHOG_API_KEY is not set. Every server-side event is being dropped before it is sent.',
    personal: 'POSTHOG_API_KEY holds a personal API key (phx_...). PostHog ingest rejects these with 401 invalid_personal_api_key. It needs the project write key (phc_...), the same value as VITE_POSTHOG_KEY.',
    unknown:  'POSTHOG_API_KEY has an unrecognised prefix. Ingest expects a project write key (phc_...).',
  }[kind]

  console.error(`[posthog] MISCONFIGURED (${kind}): ${detail}`)
  if (isStrictEnv()) {
    throw new Error(`[posthog] refusing to run with a ${kind} key outside production: ${detail}`)
  }
  return { ok: false, kind, detail }
}

/**
 * Fire a server-side event.
 *
 * Returns { ok, status, kind, skipped } so callers can assert on it in tests.
 * Never returns a rejected promise in production — analytics must not take a
 * webhook down. In strict (non-production) envs it throws, so a broken
 * pipeline fails the deploy check instead of going quiet.
 */
export async function posthogCapture(event, distinctId, properties = {}) {
  const key = process.env.POSTHOG_API_KEY
  const kind = posthogKeyKind(key)

  if (kind !== 'project') {
    const { detail } = assertPosthogKeyShape() // logs, and throws in strict envs
    return { ok: false, skipped: true, kind, reason: detail }
  }

  if (!distinctId) {
    const reason = `posthogCapture('${event}') called without a distinctId, so the event was dropped`
    console.error(`[posthog] ${reason}`)
    if (isStrictEnv()) throw new Error(`[posthog] ${reason}`)
    return { ok: false, skipped: true, kind, reason }
  }

  const host = process.env.POSTHOG_HOST || DEFAULT_HOST

  let res
  try {
    res = await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'server' },
        timestamp: new Date().toISOString(),
      }),
    })
  } catch (err) {
    const reason = `network error sending '${event}': ${err.message}`
    console.error(`[posthog] ${reason}`)
    if (isStrictEnv()) throw new Error(`[posthog] ${reason}`)
    return { ok: false, status: null, kind, reason }
  }

  if (!res.ok) {
    // Read the body — PostHog puts the actual cause in there, and without it
    // a 401 is indistinguishable from a 500.
    let body = ''
    try { body = (await res.text()).slice(0, 500) } catch { /* body is best-effort */ }
    const reason = `capture of '${event}' rejected with HTTP ${res.status}: ${body}`
    console.error(`[posthog] ${reason}`)
    if (isStrictEnv()) throw new Error(`[posthog] ${reason}`)
    return { ok: false, status: res.status, kind, reason, body }
  }

  return { ok: true, status: res.status, kind }
}
