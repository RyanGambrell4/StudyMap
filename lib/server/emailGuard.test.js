/**
 * Proves the suppression guard fails CLOSED, and proves the two exemptions that
 * stop it locking anyone out.
 *
 * The bug this pins: `email_suppression` does not exist in production, and
 * supabase-js returns { data: null, error } rather than throwing, so the old
 * code read a missing table as "not suppressed" and sent the mail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module builds a Supabase client at import time.
const state = { error: null, row: null }
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row, error: state.error }),
        }),
      }),
    }),
    // recordUserEmail() path, not under test here.
    update: () => ({ eq: async () => ({ error: null }) }),
  }),
}))

const MISSING_TABLE = {
  code: 'PGRST205',
  message: "Could not find the table 'public.email_suppression' in the schema cache",
}

let canSendUserEmail

beforeEach(async () => {
  vi.resetModules()
  state.error = null
  state.row = null
  delete process.env.EMAIL_SUPPRESSION_FAIL_OPEN
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ;({ canSendUserEmail } = await import('./emailGuard.js'))
})
afterEach(() => vi.restoreAllMocks())

describe('suppression list is missing (production today)', () => {
  it('refuses to send normal-priority lifecycle mail', async () => {
    state.error = MISSING_TABLE
    const r = await canSendUserEmail('user-1', { priority: 'normal', email: 'a@b.com' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/unavailable/i)
  })

  it('refuses low priority too', async () => {
    state.error = MISSING_TABLE
    expect((await canSendUserEmail('user-1', { priority: 'low' })).ok).toBe(false)
  })

  it('says loudly that the table does not exist', async () => {
    state.error = MISSING_TABLE
    await canSendUserEmail('user-1', { priority: 'normal' })
    const said = console.error.mock.calls.flat().join(' ')
    expect(said).toMatch(/THE TABLE DOES NOT EXIST/)
    expect(said).toMatch(/20260727/)
  })

  it('STILL SENDS critical priority, so nobody is locked out', async () => {
    state.error = MISSING_TABLE
    // 'critical' is documented as password reset / email confirmation. Those do
    // not route through this guard today, but if one ever does it must not be
    // blocked by an unreadable suppression list.
    expect((await canSendUserEmail('user-1', { priority: 'critical' })).ok).toBe(true)
  })

  it('EMAIL_SUPPRESSION_FAIL_OPEN=1 restores the old behaviour', async () => {
    process.env.EMAIL_SUPPRESSION_FAIL_OPEN = '1'
    vi.resetModules()
    const mod = await import('./emailGuard.js')
    state.error = MISSING_TABLE
    expect((await mod.canSendUserEmail('user-1', { priority: 'normal' })).ok).toBe(true)
  })
})

describe('suppression list is readable', () => {
  it('blocks an address that is on it', async () => {
    state.row = { reason: 'complained' }
    const r = await canSendUserEmail('user-1', { priority: 'normal' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Suppressed \(complained\)/)
  })

  it('blocks a suppressed address even at critical priority', async () => {
    // The critical exemption covers "cannot read the list", NOT "the list says
    // this address is bad". A known-bad address is never mailed.
    state.row = { reason: 'bounced' }
    expect((await canSendUserEmail('user-1', { priority: 'critical' })).ok).toBe(false)
  })

  it('allows an address that is not on it', async () => {
    state.row = null
    expect((await canSendUserEmail('user-1', { priority: 'critical' })).ok).toBe(true)
  })
})
