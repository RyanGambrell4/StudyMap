import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Environment guard ────────────────────────────────────────────────────────
// A local run that believes it is on staging while actually talking to
// production is the failure this prevents. scripts/use-env.mjs stamps
// VITE_SUPABASE_EXPECTED_REF from the same file it read the URL from, so if the
// two ever disagree the config has been edited by hand or half-swapped, and the
// app refuses to start rather than quietly writing to the wrong database.
//
// Production builds do not set VITE_SUPABASE_EXPECTED_REF, so this costs
// nothing there: no expectation, no check.
const expectedRef = import.meta.env.VITE_SUPABASE_EXPECTED_REF
if (expectedRef) {
  const actualRef = (supabaseUrl ?? '').match(/^https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ?? null
  if (actualRef !== expectedRef) {
    throw new Error(
      `[supabase] Environment mismatch. .env.local expects project "${expectedRef}" ` +
      `but VITE_SUPABASE_URL points at "${actualRef ?? 'nothing recognisable'}". ` +
      `Refusing to start. Re-run: node scripts/use-env.mjs ${import.meta.env.VITE_APP_ENV ?? 'staging'}`
    )
  }
}

if (!supabaseUrl || !supabaseKey) {
  // Without this the createClient call below throws "supabaseUrl is required",
  // which reads like a library bug rather than missing configuration.
  throw new Error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'For local development run: node scripts/use-env.mjs staging'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
