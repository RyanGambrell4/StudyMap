// Logs the full prompt sent to the model, for named accounts only, so the
// account owner can see exactly what goes in (asked for 2026-10-28 while
// fixing topic contamination). Off for everyone else. Remove an id once its
// owner has what they need.

const DEBUG_PROMPT_USER_IDS = new Set([
  '8a3b139e-beb8-4a77-9960-bdff5c70202a', // Ryan, verifying build 21
])

const CHUNK = 3000 // Vercel truncates long log lines

export function debugPrompt(userId, endpoint, prompt) {
  if (!DEBUG_PROMPT_USER_IDS.has(userId)) return
  const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
  const parts = Math.max(1, Math.ceil(text.length / CHUNK))
  for (let i = 0; i < parts; i++) {
    console.log(`[prompt-debug] ${endpoint} part ${i + 1}/${parts} (${text.length} chars)\n${text.slice(i * CHUNK, (i + 1) * CHUNK)}`)
  }
}
