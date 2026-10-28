// Session content for the iOS plan engine.
//
// The app now decides everything structural on the device: when each session
// happens, its type (Practice problems, Teach it back, Timed mock...), its
// topic, the assessment it builds toward and its steps with minutes. What it
// asks for here is only the wording: a checkable goal and one instruction per
// step, specific to the topic. That is a small Haiku call per week instead of
// one 16k-token Sonnet call for the whole term, so week 1 is back in seconds
// and later weeks are filled in parallel in the background.

import { ANTI_GUESSING_ONELINE } from './coachAntiGuessing.js'

export const SESSION_CONTENT_MODEL = 'claude-haiku-4-5-20251001'
export const MAX_ITEMS = 12

const clip = (s, n) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n)

/** Validates and trims the app's request; returns null when unusable. */
export function normalizeItems(raw) {
  if (!Array.isArray(raw)) return null
  const items = raw.slice(0, MAX_ITEMS).map((it) => ({
    key: clip(it?.key, 200),
    type: clip(it?.type, 40),
    topic: clip(it?.topic, 80),
    otherTopic: it?.otherTopic ? clip(it.otherTopic, 80) : null,
    assessment: it?.assessment ? clip(it.assessment, 60) : null,
    minutes: Math.max(10, Math.min(240, Number(it?.minutes) || 45)),
    steps: Array.isArray(it?.steps)
      ? it.steps.slice(0, 6).map((s) => ({ name: clip(s?.name, 40), minutes: Math.max(1, Number(s?.minutes) || 5) }))
      : [],
  })).filter((it) => it.key && it.type && it.steps.length)
  return items.length ? items : null
}

export const SYSTEM_PROMPT = `You write the wording for study sessions in a student's plan. The app has already decided each session's type, topic, assessment and steps. For each session write:
- "goal": one sentence, at most 14 words, that the student can check off at the end ("Can solve elasticity problems without notes").
- "steps": exactly one instruction per given step, in the same order, at most 24 words each, telling the student what to do in that step for this topic.

Rules:
- Use only the topic, the assessment name and the step names you are given. ${ANTI_GUESSING_ONELINE}
- Describe what the student does with their own notes, slides, readings, problem sets and the app's tools (flashcards, quizzes, tutor). Do not state facts, formulas, chapter names or subtopics.
- Use the assessment's name exactly as given ("Midterm", not "exam").
- Plain words, second person, no em dashes, no emoji.
- Output only JSON: {"sessions":[{"key":"...","goal":"...","steps":["...","..."]}]}`

export function buildUserPrompt(courseName, items) {
  const lines = items.map((it) => JSON.stringify({
    key: it.key,
    type: it.type,
    topic: it.otherTopic ? `${it.topic} + ${it.otherTopic}` : it.topic,
    assessment: it.assessment,
    minutes: it.minutes,
    steps: it.steps.map((s) => `${s.name} (${s.minutes} min)`),
  }))
  return `Course: ${clip(courseName, 80)}\nSessions:\n${lines.join('\n')}\n\nOutput the JSON now.`
}

/** Keeps only well-formed entries for keys that were asked for. */
export function parseContent(text, items) {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) return {}
  let raw
  try { raw = JSON.parse(text.slice(first, last + 1)) } catch { return {} }
  const want = new Map(items.map((it) => [it.key, it]))
  const out = {}
  for (const s of Array.isArray(raw?.sessions) ? raw.sessions : []) {
    const it = want.get(s?.key)
    if (!it) continue
    const goal = clip(s.goal, 140)
    const steps = Array.isArray(s.steps) ? s.steps.map((x) => clip(x, 200)).filter(Boolean) : []
    if (!goal) continue
    out[it.key] = { goal, steps: steps.length === it.steps.length ? steps : null }
  }
  return out
}
