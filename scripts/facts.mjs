/**
 * Shared rules for the facts guard.
 *
 * The point of this module is that every rule is derived from content/facts.json
 * rather than written out a second time here. A rule that restates a value would
 * be one more place for it to rot, which is the exact failure this is meant to stop.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const facts = JSON.parse(readFileSync(join(ROOT, 'content/facts.json'), 'utf8'))

/** Files that carry marketing facts and therefore have to stay in sync. */
export const TARGET_GLOBS = [
  'public/*.html',
  'public/*.md',
  'public/llms.txt',
  'index.html',
  'signup.html',
  'app.html',
]

const money = (n) => n.toFixed(2)

/**
 * Map of our own price amounts -> the intervals they may legitimately appear with.
 *
 * Scoped to OUR amounts on purpose. The comparison pages quote competitor prices
 * (Chegg $15.95/mo, Course Hero $39.95/mo, Wolfram Alpha $7.99/mo) which are none
 * of this checker's business; flagging them produced 11 false positives on the
 * first run. What we actually care about is one of our own numbers being printed
 * against the wrong interval, which is the "$2.99/month" bug that shipped.
 *
 * Annual-equivalent figures are computed from the annual price, not hardcoded, so
 * changing a plan price updates what is accepted without editing this file.
 */
export function allowedPriceIntervals() {
  const ok = new Map()
  const allow = (amount, interval) => {
    const key = money(amount)
    if (!ok.has(key)) ok.set(key, new Set())
    ok.get(key).add(interval)
  }
  for (const plan of Object.values(facts.plans)) {
    if (plan.week) allow(plan.week, 'week')
    if (plan.month) allow(plan.month, 'month')
    if (plan.year) {
      allow(plan.year, 'year')
      allow(plan.year / 12, 'month') // "$69.99/year ($5.83/month equivalent)"
      allow(plan.year / 52, 'week')  // "works out to $1.35/week"
    }
  }
  return ok
}

const INTERVAL = { wk: 'week', week: 'week', weekly: 'week', mo: 'month', month: 'month', monthly: 'month', yr: 'year', year: 'year', annually: 'year' }

/**
 * Each rule returns a list of {line, found, expected, message} problems.
 * `text` is the whole file; rules do their own line accounting so the report
 * can point at something a human can jump to.
 */
export const RULES = [
  {
    name: 'trial-length',
    // "7-day free trial", "7-day trial", "free for 7 days"
    run(text) {
      const problems = []
      const want = facts.trial.days
      const patterns = [
        /(\d+)-day free trial/gi,
        /(\d+)-day trial/gi,
        /free for (\d+) days/gi,
      ]
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          const got = Number(m[1])
          if (got !== want) {
            problems.push({
              index: m.index,
              found: m[0],
              expected: m[0].replace(String(got), String(want)),
              message: `trial length is ${want} days (content/facts.json), found ${got}`,
            })
          }
        }
      }
      return problems
    },
  },
  {
    name: 'price-interval-pairing',
    // Catches "$2.99/month" when Pro weekly is $2.99 and Pro monthly is $9.99.
    run(text) {
      const problems = []
      const ok = allowedPriceIntervals()
      const re = /\$(\d+\.\d{2})\s*(?:\/|\s+per\s+|\s+a\s+)(wk|week|weekly|mo|month|monthly|yr|year|annually)\b/gi
      for (const m of text.matchAll(re)) {
        const amount = m[1]
        const interval = INTERVAL[m[2].toLowerCase()]
        const valid = ok.get(amount)
        // Not one of our amounts -> a competitor price on a comparison page. Skip.
        if (!valid) continue
        if (!valid.has(interval)) {
          problems.push({
            index: m.index,
            found: m[0],
            expected: null,
            message:
              `$${amount} is one of our prices but not a ${interval}ly one. ` +
              `$${amount} is valid per ${[...valid].join(' or ')}.`,
          })
        }
      }
      return problems
    },
  },
  {
    name: 'support-email',
    run(text) {
      const problems = []
      const want = facts.support.email
      const re = /\b[\w.+-]+@getstudyedge\.com\b/g
      for (const m of text.matchAll(re)) {
        if (m[0] !== want && !/^(hello|press|legal|privacy|noreply|no-reply)@/.test(m[0])) {
          problems.push({
            index: m.index,
            found: m[0],
            expected: want,
            message: `support address is ${want} (content/facts.json)`,
          })
        }
      }
      return problems
    },
  },
]

/** Turn a character offset into a 1-indexed line number. */
export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}
