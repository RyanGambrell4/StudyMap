import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'
import { grantFirstPlanBonus } from '../lib/server/firstPlanBonus.js'

/**
 * Grants the allowance that pays for the plan onboarding seeds.
 *
 * Its own endpoint rather than a branch inside generate-study-coach-plan,
 * because that file carries COACH_PLAN_AI_COST and belongs to the spend-control
 * work. Routing around that number without editing the file it lives in is the
 * entire point of doing it this way.
 *
 * There is nothing to authorise beyond being signed in. The grant is idempotent
 * and bounded by conditions the server checks for itself - free plan, never
 * generated, no bonus already - so the worst a caller can achieve by hammering
 * it, or by claiming a seed that is not happening, is the one plan it was going
 * to be given anyway.
 */

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized' })

  const result = await grantFirstPlanBonus(getAdminClient(), auth.userId)

  // 200 either way. The caller's decision is "may I seed?", which is `ok`, and a
  // non-2xx would make an ordinary "you already have one" look like breakage.
  return res.status(200).json(result)
}
