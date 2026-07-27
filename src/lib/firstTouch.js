/**
 * firstTouch.js - First-touch attribution capture and retrieval.
 *
 * Captures the original acquisition source (referrer, UTMs, landing path) on
 * the user's very first visit — before any same-domain navigation, email
 * confirmation round-trips, or OAuth redirects can overwrite it.
 *
 * The record is written to localStorage once and never overwritten. It survives
 * email confirmation links opening in different browsers ONLY if those browsers
 * already have the record (same device) or if UTMs are threaded through the
 * confirmation link URL (see AuthScreen.jsx emailRedirectTo).
 *
 * Storage key: se_first_touch_v1
 * Value shape: { referrer, referring_domain, utm_source, utm_medium,
 *               utm_campaign, utm_content, utm_term,
 *               landing_path, landing_url, timestamp }
 */

const FIRST_TOUCH_KEY = 'se_first_touch_v1'

/**
 * captureFirstTouch() — call on every page load (both marketing page and app).
 * No-ops silently if the record already exists or if there's no identifiable source.
 */
export function captureFirstTouch() {
  try {
    if (localStorage.getItem(FIRST_TOUCH_KEY)) return
    const sp = new URLSearchParams(window.location.search)
    const referrer = document.referrer || null
    let referring_domain = null
    if (referrer) {
      try { referring_domain = new URL(referrer).hostname } catch {}
    }
    const record = {
      referrer,
      referring_domain,
      utm_source:   sp.get('utm_source')   || null,
      utm_medium:   sp.get('utm_medium')   || null,
      utm_campaign: sp.get('utm_campaign') || null,
      utm_content:  sp.get('utm_content')  || null,
      utm_term:     sp.get('utm_term')     || null,
      landing_path: window.location.pathname,
      landing_url:  window.location.href,
      timestamp:    new Date().toISOString(),
    }
    // Only store if there's a real external signal. Skips direct /app navigations
    // with no UTMs so we don't pollute first-touch with internal bounces.
    const hasSignal = record.referring_domain || record.utm_source || record.utm_medium
    if (!hasSignal) return
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(record))
  } catch {}
}

/** Returns the stored first-touch record, or null if none. */
export function getFirstTouch() {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Returns a flat object of initial_source_* PostHog properties derived from
 * the stored first-touch record. Pass to identifyUser or track() directly.
 * Returns {} if no record exists.
 */
export function firstTouchPostHogProps() {
  const ft = getFirstTouch()
  if (!ft) return {}
  return {
    initial_source_referrer:          ft.referrer,
    initial_source_referring_domain:  ft.referring_domain,
    initial_source_utm_source:        ft.utm_source,
    initial_source_utm_medium:        ft.utm_medium,
    initial_source_utm_campaign:      ft.utm_campaign,
    initial_source_utm_content:       ft.utm_content,
    initial_source_utm_term:          ft.utm_term,
    initial_source_landing_path:      ft.landing_path,
    initial_source_timestamp:         ft.timestamp,
  }
}
