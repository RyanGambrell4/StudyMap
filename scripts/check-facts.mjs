#!/usr/bin/env node
/**
 * Fail the build when a marketing fact has drifted from content/facts.json.
 *
 * This is the part that actually prevents recurrence. Correcting the values was
 * the easy half; nothing previously told anyone when a price or trial length had
 * gone stale in 130 static files, so it went unnoticed for months.
 *
 *   npm run facts:check
 */

import { globSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

import { facts, RULES, TARGET_GLOBS, lineOf } from './facts.mjs'
import { TRIAL_PLAN, TRIAL_BILLING_PERIOD, TRIAL_PERIOD_DAYS } from '../lib/server/trialPlan.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Cross-check facts.json against the revenue-critical server constants.
 * trialPlan.js stays the runtime authority; this only asserts the marketing
 * copy is describing the same product Stripe is actually billing.
 */
function checkAgainstBillingSource() {
  const mismatches = []
  if (facts.trial.days !== TRIAL_PERIOD_DAYS) {
    mismatches.push(`trial.days=${facts.trial.days} but lib/server/trialPlan.js TRIAL_PERIOD_DAYS=${TRIAL_PERIOD_DAYS}`)
  }
  if (facts.trial.plan !== TRIAL_PLAN) {
    mismatches.push(`trial.plan=${facts.trial.plan} but TRIAL_PLAN=${TRIAL_PLAN}`)
  }
  const period = { weekly: 'weekly', monthly: 'monthly', annual: 'annual' }[facts.trial.billingPeriod]
  if (period !== TRIAL_BILLING_PERIOD) {
    mismatches.push(`trial.billingPeriod=${facts.trial.billingPeriod} but TRIAL_BILLING_PERIOD=${TRIAL_BILLING_PERIOD}`)
  }
  return mismatches
}

function targetFiles() {
  const seen = new Set()
  for (const pattern of TARGET_GLOBS) {
    for (const f of globSync(pattern, { cwd: ROOT })) seen.add(f)
  }
  return [...seen].sort()
}

const billing = checkAgainstBillingSource()
if (billing.length) {
  console.error('content/facts.json disagrees with the billing source of truth:\n')
  for (const m of billing) console.error(`  ${m}`)
  console.error('\nFix content/facts.json, or change lib/server/trialPlan.js deliberately.')
  process.exit(1)
}

let violations = 0
const files = targetFiles()

for (const file of files) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  for (const rule of RULES) {
    for (const p of rule.run(text)) {
      violations++
      const line = lineOf(text, p.index)
      console.error(`${file}:${line}  [${rule.name}]  ${p.message}`)
      console.error(`    found: ${JSON.stringify(p.found)}`)
      if (p.expected) console.error(`    want:  ${JSON.stringify(p.expected)}`)
    }
  }
}

if (violations) {
  console.error(
    `\n${violations} fact violation${violations === 1 ? '' : 's'} across ${files.length} files.\n` +
    'Edit content/facts.json if the fact itself changed, then run: npm run facts:sync'
  )
  process.exit(1)
}

console.log(
  `facts: ${files.length} files clean ` +
    `(trial ${facts.trial.days}d on ${facts.trial.plan}/${facts.trial.billingPeriod}, ` +
    `Pro $${facts.plans.pro.month}/mo, Unlimited $${facts.plans.unlimited.month}/mo)`,
)
