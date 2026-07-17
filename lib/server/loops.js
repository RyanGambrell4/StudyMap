// Loops.so email automation
// Env var: LOOPS_API_KEY
// Docs: https://loops.so/docs/api

const LOOPS_BASE = 'https://app.loops.so/api/v1'

function getHeaders() {
  const key = process.env.LOOPS_API_KEY
  if (!key) return null
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }
}

// Fire-and-forget wrapper — Loops must never crash the app
async function loopsPost(path, body) {
  const headers = getHeaders()
  if (!headers) return // Not configured yet — skip silently

  try {
    const res = await fetch(`${LOOPS_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[Loops] ${path} failed:`, text)
    }
  } catch (err) {
    console.error('[Loops] network error:', err.message)
  }
}

/**
 * Create or update a contact in Loops.
 * Called on signup / trial activation.
 */
export async function upsertContact({ email, userId, firstName, plan = 'free', trialActive = false }) {
  await loopsPost('/contacts/update', {
    email,
    userId,
    firstName: firstName ?? email.split('@')[0],
    plan,
    trialActive,
    userGroup: plan === 'free' ? 'free' : plan === 'pro' ? 'pro' : 'unlimited',
  })
}

/**
 * Trigger a Loops event — fires the matching automation.
 *
 * Events used:
 *  - "signup"              → welcome sequence
 *  - "trial_activated"     → 3-day trial drip (day 1, day 2, day 3 emails)
 *  - "trial_ending_soon"   → urgency email (called from Stripe webhook)
 *  - "trial_expired"       → expired + win-back
 *  - "upgraded_to_pro"     → pro onboarding sequence
 *  - "churned"             → win-back sequence
 */
export async function triggerEvent({ email, eventName, properties = {} }) {
  await loopsPost('/events/send', {
    email,
    eventName,
    eventProperties: properties,
  })
}

/**
 * Convenience: fire trial_activated event with plan details.
 */
export async function onTrialActivated({ email, userId }) {
  await upsertContact({ email, userId, plan: 'pro', trialActive: true })
  await triggerEvent({
    email,
    eventName: 'trial_activated',
    properties: {
      userId,
      trialStartDate: new Date().toISOString(),
      trialEndDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  })
}

/**
 * Convenience: trial ending in N days (call from Stripe webhook).
 */
export async function onTrialEndingSoon({ email, userId, daysLeft }) {
  await triggerEvent({
    email,
    eventName: 'trial_ending_soon',
    properties: { userId, daysLeft },
  })
}

/**
 * Convenience: user upgraded.
 */
export async function onUpgraded({ email, userId, plan, billingPeriod }) {
  await upsertContact({ email, userId, plan, trialActive: false })
  await triggerEvent({
    email,
    eventName: 'upgraded_to_pro',
    properties: { userId, plan, billingPeriod },
  })
}

/**
 * Convenience: user churned / canceled.
 */
export async function onChurned({ email, userId }) {
  await upsertContact({ email, userId, plan: 'free', trialActive: false })
  await triggerEvent({
    email,
    eventName: 'churned',
    properties: { userId },
  })
}
