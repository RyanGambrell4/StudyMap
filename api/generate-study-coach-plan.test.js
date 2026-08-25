import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flattenSessions } from '../lib/shared/coachPlan.js'

// The handler's two external dependencies are stubbed so the test exercises
// exactly one thing: what the grounding gate does to a model response.
// The handler now authenticates first, resolves the course, and only then
// reserves an AI action, so the mock has to cover both halves of that split.
vi.mock('../lib/server/usage.js', () => ({
  verifyAuth: async () => ({ ok: true, userId: 'user-1' }),
  reserveAiUsage: async () => ({ ok: true, userId: 'user-1', commit: async () => ({ ok: true }) }),
  verifyAndCheckAiUsage: async () => ({ ok: true, userId: 'user-1', commit: async () => ({ ok: true }) }),
}))
vi.mock('../lib/server/courseContext.js', () => ({
  getCourseContext: async () => ({ identity: { name: 'Cell Biology' } }),
  formatCourseContextForPrompt: () => '',
  resolveCourseId: async () => 'course-1',
}))

const { default: handler } = await import('./generate-study-coach-plan.js')

const TOPICS = 'Cell structure, Membrane transport, Glycolysis, Krebs cycle'
const STRUGGLES = ['Glycolysis']

function futureISO(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** A model response whose sessions all name real student topics. */
function groundedResponse(weeks = 2, perWeek = 3) {
  const names = ['Cell structure', 'Membrane transport', 'Glycolysis', 'Krebs cycle']
  return {
    summary: 'Grounded plan.',
    weeklyFocus: Array.from({ length: weeks }, (_, w) => ({
      week: `Week ${w + 1}`,
      theme: 'Build mastery',
      sessions: Array.from({ length: perWeek }, (_, s) => {
        const topic = names[(w * perWeek + s) % names.length]
        return {
          sessionLabel: `Session ${s + 1}`,
          focusArea: topic,
          goal: 'Recall it without notes.',
          keyTopics: [topic],
          studyMethod: 'Active recall',
          sessionType: 'Retrieval',
          provenanceLabel: topic,
          duration: 45,
        }
      }),
    })),
    priorityTopics: ['Glycolysis'],
    warningZones: ['Cramming without retrieval practice'],
  }
}

/** The same plan with one session about material the student never mentioned. */
function hallucinatedResponse() {
  const plan = groundedResponse()
  plan.weeklyFocus[0].sessions[1] = {
    sessionLabel: 'Session 2',
    focusArea: 'Calvin cycle and photorespiration',
    goal: 'Trace carbon fixation.',
    keyTopics: ['Calvin cycle', 'Photorespiration'],
    studyMethod: 'Active recall',
    sessionType: 'New content',
    provenanceLabel: 'Calvin cycle',
    duration: 45,
  }
  return plan
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

function mockReq() {
  return {
    method: 'POST',
    headers: { 'content-length': '100' },
    body: {
      courseName: 'Cell Biology',
      courseId: 'course-1',
      goal: 'Score at least 85 on the final.',
      emphasisTopics: TOPICS,
      struggles: STRUGGLES,
      importantDates: [{ label: 'Exam Day', date: futureISO(21) }],
      daysPerWeek: 3,
      sessionMinutes: 45,
    },
  }
}

/** Queues model responses; each fetch call returns the next one. */
function mockAnthropic(...payloads) {
  let i = 0
  return vi.fn(async () => {
    const payload = payloads[Math.min(i++, payloads.length - 1)]
    return {
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
    }
  })
}

beforeEach(() => { vi.restoreAllMocks() })

describe('generate-study-coach-plan grounding gate', () => {
  it('accepts a grounded plan on the first pass and stamps provenance on every session', async () => {
    global.fetch = mockAnthropic(groundedResponse())
    const res = mockRes()
    await handler(mockReq(), res)

    expect(res.statusCode).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(1) // no repair needed

    const flat = flattenSessions(res.body)
    expect(flat.length).toBeGreaterThan(0)
    expect(flat.every(f => !!f.session.provenance?.id)).toBe(true)
    expect(flat.every(f => !!f.session.id)).toBe(true)
    expect(flat.every(f => !!f.session.scheduledDate)).toBe(true)
    expect(flat.every(f => f.session.done === false)).toBe(true)
    // The raw model hint never survives into storage.
    expect(flat.every(f => f.session.provenanceLabel === undefined)).toBe(true)
  })

  it('every stored session topic comes from the input set', async () => {
    global.fetch = mockAnthropic(groundedResponse())
    const res = mockRes()
    await handler(mockReq(), res)

    const allowed = [...TOPICS.split(',').map(s => s.trim()), ...STRUGGLES].map(s => s.toLowerCase())
    for (const { session } of flattenSessions(res.body)) {
      expect(allowed).toContain(session.provenance.label.toLowerCase())
      for (const t of session.keyTopics || []) {
        expect(allowed.some(a => a.includes(t.toLowerCase()) || t.toLowerCase().includes(a))).toBe(true)
      }
    }
  })

  it('rejects a hallucinated session, re-prompts once, and accepts the repair', async () => {
    global.fetch = mockAnthropic(hallucinatedResponse(), groundedResponse())
    const res = mockRes()
    await handler(mockReq(), res)

    expect(global.fetch).toHaveBeenCalledTimes(2) // one repair pass ran
    expect(res.statusCode).toBe(200)

    const labels = flattenSessions(res.body).map(f => f.session.provenance.label.toLowerCase())
    expect(labels).not.toContain('calvin cycle')
  })

  it('the repair prompt names the offending session and its invented topic', async () => {
    const fetchMock = mockAnthropic(hallucinatedResponse(), groundedResponse())
    global.fetch = fetchMock
    await handler(mockReq(), mockRes())

    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body)
    const repairText = secondCall.messages[secondCall.messages.length - 1].content
    expect(repairText).toMatch(/rejected/i)
    expect(repairText).toMatch(/Calvin cycle/)
    expect(repairText).toMatch(/repeat topics with different study methods/i)
  })

  it('surfaces a clean retry error when the repair also fails, and stores nothing', async () => {
    global.fetch = mockAnthropic(hallucinatedResponse(), hallucinatedResponse())
    const res = mockRes()
    await handler(mockReq(), res)

    expect(global.fetch).toHaveBeenCalledTimes(2) // exactly one repair, no loop
    expect(res.statusCode).toBe(422)
    expect(res.body.code).toBe('PLAN_UNGROUNDED')
    expect(res.body.error).toMatch(/Refine inputs/)
    expect(res.body.weeklyFocus).toBeUndefined() // no plan escapes the gate
  })

  it('keeps every scheduled date between today and the exam', async () => {
    global.fetch = mockAnthropic(groundedResponse())
    const res = mockRes()
    const req = mockReq()
    await handler(req, res)

    const today = new Date().toISOString().split('T')[0]
    const exam = req.body.importantDates[0].date
    expect(res.body.examDate).toBe(exam)
    for (const { session } of flattenSessions(res.body)) {
      expect(session.scheduledDate > today).toBe(true)
      expect(session.scheduledDate < exam).toBe(true)
    }
  })

  it('carries the student goal onto the plan rather than a model-invented objective', async () => {
    global.fetch = mockAnthropic(groundedResponse())
    const res = mockRes()
    await handler(mockReq(), res)
    expect(res.body.goal).toBe('Score at least 85 on the final.')
  })

  it('session ids are stable and unique', async () => {
    global.fetch = mockAnthropic(groundedResponse())
    const a = mockRes(); await handler(mockReq(), a)
    global.fetch = mockAnthropic(groundedResponse())
    const b = mockRes(); await handler(mockReq(), b)

    const idsA = flattenSessions(a.body).map(f => f.session.id)
    const idsB = flattenSessions(b.body).map(f => f.session.id)
    expect(idsA).toEqual(idsB)
    expect(new Set(idsA).size).toBe(idsA.length)
  })
})
