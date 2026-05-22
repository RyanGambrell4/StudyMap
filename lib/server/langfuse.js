// Langfuse LLM observability — no SDK, uses REST API
// Env vars: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST (optional)

const LANGFUSE_HOST = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com'

function getAuthHeader() {
  const pk = process.env.LANGFUSE_PUBLIC_KEY
  const sk = process.env.LANGFUSE_SECRET_KEY
  if (!pk || !sk) return null
  return 'Basic ' + Buffer.from(`${pk}:${sk}`).toString('base64')
}

// Fire-and-forget: never throw, never block the response
async function ingest(body) {
  const auth = getAuthHeader()
  if (!auth) return // gracefully skip if not configured

  try {
    await fetch(`${LANGFUSE_HOST}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    })
  } catch {
    // swallow — observability must never break the app
  }
}

/**
 * Wrap an Anthropic API call with Langfuse tracing.
 *
 * Usage:
 *   const result = await tracedCall({
 *     name: 'session-blueprint',
 *     userId,
 *     model: 'claude-haiku-4-5-20251001',
 *     input: { messages, system },
 *     maxTokens: 2000,
 *     call: async () => {
 *       const res = await fetch('https://api.anthropic.com/v1/messages', { ... })
 *       return res.json()
 *     }
 *   })
 *   // result is the raw Anthropic response JSON
 */
export async function tracedCall({ name, userId, model, input, maxTokens, call }) {
  const auth = getAuthHeader()
  const traceId = crypto.randomUUID()
  const generationId = crypto.randomUUID()
  const startTime = new Date().toISOString()
  const t0 = Date.now()

  // Create trace + generation in one batch
  if (auth) {
    ingest({
      batch: [
        {
          id: traceId,
          type: 'trace-create',
          timestamp: startTime,
          body: {
            id: traceId,
            name,
            userId,
            input,
            metadata: { model, maxTokens },
          },
        },
        {
          id: generationId,
          type: 'generation-create',
          timestamp: startTime,
          body: {
            id: generationId,
            traceId,
            name,
            model,
            startTime,
            input,
            modelParameters: { maxTokens },
          },
        },
      ],
    })
  }

  let result
  let error
  try {
    result = await call()
  } catch (err) {
    error = err
  }

  const endTime = new Date().toISOString()
  const latencyMs = Date.now() - t0

  // Update generation with output + usage
  if (auth) {
    const usage = result?.usage
    ingest({
      batch: [
        {
          id: generationId + '-end',
          type: 'generation-update',
          timestamp: endTime,
          body: {
            id: generationId,
            endTime,
            output: result?.content?.[0]?.text ?? null,
            level: error ? 'ERROR' : 'DEFAULT',
            statusMessage: error?.message ?? null,
            usage: usage
              ? {
                  input: usage.input_tokens,
                  output: usage.output_tokens,
                  total: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
                }
              : undefined,
            metadata: { latencyMs },
          },
        },
      ],
    })
  }

  if (error) throw error
  return result
}
