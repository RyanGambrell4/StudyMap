import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the two tables resolveCourseId touches.
const db = { user_data: {}, ios_state: {} }

function table(name) {
  let filterUser = null
  let pendingUpdate = null
  let pendingInsert = null
  const api = {
    select() { return api },
    eq(_col, value) {
      filterUser = value
      if (pendingUpdate) {
        db[name][filterUser] = { ...(db[name][filterUser] || {}), ...pendingUpdate }
        return Promise.resolve({ error: null })
      }
      return api
    },
    maybeSingle() {
      return Promise.resolve({ data: db[name][filterUser] ?? null, error: null })
    },
    update(values) { pendingUpdate = values; return api },
    insert(values) {
      pendingInsert = values
      db[name][pendingInsert.user_id] = { ...pendingInsert }
      return Promise.resolve({ error: null })
    },
  }
  return api
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: table }) }))

const { resolveCourseId, webCourseFromIos } = await import('./courseContext.js')

const iosCalc = {
  id: 'A1B2C3D4-0000-4000-8000-000000000001',
  name: 'Calc',
  colorHex: '#3452D9',
  examDate: '2026-11-20T15:00:00Z',
  targetGrade: 'A',
  difficulty: 3,
  semester: 'Fall 2026',
}

beforeEach(() => {
  db.user_data = {}
  db.ios_state = {}
})

describe('webCourseFromIos', () => {
  it('maps the shared fields and lowercases the id', () => {
    expect(webCourseFromIos(iosCalc)).toEqual({
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: 'Calc',
      colorHex: '3452D9',
      examDate: '2026-11-20T15:00:00Z',
      targetGrade: 'A',
      difficulty: 3,
      source: 'ios',
    })
  })

  it('rejects a course with no name or id', () => {
    expect(webCourseFromIos({ id: 'x', name: '  ' })).toBeNull()
    expect(webCourseFromIos({ name: 'Calc' })).toBeNull()
  })
})

describe('resolveCourseId adopts iOS-only courses', () => {
  it('copies the iOS course onto the web plan and returns its id', async () => {
    db.user_data.u1 = { plan: { courses: [{ id: 'web-1', name: 'History' }], yearLevel: '2nd' } }
    db.ios_state.u1 = { snapshot: { courses: [iosCalc] } }

    const id = await resolveCourseId('u1', ' calc ')
    expect(id).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    const plan = db.user_data.u1.plan
    expect(plan.yearLevel).toBe('2nd')                       // rest of the plan kept
    expect(plan.courses.map(c => c.name)).toEqual(['History', 'Calc'])

    // Second call resolves straight from the web plan.
    expect(await resolveCourseId('u1', 'Calc')).toBe(id)
    expect(db.user_data.u1.plan.courses).toHaveLength(2)     // not duplicated
  })

  it('creates the user_data row when it does not exist yet', async () => {
    db.ios_state.u2 = { snapshot: { courses: [iosCalc] } }
    expect(await resolveCourseId('u2', 'Calc')).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    expect(db.user_data.u2.plan.courses[0].name).toBe('Calc')
  })

  it('still returns null for a course that exists nowhere', async () => {
    db.user_data.u3 = { plan: { courses: [] } }
    db.ios_state.u3 = { snapshot: { courses: [iosCalc] } }
    expect(await resolveCourseId('u3', 'Physics')).toBeNull()
  })

  it('keeps the existing web match when one exists', async () => {
    db.user_data.u4 = { plan: { courses: [{ id: 'web-calc', name: 'Calc' }] } }
    db.ios_state.u4 = { snapshot: { courses: [iosCalc] } }
    expect(await resolveCourseId('u4', 'Calc')).toBe('web-calc')
  })
})
