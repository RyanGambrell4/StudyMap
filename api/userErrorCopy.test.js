import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { USER_ERRORS } from '../lib/server/userErrors.js'

/**
 * User-facing error copy must never contain a parameter name.
 *
 * `Missing courseId (or unique courseName)` was returned verbatim to students
 * by sixteen endpoints. This test is the thing that stops it coming back, in
 * that shape or any other.
 *
 * Two layers:
 *   1. Every string in USER_ERRORS is checked directly.
 *   2. Every error string literal in the user-facing AI endpoints is checked,
 *      so a new handler cannot quietly reintroduce one.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

// Things that read as code rather than as English.
const FORBIDDEN = [
  // camelCase identifiers: courseId, courseName, durationMinutes, sessionType
  { name: 'a camelCase parameter name', re: /\b[a-z]+[A-Z][a-zA-Z]*\b/ },
  // snake_case identifiers: user_id, course_id
  { name: 'a snake_case parameter name', re: /\b[a-z]+_[a-z_]+\b/ },
  // Bare HTTP status codes: "400", "(500)"
  { name: 'an HTTP status code', re: /\b[45]\d{2}\b/ },
  // Exception and stack vocabulary
  { name: 'internal error vocabulary', re: /\b(undefined|null|NaN|stack trace|Exception|TypeError|ReferenceError)\b/ },
  // Code-ish punctuation that only appears in identifiers
  { name: 'code punctuation', re: /[{}<>]|\w\.\w+\(|=>|\?\./ },
]

// Words that are legitimately camelCase-looking in English but are not
// parameter names. Kept deliberately short: if this list grows, the copy is
// drifting back toward jargon.
const ALLOWED_WORDS = ['StudyEdge', 'PDF', 'AI', 'PowerPoint', 'Word']

function scrub(text) {
  let t = text
  for (const w of ALLOWED_WORDS) t = t.split(w).join('')
  return t
}

function violations(text) {
  const t = scrub(text)
  return FORBIDDEN.filter(f => f.re.test(t)).map(f => f.name)
}

describe('USER_ERRORS copy is written for students, not for developers', () => {
  for (const [key, spec] of Object.entries(USER_ERRORS)) {
    it(`${key}: reads as a sentence`, () => {
      expect(violations(spec.error), `USER_ERRORS.${key}.error contains ${violations(spec.error).join(', ')}: "${spec.error}"`)
        .toEqual([])
      // A real sentence, not a fragment.
      expect(spec.error.length).toBeGreaterThan(20)
      expect(spec.error.trim()).toMatch(/[.!?]$/)
      // House style: no em dashes anywhere a user can read.
      expect(spec.error).not.toContain('—')
    })
  }
})

// Endpoints a signed-in student can trigger directly from the app.
const USER_FACING = [
  'quiz-burst.js', 'cheat-sheet.js', 'course-insights.js', 'session-debrief.js',
  'connections-mode.js', 'exam-rescue.js', 'brain-dump-score.js', 'chat-tutor.js',
  'essay-thesis.js', 'essay-outline.js', 'essay-review-section.js',
  'generate-diagram.js', 'generate-session-blueprint.js', 'generate-study-coach-plan.js',
  'generate-study-tools.js', 'generate-practice-exam.js', 'parse-syllabus.js',
  'extract-syllabus-events.js', 'scan-notes.js', 'solve-problem.js', 'reteach.js',
  'repair-misconception.js', 'generate-mnemonic.js', 'timed-challenge.js',
  'teach-it-back.js', 'prep-blast.js',
]

// Matches   error: 'some text'   and   error: "some text"
// Applied per line so it cannot run past the end of a literal and swallow code.
const ERROR_LITERAL = /error:\s*(['"])((?:[^'"\\\n]|\\.)*)\1/

describe('no endpoint returns an internal validation string to a user', () => {
  const present = new Set(readdirSync(HERE))

  for (const file of USER_FACING) {
    if (!present.has(file)) continue
    it(`${file}: every error literal reads as a sentence`, () => {
      const src = readFileSync(join(HERE, file), 'utf8')
      const bad = []
      for (const line of src.split('\n')) {
        const m = line.match(ERROR_LITERAL)
        if (!m) continue
        const text = m[2]
        // Skip the method-not-allowed guard, which no student ever sees: it
        // only fires for a non-POST request that the app never makes.
        if (text === 'Method not allowed') continue
        const v = violations(text)
        if (v.length) bad.push(`"${text}" contains ${v.join(', ')}`)
      }
      expect(bad, `${file} returns developer text to users:\n  ${bad.join('\n  ')}`).toEqual([])
    })
  }
})
