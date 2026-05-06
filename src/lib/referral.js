/**
 * referral.js — Client-side referral utilities
 *
 * Flow:
 *   1. User visits /signup?ref=REFERRER_USER_ID → captureReferralParam() stores it
 *   2. After signup/login → saveReferredBy() writes it to user_data.subscription
 *   3. On Stripe subscription activation → webhook applies $12.99 credit to both users
 */

const STORAGE_KEY = 'studyedge_referrer'

/** Call on app mount — saves ?ref= param from URL to localStorage */
export function captureReferralParam() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && ref.length > 10) { // basic UUID length check
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

/** Builds the shareable referral link for a given user */
export function getReferralLink(userId) {
  return `https://getstudyedge.com/signup?ref=${userId}`
}
