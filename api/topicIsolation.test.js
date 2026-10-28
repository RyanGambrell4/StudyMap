import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Topic and course isolation, at the prompt the model actually receives.
 *
 * 2026-10-28: one "World war 2" quiz, filed under Econ, made every later Econ
 * flashcard set, quiz and plan about World War 2. The course context carried
 * it as a struggle and a weak topic, and the client sent it as a struggle.
 *
 * Each test builds a course whose stored data is contaminated with topic A,
 * asks for topic B, and asserts the prompt sent to Anthropic has no trace of
 * A. The courseContext module is real except for its database reads.
 */

// courseContext.js builds a Supabase client at import; nothing here reads it.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_KEY ??= 'test-key'
})

const prompts = []
let currentBrain = null

vi.mock('../lib/server/usage.js', () => ({
  verifyAuth: async () => ({ ok: true, userId: 'u1' }),
  reserveAiUsage: async () => ({ ok: true, userId: 'u1', plan: 'pro', commit: async () => ({ ok: true }) }),
}))
vi.mock('../lib/server/rateLimit.js', () => ({
  checkFeatureRateLimit: async () => ({ allowed: true }),
  checkAiRateLimit: async () => ({ allowed: true }),
  rateLimit: async () => ({ allowed: true, remaining: 10 }),
}))
vi.mock('../lib/server/telemetry.js', () => ({ log: async () => {}, logAiCall: async () => {} }))
vi.mock('../lib/server/aiCost.js', () => ({ logAiCall: async () => 0, checkGlobalSpendCap: async () => ({ ok: true }) }))
vi.mock('../lib/server/artifactWriter.js', () => ({ saveArtifact: async () => ({ ok: true }) }))
vi.mock('../lib/server/courseContext.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    resolveCourseId: async (_u, name) => `course-${name}`,
    getCourseContext: async () => currentBrain,
  }
})

function reply(body) {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(body) }], usage: { input_tokens: 1, output_tokens: 1 } }))
}

globalThis.fetch = vi.fn(async (url, init) => {
  const body = JSON.parse(init.body)
  const text = body.messages.map(m => (typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('\n'))).join('\n')
  prompts.push((body.system ? JSON.stringify(body.system) + '\n' : '') + text)
  if (text.includes('Quiz Burst')) {
    return reply([{ question: 'q?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'A. a', explanation: 'e' }])
  }
  return reply({ flashcards: [{ front: 'What is a labour supply curve?', back: 'Wage vs hours offered' }], quiz: [] })
})

/** A course whose stored data is soaked in one topic. */
function brainFor(courseName, contaminant) {
  return {
    identity: { name: courseName, courseId: `course-${courseName}` },
    grades: null,
    deadlines: { items: [] },
    topics: { items: [{ name: contaminant, mastery: 35, isStruggle: true, signalCount: 3 }] },
    sessions: { recent: [{ topic: contaminant }], brainDumps: [{ topic: contaminant, score: 40 }] },
    plan: { struggles: [contaminant], weeklyFocus: [{ weekNumber: 1, topics: [contaminant] }], emphasisTopics: [contaminant] },
    materials: { excerpts: [{ text: `${contaminant} notes`, source: 'upload' }] },
    missing: [],
    warnings: [],
    meta: {},
  }
}

function res() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, setHeader() {} }
}

async function call(handlerPath, body) {
  const { default: handler } = await import(handlerPath)
  const r = res()
  await handler({ method: 'POST', headers: {}, body }, r)
  return { res: r, prompt: prompts[prompts.length - 1] ?? '' }
}

const WW2 = /world war|ww2|wwii/i

beforeEach(() => { prompts.length = 0 })

describe('topic isolation', () => {
  it('flashcards for topic B carry nothing from topic A stored on the course', async () => {
    currentBrain = brainFor('Econ', 'World war 2')
    // An old client still sending the contaminated struggle list.
    const { res: r, prompt } = await call('./generate-study-tools.js',
      { courseName: 'Econ', topic: 'Labour economics', struggles: ['World war 2'], professorEmphasis: 'World war 2' })
    expect(r.statusCode).toBe(200)
    expect(prompt).toContain('Labour economics')
    expect(prompt).not.toMatch(WW2)
  })

  it('topic A then topic B: B\'s prompt has nothing from A', async () => {
    currentBrain = brainFor('Econ', 'Supply and demand')
    const a = await call('./generate-study-tools.js', { courseName: 'Econ', topic: 'World War 2' })
    expect(a.prompt).toMatch(WW2)
    const b = await call('./generate-study-tools.js', { courseName: 'Econ', topic: 'Labour economics' })
    expect(b.prompt).toContain('Labour economics')
    expect(b.prompt).not.toMatch(WW2)
  })

  it('quiz burst on topic B carries nothing from topic A', async () => {
    currentBrain = brainFor('Econ', 'World war 2')
    const { prompt } = await call('./quiz-burst.js', { courseName: 'Econ', topic: 'Labour economics' })
    expect(prompt).toContain('Labour economics')
    expect(prompt).not.toMatch(WW2)
  })

  it('uploaded material: the prompt carries the material in sections, and no course topics', async () => {
    currentBrain = brainFor('Econ', 'World war 2')
    const text = Array.from({ length: 20 }, (_, i) => `PEAR paragraph ${i + 1}: point, evidence, analysis, relevance. ` + 'detail '.repeat(40)).join('\n\n')
    const { prompt } = await call('./generate-study-tools.js', { courseName: 'Econ', topic: 'Business Writing', text })
    expect(prompt).toContain('[Section 1]')
    expect(prompt).toContain('PEAR paragraph 20')
    expect(prompt).toContain('Every card and question must come from the material')
    expect(prompt).not.toMatch(WW2)
  })
})

describe('course isolation', () => {
  it('two courses: a request in course Y has nothing from course X', async () => {
    currentBrain = brainFor('History', 'World war 2')
    const x = await call('./generate-study-tools.js', { courseName: 'History', topic: 'Treaty of Versailles' })
    expect(x.prompt).toContain('History')
    currentBrain = brainFor('Econ', 'Elasticity')
    const y = await call('./generate-study-tools.js', { courseName: 'Econ', topic: 'Labour economics' })
    expect(y.prompt).toContain('Econ')
    expect(y.prompt).not.toMatch(/History|Versailles/)
    expect(y.prompt).not.toMatch(WW2)
  })
})
