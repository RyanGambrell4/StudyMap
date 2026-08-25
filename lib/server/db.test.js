/**
 * The wrapper's whole job is that you cannot accidentally ignore `error`.
 * These tests pin that, plus the shape of the deliberate opt out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A fake PostgREST builder: thenable, chainable, resolves to {data, error}.
function fakeBuilder(result) {
  const b = {
    select: () => b,
    eq: () => b,
    limit: () => b,
    order: () => b,
    maybeSingle: () => b,
    single: () => b,
    insert: () => b,
    update: () => b,
    upsert: () => b,
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  }
  return b
}

const state = { result: { data: null, error: null }, rpcResult: { data: null, error: null } }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => fakeBuilder(state.result),
    rpc: async () => state.rpcResult,
    auth: { admin: {} },
    storage: {},
  }),
}))

process.env.SUPABASE_URL ??= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_KEY ??= 'test-key'

const { db, isSchemaError, SupabaseQueryError } = await import('./db.js')

const MISSING_COLUMN = { code: '42703', message: 'column user_data.courses does not exist' }
const MISSING_TABLE = { code: '42P01', message: 'relation "email_suppression" does not exist' }
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' }

describe('awaiting a query', () => {
  let errorSpy
  beforeEach(() => {
    state.result = { data: null, error: null }
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('returns rows directly, with nothing to destructure wrongly', async () => {
    state.result = { data: [{ user_id: 'u1' }], error: null }
    const rows = await db.from('user_data').select('user_id')
    expect(rows).toEqual([{ user_id: 'u1' }])
  })

  it('throws on a missing column instead of yielding null', async () => {
    // This is the exact shape that killed 17 crons for two months.
    state.result = { data: null, error: MISSING_COLUMN }
    await expect(db.from('user_data').select('courses')).rejects.toThrow(/does not exist/)
  })

  it('throws on a missing table', async () => {
    state.result = { data: null, error: MISSING_TABLE }
    await expect(db.from('email_suppression').select('reason')).rejects.toThrow(SupabaseQueryError)
  })

  it('throws on a transient failure too, so callers decide deliberately', async () => {
    state.result = { data: null, error: TIMEOUT }
    await expect(db.from('user_data').select('plan')).rejects.toThrow(/statement timeout/)
  })

  it('carries code, table and isSchemaError on the thrown error', async () => {
    state.result = { data: null, error: MISSING_COLUMN }
    const err = await db.from('user_data').select('courses').catch(e => e)
    expect(err.code).toBe('42703')
    expect(err.table).toBe('user_data')
    expect(err.isSchemaError).toBe(true)
    expect(err.message).toMatch(/SCHEMA MISSING/)
  })

  it('marks a transient error as not-schema, so the two are distinguishable', async () => {
    state.result = { data: null, error: TIMEOUT }
    const err = await db.from('user_data').select('plan').catch(e => e)
    expect(err.isSchemaError).toBe(false)
    expect(err.message).not.toMatch(/SCHEMA MISSING/)
  })

  it('survives a chain of builder methods', async () => {
    state.result = { data: { plan: {} }, error: null }
    const row = await db.from('user_data').select('plan').eq('user_id', 'u1').maybeSingle()
    expect(row).toEqual({ plan: {} })
  })
})

describe('.tolerate(), the deliberate opt out', () => {
  let errorSpy
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => errorSpy.mockRestore())

  it('returns the fallback rather than throwing', async () => {
    state.result = { data: null, error: TIMEOUT }
    const rows = await db.from('user_data').select('last_emailed_at').tolerate([])
    expect(rows).toEqual([])
  })

  it('is never silent about it', async () => {
    state.result = { data: null, error: TIMEOUT }
    await db.from('user_data').select('last_emailed_at').tolerate([])
    expect(errorSpy).toHaveBeenCalled()
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/TOLERATED FAILURE on user_data/)
  })

  it('says loudly when the tolerated failure is a missing schema', async () => {
    // Tolerating a timeout is reasonable. Tolerating a missing table usually is
    // not, so it has to be visibly different in the logs.
    state.result = { data: null, error: MISSING_TABLE }
    await db.from('email_suppression').select('reason').tolerate(null)
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/SCHEMA MISSING/)
  })

  it('passes data through untouched on success', async () => {
    state.result = { data: [1, 2, 3], error: null }
    expect(await db.from('user_data').select('x').tolerate([])).toEqual([1, 2, 3])
  })
})

describe('rpc', () => {
  it('throws when the function does not exist', async () => {
    state.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(db.rpc('list_users_by_signup_window', {})).rejects.toThrow(/Could not find the function/)
  })

  it('returns data on success', async () => {
    state.rpcResult = { data: [{ user_id: 'u1' }], error: null }
    expect(await db.rpc('list_users_by_signup_window', {})).toEqual([{ user_id: 'u1' }])
  })
})

describe('isSchemaError', () => {
  it.each([
    ['42P01', true], ['42703', true], ['42883', true],
    ['PGRST202', true], ['PGRST204', true], ['PGRST205', true],
    ['57014', false], ['23505', false],
  ])('%s -> %s', (code, expected) => {
    expect(isSchemaError({ code, message: '' })).toBe(expected)
  })

  it('falls back to the message when the code is unfamiliar', () => {
    expect(isSchemaError({ code: 'XXXXX', message: 'relation "foo" does not exist' })).toBe(true)
    expect(isSchemaError({ code: 'XXXXX', message: 'could not find it in the schema cache' })).toBe(true)
    expect(isSchemaError(null)).toBe(false)
  })
})
