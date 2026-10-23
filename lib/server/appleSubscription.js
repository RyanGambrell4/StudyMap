/**
 * App Store subscriptions, server side.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 * Every AI quota in the product is enforced from public.user_billing
 * (lib/server/usage.js), and until now only the Stripe webhook wrote that
 * table. A student who bought Pro inside the iOS app was therefore "free" to
 * every API route: the app unlocked its local gates, then the server refused
 * the sixth AI action of the month. The paywall promised "Today: full access"
 * and the backend did not know a purchase had happened.
 *
 * The iOS app now sends the StoreKit 2 signed transaction (a JWS) for its
 * current entitlement to /api/apple-subscription after a purchase, a restore,
 * and on every launch. This module verifies that JWS against Apple's root CA
 * and turns it into the same billing fields the Stripe webhook writes.
 *
 * ── trust ───────────────────────────────────────────────────────────────────
 * The JWS is signed by Apple with a certificate chain that ends at Apple Root
 * CA - G3 (lib/server/appleRootCA.js). The signature, the chain, the bundle id
 * and the environment are all checked by Apple's own library before a single
 * field is read. A client cannot mint one. Sandbox transactions are accepted
 * on purpose: App Review buys through the sandbox, and a reviewer whose
 * purchase the server ignores sees AI features refuse them.
 *
 * ── precedence ──────────────────────────────────────────────────────────────
 * A live Stripe subscription always wins. An Apple transaction can only set
 * the plan on an account with no active Stripe plan, and can only clear it
 * when the row was set by that same Apple subscription (matched on
 * originalTransactionId). This keeps a web customer who also installed the
 * app from being downgraded by an expired sandbox trial.
 */

import { SignedDataVerifier, Environment, VerificationException } from '@apple/app-store-server-library'
import { APPLE_ROOT_CERTIFICATES } from './appleRootCA.js'

/** The iOS app. Must match PRODUCT_BUNDLE_IDENTIFIER in the Xcode project. */
export const APPLE_BUNDLE_ID = 'getstudyedge.com.StudyEdge-AI'
/** App Store Connect app id for StudyEdge AI. */
export const APPLE_APP_ID = 6774198860

/**
 * Product id -> plan and billing period. Mirrors SubscriptionConfig.swift and
 * the subscription group in App Store Connect. The weekly products are
 * retired on the web (see trialPlan.js) but still exist in the group, so a
 * legacy sandbox purchase of one maps to a real plan instead of free.
 */
export const APPLE_PRODUCT_TO_PLAN = Object.freeze({
  'com.studyedgeai.pro.weekly':        { plan: 'pro',       billingPeriod: 'weekly'  },
  'com.studyedgeai.pro.monthly':       { plan: 'pro',       billingPeriod: 'monthly' },
  'com.studyedgeai.pro.yearly':        { plan: 'pro',       billingPeriod: 'yearly'  },
  'com.studyedgeai.unlimited.weekly':  { plan: 'unlimited', billingPeriod: 'weekly'  },
  'com.studyedgeai.unlimited.monthly': { plan: 'unlimited', billingPeriod: 'monthly' },
  'com.studyedgeai.unlimited.yearly':  { plan: 'unlimited', billingPeriod: 'yearly'  },
})

const AUTO_RENEWABLE = 'Auto-Renewable Subscription'
/** Apple's offerType for an introductory offer (the free trial). */
const OFFER_TYPE_INTRODUCTORY = 1

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
const PLAN_RANK = { free: 0, pro: 1, unlimited: 2 }

/**
 * How long past an Apple period end the plan is still honoured. A renewal
 * the app has not reported yet (phone off, app not opened) must not cut a
 * paying student off; a lapsed subscription nobody re-reports must not stay
 * paid forever. Two days covers the first without much of the second.
 */
export const APPLE_LAPSE_GRACE_MS = 2 * 24 * 3600 * 1000

/**
 * The plan the quota gate enforces for a billing row.
 *
 * Stripe rows are governed by status alone: the webhook keeps it current.
 * An Apple-owned row has no webhook. The app re-sends its transaction on
 * every launch, but a student who never opens the app again would otherwise
 * keep the plan indefinitely, so the period end is the backstop.
 *
 * @param {object} billing  record from readBilling()
 * @param {number} [now]    epoch ms
 */
export function resolveEnforcedPlan(billing, now = Date.now()) {
  if (!ACTIVE_STATUSES.has(billing?.status)) return 'free'
  if (billing.appleOriginalTransactionId && !billing.stripeSubId && billing.currentPeriodEnd) {
    const end = Date.parse(billing.currentPeriodEnd)
    if (Number.isFinite(end) && end + APPLE_LAPSE_GRACE_MS < now) return 'free'
  }
  return billing.plan ?? 'free'
}

/**
 * Verify a StoreKit 2 signed transaction and return its decoded payload.
 *
 * Production is tried first, then Sandbox. The library rejects a payload
 * whose `environment` claim does not match the verifier, so a sandbox JWS
 * fails the production verifier with INVALID_ENVIRONMENT and is then accepted
 * by the sandbox one. Any other failure (bad signature, wrong bundle, broken
 * chain) is reported as `{ ok: false }` with the library's status.
 *
 * @param {string} signedTransaction
 * @param {{ verifiers?: Array<{ verifyAndDecodeTransaction(jws: string): Promise<object> }> }} [deps]
 */
export async function verifySignedTransaction(signedTransaction, deps = {}) {
  const verifiers = deps.verifiers ?? defaultVerifiers()
  let lastError = null
  for (const verifier of verifiers) {
    try {
      const payload = await verifier.verifyAndDecodeTransaction(signedTransaction)
      return { ok: true, payload }
    } catch (err) {
      lastError = err
    }
  }
  const status = lastError instanceof VerificationException ? lastError.status : undefined
  return { ok: false, status, error: lastError?.message ?? 'Verification failed' }
}

let cachedVerifiers = null
function defaultVerifiers() {
  if (!cachedVerifiers) {
    // Online checks (OCSP) are off: the function has to answer in one round
    // trip and the chain is pinned to a root that does not expire until 2039.
    cachedVerifiers = [Environment.PRODUCTION, Environment.SANDBOX].map(env =>
      new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, false, env, APPLE_BUNDLE_ID, APPLE_APP_ID)
    )
  }
  return cachedVerifiers
}

/**
 * Turn a decoded transaction into billing fields.
 *
 * Returns `{ ok: false, reason }` for anything that is not one of our
 * auto-renewable subscriptions. For a known product, `active` says whether
 * the subscription is live right now; `status` is 'trialing' while the
 * introductory offer is running, 'active' after it, and 'expired' or
 * 'revoked' otherwise.
 *
 * @param {object} payload JWSTransactionDecodedPayload
 * @param {Date}   [now]
 */
export function deriveAppleBilling(payload, now = new Date()) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'no_payload' }
  if (payload.bundleId && payload.bundleId !== APPLE_BUNDLE_ID) {
    return { ok: false, reason: 'wrong_bundle' }
  }
  if (payload.type && payload.type !== AUTO_RENEWABLE) {
    return { ok: false, reason: 'not_subscription' }
  }
  const mapping = APPLE_PRODUCT_TO_PLAN[payload.productId]
  if (!mapping) return { ok: false, reason: 'unknown_product' }

  const nowMs = now.getTime()
  const expiresMs = Number(payload.expiresDate)
  const hasExpiry = Number.isFinite(expiresMs) && expiresMs > 0
  const revoked = payload.revocationDate != null
  const active = !revoked && hasExpiry && expiresMs > nowMs
  const isIntro = Number(payload.offerType) === OFFER_TYPE_INTRODUCTORY

  let status
  if (revoked) status = 'revoked'
  else if (!active) status = 'expired'
  else if (isIntro) status = 'trialing'
  else status = 'active'

  const purchaseMs = Number(payload.purchaseDate)
  const trialUsedAt = isIntro && Number.isFinite(purchaseMs) && purchaseMs > 0
    ? new Date(purchaseMs).toISOString()
    : undefined

  return {
    ok: true,
    active,
    plan: mapping.plan,
    billingPeriod: mapping.billingPeriod,
    status,
    currentPeriodEnd: hasExpiry ? new Date(expiresMs).toISOString() : null,
    trialUsedAt,
    productId: payload.productId,
    originalTransactionId: payload.originalTransactionId ? String(payload.originalTransactionId) : null,
    environment: payload.environment ?? null,
  }
}

/**
 * Decide what, if anything, to write to user_billing.
 *
 * @param {object} existing   billing record from readBilling()
 * @param {object} derived    result of deriveAppleBilling()
 * @returns {{ action: 'skip'|'write', reason?: string, fields?: object }}
 */
export function mergeAppleIntoBilling(existing, derived) {
  const stripeLive = !!existing?.stripeSubId
    && ACTIVE_STATUSES.has(existing?.status)
    && (PLAN_RANK[existing?.plan] ?? 0) > 0

  if (derived.active) {
    // Stripe owns the row while it is live, unless Apple grants a higher tier:
    // a Pro web subscriber who buys Unlimited in the app should get Unlimited.
    if (stripeLive && (PLAN_RANK[existing.plan] ?? 0) >= PLAN_RANK[derived.plan]) {
      return { action: 'skip', reason: 'stripe_active' }
    }
    return {
      action: 'write',
      fields: {
        plan: derived.plan,
        status: derived.status,
        billingPeriod: derived.billingPeriod,
        currentPeriodEnd: derived.currentPeriodEnd,
        appleOriginalTransactionId: derived.originalTransactionId,
        // Never un-set a trial that was already recorded.
        trialUsedAt: derived.trialUsedAt ?? existing?.trialUsedAt ?? undefined,
      },
    }
  }

  // Not active. Only clear a plan this same Apple subscription set.
  if (stripeLive) return { action: 'skip', reason: 'stripe_active' }
  const sameApple = existing?.appleOriginalTransactionId
    && derived.originalTransactionId
    && existing.appleOriginalTransactionId === derived.originalTransactionId
  if (!sameApple) return { action: 'skip', reason: 'not_owner' }
  if (existing.plan === 'free' && existing.status === derived.status) {
    return { action: 'skip', reason: 'already_free' }
  }
  return {
    action: 'write',
    fields: {
      plan: 'free',
      status: derived.status,
      billingPeriod: null,
      currentPeriodEnd: derived.currentPeriodEnd,
      appleOriginalTransactionId: derived.originalTransactionId,
      trialUsedAt: existing?.trialUsedAt ?? derived.trialUsedAt ?? undefined,
    },
  }
}
