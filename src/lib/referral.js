/**
 * referral.js - Client-side referral utilities
 *
 * Flow:
 *   1. User visits /signup?ref=REFERRER_USER_ID → captureReferralParam() stores it
 *   2. After signup/login → saveReferredBy() writes it to user_data.subscription
 *   3. On Stripe subscription activation → webhook applies $9.99 credit to both users
 */

const STORAGE_KEY = 'studyedge_referrer'

/** Call on app mount - saves ?ref= param from URL to localStorage */
export function captureReferralParam() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && /^[A-Za-z0-9-]{4,40}$/.test(ref)) { // a 6-char code, or a legacy user id
      localStorage.setItem(STORAGE_KEY, ref)
    }
  } catch { /* ignore */ }
}

/** Returns the stored referrer user_id, or null */
export function getStoredReferrer() {
  try { return localStorage.getItem(STORAGE_KEY) ?? null } catch { return null }
}

/** Clears the stored referrer after it's been saved to the DB */
export function clearStoredReferrer() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** Claims the stored code for the signed-in student (server records it). */
export async function claimStoredReferral(accessToken) {
  const code = getStoredReferrer()
  if (!code || !accessToken) return
  try {
    await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ code }),
    })
  } catch { /* best effort; the code stays stored for the next sign-in */ return }
  clearStoredReferrer()
}

/** Builds the shareable referral link for a given user (legacy id form). */
export function getReferralLink(userId) {
  const params = new URLSearchParams({
    ref: userId,
    utm_source: 'referral',
    utm_medium: 'user_share',
    utm_campaign: 'in_app_referral',
  })
  return `https://getstudyedge.com/signup?${params}`
}
