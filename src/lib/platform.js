/**
 * platform.js — build-target facts the UI is allowed to branch on.
 *
 * IS_ANDROID_BUILD is set at build time by `npm run build:android`, which sets
 * VITE_ANDROID_BUILD=1 before vite runs. It is deliberately NOT a runtime
 * user-agent sniff: the same `dist/` is served to web browsers, and a runtime
 * check would let an Android user-agent string on the web site silently
 * disable purchasing for a paying customer.
 *
 * Why this flag exists at all: Google Play's Payments policy requires Play
 * Billing for in-app digital subscriptions, and it prohibits linking users out
 * to an external purchase flow. Both halves matter. Processing a payment through
 * Stripe is a violation, and so is a button that merely navigates to web
 * checkout. The Android build therefore ships free tier only, with no purchase
 * surface and no route to one.
 *
 * This is a deliberate, temporary trade. The strategic value of the Play listing
 * is displacing a competitor's app from the brand SERP, which is realised by
 * existing on Play rather than by monetising there. Revenue continues on web and
 * (once shipped) on iOS via StoreKit. When Play Billing lands, delete this flag
 * and the branches that read it.
 */

export const IS_ANDROID_BUILD = import.meta.env?.VITE_ANDROID_BUILD === '1'

/**
 * True when this build is allowed to sell anything.
 * Read this rather than IS_ANDROID_BUILD at call sites, so that adding a second
 * restricted target later is a one-line change here.
 */
export const CAN_PURCHASE_IN_APP = !IS_ANDROID_BUILD
