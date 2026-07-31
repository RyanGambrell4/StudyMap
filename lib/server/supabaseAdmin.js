// Lazy proxy over the supabase-js admin (service-role) client.
//
// Before: every server module did `const supabaseAdmin = createClient(url, key)`
// at import time. When SUPABASE_SERVICE_KEY was missing from Vercel env, that
// call threw "supabaseKey is required" during ES module initialization, which
// crashed the whole function before the handler could run — Vercel returned its
// plain-text "A server error has occurred" page and the client saw the cryptic
// "Unexpected token 'A', "A server e"... is not valid JSON" parse error.
//
// After: the proxy defers createClient() until the first property access on
// the client (e.g. `.from(...)`, `.auth`, `.rpc(...)`, `.storage`), so if the
// key is missing the error is raised INSIDE the handler and can be caught +
// converted to a real JSON response.

import { createClient } from '@supabase/supabase-js'

let _client = null

function build() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set')
  }
  _client = createClient(url, key)
  return _client
}

export const supabaseAdmin = new Proxy({}, {
  get(_target, prop) {
    const c = build()
    const v = Reflect.get(c, prop)
    return typeof v === 'function' ? v.bind(c) : v
  },
})
