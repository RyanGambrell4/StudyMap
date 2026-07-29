// /api/semester-artifact?id=X -- single artifact payload for Layer 3 reopen.
// Returns the full payload so the client can re-render the artifact.

import { verifyAuth } from '../lib/server/usage.js'
import { createClient } from '@supabase/supabase-js'

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id query param required' })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('generated_artifacts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)  // owner check -- service role but we still verify userId
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Failed to load artifact' })
  if (!data) return res.status(404).json({ error: 'Artifact not found' })

  return res.status(200).json({ artifact: data })
}
