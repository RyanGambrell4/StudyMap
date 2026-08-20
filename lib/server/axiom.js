// Axiom structured logging — no SDK, uses REST API
// Env vars: AXIOM_TOKEN, AXIOM_DATASET

const AXIOM_URL = 'https://api.axiom.co'

function getHeaders() {
  const token = process.env.AXIOM_TOKEN
  if (!token) return null
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }
}

/**
 * Ingest a structured log event to Axiom.
 * Fire-and-forget — never blocks or throws.
 *
 * @param {string} event - event name (e.g. 'ai.request', 'ai.error', 'user.signup')
 * @param {object} data - structured data to log
 */
export async function log(event, data = {}) {
  const headers = getHeaders()
  if (!headers) return // Not configured — skip silently

  const dataset = process.env.AXIOM_DATASET || 'studyedge'

  try {
    const res = await fetch(`${AXIOM_URL}/v1/datasets/${dataset}/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{
        _time: new Date().toISOString(),
        event,
        ...data,
      }]),
    })
    // Same defect class as the old posthogCapture: awaiting the fetch without
    // reading the response turns a rejected token into silence. A logger must
    // never throw, so this reports to the console and moves on.
    if (!res.ok) {
      let body = ''
      try { body = (await res.text()).slice(0, 300) } catch { /* best effort */ }
      console.error(`[axiom] ingest of '${event}' rejected with HTTP ${res.status}: ${body}`)
    }
  } catch (err) {
    // Logging must never break the app
    console.error(`[axiom] ingest of '${event}' failed: ${err?.message ?? err}`)
  }
}

/**
 * Log an AI API call with timing and token usage.
 */
export async function logAiCall({ endpoint, userId, plan, model, tokens, latencyMs, error }) {
  await log('ai.request', {
    endpoint,
    userId,
    plan,
    model: model ?? 'claude-haiku-4-5-20251001',
    inputTokens: tokens?.input ?? null,
    outputTokens: tokens?.output ?? null,
    totalTokens: tokens?.total ?? null,
    latencyMs,
    error: error ?? null,
    success: !error,
  })
}

/**
 * Log a user action (subscription, trial, etc.)
 */
export async function logUserEvent({ event, userId, plan, metadata = {} }) {
  await log(`user.${event}`, { userId, plan, ...metadata })
}
