/**
 * The server-side Supabase client, wrapped so that `error` cannot be ignored.
 *
 * ── The problem this replaces ───────────────────────────────────────────────
 * supabase-js never throws. Every query resolves to `{ data, error }`, so
 *
 *   const { data } = await supabase.from('user_data').select('courses')
 *
 * makes four different outcomes look identical: rows matched, no rows matched,
 * the column does not exist, the table does not exist. `data` is null for the
 * last three and nobody notices. There are 54 sites in this codebase written
 * that way, and four features have died in production because of it, one of
 * them taking 17 of 27 cron jobs with it for two months.
 *
 * Reviewing 54 call sites does not fix a class. Making the default safe does.
 *
 * ── How this works ─────────────────────────────────────────────────────────
 * `db` proxies a normal Supabase client. Every query you await THROWS on error
 * instead of handing you a null. On success it returns the plain rows, not
 * `{ data, error }`, so there is nothing to destructure wrongly:
 *
 *   const rows = await db.from('user_data').select('user_id, plan')
 *   const row  = await db.from('user_data').select('plan').eq('user_id', id).maybeSingle()
 *
 * The thrown error carries `.code`, `.table` and `.isSchemaError`, so a caller
 * that wants to distinguish a missing table from a timeout still can.
 *
 * ── The opt out, and why it is shaped like this ────────────────────────────
 * Some reads genuinely should not take a request down. A throttle timestamp
 * that cannot be read is a frequency question, not a safety one.
 *
 *   const rows = await db.from('user_data').select('last_emailed_at').tolerate([])
 *
 * `.tolerate(fallback)` returns the fallback on error AND logs loudly, with the
 * table, code and message. It is deliberately a verb you have to type: the old
 * failure mode was silence by default and effort to be safe, and this inverts
 * that. A reviewer seeing `.tolerate(...)` can ask why. A reviewer seeing
 * `const { data }` never had anything to notice.
 *
 * ── Migration ──────────────────────────────────────────────────────────────
 * This does not rewrite the 54 sites. It is what NEW code uses, and what a site
 * gets converted to when someone is already in the file. lib/server/usage.js and
 * the crons keep working untouched. `rawClient()` is there for the few places
 * that need the real client (auth.admin, storage, realtime).
 */

import { createClient } from '@supabase/supabase-js'

let _client = null

/** The unwrapped supabase-js client. Use for auth.admin, storage, realtime. */
export function rawClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) {
      throw new Error('[db] SUPABASE_URL and SUPABASE_SERVICE_KEY must both be set')
    }
    _client = createClient(url, key)
  }
  return _client
}

const SCHEMA_CODES = new Set([
  '42P01',   // undefined_table
  '42703',   // undefined_column
  '42883',   // undefined_function
  'PGRST202', // function not found in schema cache
  'PGRST204', // column not found in schema cache
  'PGRST205', // table not found in schema cache
])

export function isSchemaError(error) {
  if (!error) return false
  if (SCHEMA_CODES.has(error.code)) return true
  return /does not exist|schema cache/i.test(error.message ?? '')
}

export class SupabaseQueryError extends Error {
  constructor(error, table, context) {
    const schema = isSchemaError(error)
    super(
      `[db] ${context ?? table} failed: ${error?.message ?? error}` +
      ` (code=${error?.code ?? 'none'})` +
      (schema ? ' SCHEMA MISSING: the code queries something this database does not have.' : '')
    )
    this.name = 'SupabaseQueryError'
    this.code = error?.code ?? null
    this.details = error?.details ?? null
    this.hint = error?.hint ?? null
    this.table = table
    this.isSchemaError = schema
    this.cause = error
  }
}

/**
 * Wrap a PostgREST builder so awaiting it throws on error and yields rows on
 * success. The builder is thenable, so we intercept `then` and leave every
 * other method (`.select`, `.eq`, `.maybeSingle`, ...) proxied through,
 * re-wrapping whatever they return so the chain keeps its behaviour.
 */
function wrapBuilder(builder, table) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      // The query, as a real promise that rejects on error.
      const run = () => Promise.resolve(target).then(({ data, error }) => {
        if (error) throw new SupabaseQueryError(error, table, `${table} query`)
        return data
      })

      // then/catch/finally all delegate to it, so the wrapped builder behaves
      // like a Promise rather than merely being awaitable. Without catch and
      // finally, `db.from(t).select(c).catch(...)` is a TypeError, which would
      // be a nasty surprise in exactly the error paths this exists to serve.
      if (prop === 'then')    return (ok, err) => run().then(ok, err)
      if (prop === 'catch')   return (err) => run().catch(err)
      if (prop === 'finally') return (fn) => run().finally(fn)

      if (prop === 'tolerate') {
        /**
         * Run the query; on error log loudly and return `fallback`.
         * Use only where a failed read genuinely must not fail the request,
         * and say why at the call site.
         */
        return (fallback = null) =>
          Promise.resolve(target).then(({ data, error }) => {
            if (error) {
              const schema = isSchemaError(error)
              console.error(
                `[db] TOLERATED FAILURE on ${table}${schema ? ' (SCHEMA MISSING)' : ''}: ` +
                `${error.message} (code=${error.code ?? 'none'}). Returning the fallback.`
              )
              return fallback
            }
            return data
          })
      }

      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      return (...args) => {
        const result = value.apply(target, args)
        // Builder methods return the builder (or a new one). Keep it wrapped.
        return (result && typeof result.then === 'function') ? wrapBuilder(result, table) : result
      }
    },
  })
}

export const db = {
  from(table) {
    return wrapBuilder(rawClient().from(table), table)
  },
  async rpc(fn, args) {
    const { data, error } = await rawClient().rpc(fn, args)
    if (error) throw new SupabaseQueryError(error, `rpc:${fn}`, `rpc ${fn}`)
    return data
  },
  get auth() { return rawClient().auth },
  get storage() { return rawClient().storage },
}

export default db
