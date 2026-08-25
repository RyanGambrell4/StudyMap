/**
 * The one place that knows which Supabase project is production.
 *
 * Every script that can WRITE must call assertNotProduction() before it does.
 * A staging run that can reach production data is worse than no staging at all,
 * so this identifies the project by its ref in the URL rather than trusting a
 * label, an env var name, or the name of the file the config came from.
 */

export const PRODUCTION_SUPABASE_REF = 'vpmgamaspefwqywttdtj'
export const STAGING_SUPABASE_REF    = 'bkxcroylxubcnwkpxvqk'

/** `https://abc.supabase.co` -> `abc`. Returns null for anything unparseable. */
export function refFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)
  return m ? m[1] : null
}

export function isProduction(url) {
  return refFromUrl(url) === PRODUCTION_SUPABASE_REF
}

/**
 * Hard stop. Call at the top of anything that writes.
 *
 * Deliberately fails CLOSED on an unrecognised URL: a ref we do not recognise
 * could be anything, and "I could not tell" is not a good enough reason to
 * start writing rows.
 */
export function assertNotProduction(url, context = 'this script') {
  const ref = refFromUrl(url)

  if (ref === PRODUCTION_SUPABASE_REF) {
    throw new Error(
      `${context} refuses to run against PRODUCTION (${ref}).\n` +
      `Point SUPABASE_URL at staging (${STAGING_SUPABASE_REF}) and try again.`
    )
  }

  if (ref === null) {
    throw new Error(
      `${context} could not identify the Supabase project from SUPABASE_URL.\n` +
      `Got: ${url ?? '(unset)'}\n` +
      `Refusing to write to a project it cannot name.`
    )
  }

  if (ref !== STAGING_SUPABASE_REF) {
    console.warn(
      `[envGuard] ${context} is targeting ${ref}, which is neither the known ` +
      `staging project nor production. Continuing, but check that this is intended.`
    )
  }

  return ref
}
