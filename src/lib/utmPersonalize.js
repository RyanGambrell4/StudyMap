/**
 * UTM-driven onboarding personalization.
 *
 * We already know a lot about a user from the moment they land — the Reddit
 * sub they came from, the paid-ad campaign that acquired them, sometimes even
 * the university-specific SEO page they clicked. Making them re-answer those
 * questions in onboarding is friction we don't need to charge.
 *
 * How it plugs in:
 *   1. On App.jsx mount, `captureUtmForOnboarding()` snapshots the current
 *      URL's UTM params into sessionStorage. This has to happen before
 *      Supabase's PKCE flow strips the query string.
 *   2. In Onboarding.jsx, `readUtmPrefill()` returns `{ schoolType, yearLevel }`
 *      (either or both may be null) and Onboarding uses those as initial
 *      state — the user can still change them, but the default is now right.
 *
 * Design intent: never *lock* a user into a prefill — always allow override.
 * Missing / unrecognized UTMs return `{}` and onboarding behaves exactly as
 * it did before.
 */

const SS_KEY = 'se_onb_utm_v1'

/**
 * Reddit subreddits (from the acquisition strategy) and paid-ad campaign
 * slugs → `{ schoolType, yearLevel }`. Kept as a plain lookup because it's
 * data, not logic — new subs get added by editing this table only.
 *
 * yearLevel values must match the exact strings in HS_YEARS / UNI_YEARS /
 * EXAM_TIMELINES in Onboarding.jsx — a mismatch would silently no-op the
 * prefill and we'd never notice.
 */
const CONTENT_MAP = {
  // High-intent exam prep
  mcat:                { schoolType: 'exam', yearLevel: '3-6 months' },
  premed:              { schoolType: 'exam', yearLevel: '6-12 months' },
  lsat:                { schoolType: 'exam', yearLevel: '3-6 months' },
  lawschooladmissions: { schoolType: 'exam', yearLevel: '3-6 months' },
  cpa:                 { schoolType: 'exam', yearLevel: '3-6 months' },
  bar:                 { schoolType: 'exam', yearLevel: '3-6 months' },
  gmat:                { schoolType: 'exam', yearLevel: '3-6 months' },
  gre:                 { schoolType: 'exam', yearLevel: '3-6 months' },
  // University
  college:             { schoolType: 'uni', yearLevel: '2nd Year' },
  premed_uni:          { schoolType: 'uni', yearLevel: '2nd Year' },
  nursingstudent:      { schoolType: 'uni', yearLevel: '2nd Year' },
  engineeringstudents: { schoolType: 'uni', yearLevel: '2nd Year' },
  gradschool:          { schoolType: 'uni', yearLevel: '4th Year+' },
  // High school
  apstudents:          { schoolType: 'hs',  yearLevel: 'Junior' },
  highschool:          { schoolType: 'hs',  yearLevel: 'Junior' },
}

// Generic pattern → schoolType when we don't have an exact utm_content match.
// Coarser but still better than nothing.
const KEYWORD_TO_SCHOOL = [
  { pattern: /(mcat|lsat|gre|gmat|cpa|bar|nclex|step\d)/i,   schoolType: 'exam' },
  { pattern: /(premed|pre-med|medschool|med-school)/i,        schoolType: 'exam' },
  { pattern: /(highschool|high[-_]school|ap[-_]?class)/i,     schoolType: 'hs'   },
  { pattern: /(college|university|uni|grad[-_]school)/i,       schoolType: 'uni'  },
]

function normalize(v) {
  if (!v || typeof v !== 'string') return null
  return v.trim().toLowerCase().replace(/[-\s]+/g, '_')
}

/**
 * Called from App.jsx on mount. Reads utm params from the current URL and
 * stashes them so they survive the Supabase PKCE redirect that clears the
 * query string.
 *
 * Safe to call more than once — if nothing UTM-y is on the URL, this is a
 * no-op and doesn't overwrite a prior stash.
 */
export function captureUtmForOnboarding() {
  if (typeof window === 'undefined') return
  try {
    const sp = new URLSearchParams(window.location.search)
    const payload = {
      utm_source:   sp.get('utm_source'),
      utm_medium:   sp.get('utm_medium'),
      utm_content:  sp.get('utm_content'),
      utm_campaign: sp.get('utm_campaign'),
      utm_term:     sp.get('utm_term'),
    }
    // Only stash if at least one UTM value is present — otherwise a plain
    // dashboard reload would blow away a valid earlier stash.
    if (Object.values(payload).some(Boolean)) {
      sessionStorage.setItem(SS_KEY, JSON.stringify(payload))
    }
  } catch {
    // sessionStorage can throw in private mode / iframes — the personalization
    // is a bonus, so silently swallow.
  }
}

/**
 * Called from Onboarding.jsx to get an initial `{ schoolType, yearLevel }`
 * prefill. Always returns an object; either field may be null.
 *
 * Resolution order:
 *   1. utm_content exact match in CONTENT_MAP
 *   2. utm_campaign exact match in CONTENT_MAP
 *   3. Keyword match across any UTM field → schoolType only
 */
export function readUtmPrefill() {
  if (typeof window === 'undefined') return {}
  let stash = null
  try {
    stash = JSON.parse(sessionStorage.getItem(SS_KEY) ?? 'null')
  } catch { /* ignore */ }
  if (!stash) return {}

  // 1. exact utm_content
  const content  = normalize(stash.utm_content)
  if (content && CONTENT_MAP[content]) return { ...CONTENT_MAP[content], source: `content:${content}` }

  // 2. exact utm_campaign
  const campaign = normalize(stash.utm_campaign)
  if (campaign && CONTENT_MAP[campaign]) return { ...CONTENT_MAP[campaign], source: `campaign:${campaign}` }

  // 3. keyword fallback across all UTM fields
  const bag = [stash.utm_content, stash.utm_campaign, stash.utm_term, stash.utm_source]
    .filter(Boolean).join(' ')
  for (const { pattern, schoolType } of KEYWORD_TO_SCHOOL) {
    if (pattern.test(bag)) {
      return { schoolType, yearLevel: null, source: `keyword:${pattern.source}` }
    }
  }

  return {}
}
