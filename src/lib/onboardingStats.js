/**
 * onboardingStats - real numbers for the Act 1 social proof counter.
 *
 * The brief is unambiguous: the "N students studied with StudyEdge this week"
 * counter must be a real number pulled from the API, and if we cannot pull a
 * real number WE DO NOT SHOW ONE. There is no fallback constant in this file
 * on purpose. A fabricated counter is the exact kind of thing that erodes the
 * trust the rest of the flow is trying to build, and it is a review risk.
 *
 * `/api/community-stats` does not exist yet. Until it does, this resolves to
 * null and the counter simply does not render. Adding the endpoint is all that
 * is needed to light it up; no component changes required.
 */

const ENDPOINT = '/api/community-stats'
const CACHE_KEY = 'studyedge_community_stats_v1'
const TTL_MS = 6 * 60 * 60 * 1000

let inflight = null

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.value !== 'number') return null
    if (Date.now() - parsed.at > TTL_MS) return null
    return parsed.value
  } catch { return null }
}

function writeCache(value) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ value, at: Date.now() })) } catch { /* ignore */ }
}

/**
 * @returns {Promise<number|null>} weekly active students, or null when we have
 * no defensible number. Callers must treat null as "render nothing".
 */
export function fetchWeeklyActiveStudents() {
  const cached = readCache()
  if (cached !== null) return Promise.resolve(cached)
  if (inflight) return inflight

  inflight = fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const value = Number(data?.weeklyActiveStudents)
      if (!Number.isFinite(value) || value <= 0) return null
      writeCache(value)
      return value
    })
    .catch(() => null)
    .finally(() => { inflight = null })

  return inflight
}
