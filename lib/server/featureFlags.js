/**
 * Feature flag resolver. Checks per-user override first, falls back to the
 * global app_config row. Both default to false when absent.
 *
 * Global flags: Supabase → SQL Editor → UPDATE app_config SET feature_flags = '{"lifecycle_v2": true}'
 * Per-user:     UPDATE user_data SET feature_flags = '{"lifecycle_v2": true}' WHERE user_id = '...'
 */
import { supabaseAdmin } from './supabaseAdmin.js'
let _globalFlagsCache = null
let _globalFlagsFetchedAt = 0
const GLOBAL_FLAGS_TTL_MS = 60_000

async function getGlobalFlags() {
  const now = Date.now()
  if (_globalFlagsCache && now - _globalFlagsFetchedAt < GLOBAL_FLAGS_TTL_MS) {
    return _globalFlagsCache
  }
  try {
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('feature_flags')
      .eq('id', 1)
      .maybeSingle()
    _globalFlagsCache = data?.feature_flags ?? {}
    _globalFlagsFetchedAt = now
    return _globalFlagsCache
  } catch {
    return _globalFlagsCache ?? {}
  }
}

/**
 * Returns true if the named flag is on for this user.
 * userId is optional; omit it for non-user contexts (cron startup checks).
 */
export async function isEnabled(flagName, userId = null) {
  const global = await getGlobalFlags()

  if (userId) {
    try {
      const { data } = await supabaseAdmin
        .from('user_data')
        .select('feature_flags')
        .eq('user_id', userId)
        .maybeSingle()
      const userFlags = data?.feature_flags ?? {}
      if (flagName in userFlags) return !!userFlags[flagName]
    } catch { /* fall through to global */ }
  }

  return !!global[flagName]
}
