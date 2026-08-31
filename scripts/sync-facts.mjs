#!/usr/bin/env node
/**
 * Rewrite marketing facts in the static pages from content/facts.json.
 *
 *   npm run facts:sync           apply
 *   npm run facts:sync -- --dry  show what would change
 *
 * Deliberately only rewrites facts that have exactly one correct value, which
 * today means the trial length and the support address. Price/interval mismatches
 * like "$2.99/month" are reported by facts:check but NOT auto-fixed, because the
 * fix is genuinely ambiguous: "$2.99/month" could mean the price is wrong ($9.99)
 * or the interval is wrong (/week). Guessing risks replacing a visible error with
 * an invisible one, so a human decides those.
 */

import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  facts,
  TARGET_GLOBS,
  JSONLD_OFFER_RE,
  expectedOfferPrice,
  extractPriceTable,
  renderPriceTable,
} from './facts.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const SUBS = [
  { re: /(\d+)-day free trial/gi, to: () => `${facts.trial.days}-day free trial` },
  { re: /(\d+)-day trial/gi, to: () => `${facts.trial.days}-day trial` },
  { re: /free for (\d+) days/gi, to: () => `free for ${facts.trial.days} days` },
]

/** Regenerate the landing page PRICE_TABLE literal from content/facts.json. */
function regenPriceTable(text, onEdit) {
  const found = extractPriceTable(text)
  if (found === null) return text
  const want = renderPriceTable()
  if (found.body === want) return text
  onEdit()
  return text.slice(0, found.start) + '\n' + want + '\n      ' + text.slice(found.end)
}

/**
 * JSON-LD offer prices ARE unambiguous, unlike prose, so unlike "$2.99/month"
 * they get repaired automatically. The `"name"` field states which plan the
 * offer is for, so there is exactly one correct amount and no interval to guess.
 */
function fixJsonLdOffers(text, onEdit) {
  return text.replace(JSONLD_OFFER_RE, (match, head, planName, amount, tail) => {
    const want = expectedOfferPrice(planName)
    if (want === null || amount === want) return match
    onEdit()
    return `${head}${want}${tail}`
  })
}

const files = [...new Set(TARGET_GLOBS.flatMap((p) => globSync(p, { cwd: ROOT })))].sort()

let changedFiles = 0
let totalEdits = 0

for (const file of files) {
  const path = join(ROOT, file)
  const before = readFileSync(path, 'utf8')
  let after = before
  let edits = 0

  after = fixJsonLdOffers(after, () => { edits++ })
  after = regenPriceTable(after, () => { edits++ })

  for (const { re, to } of SUBS) {
    after = after.replace(re, (match) => {
      const want = to()
      if (match === want) return match
      edits++
      return want
    })
  }

  if (edits > 0) {
    totalEdits += edits
    changedFiles++
    console.log(`${DRY ? 'would fix' : 'fixed'}  ${file}  (${edits})`)
    if (!DRY) writeFileSync(path, after)
  }
}

console.log(
  totalEdits === 0
    ? `facts: already in sync across ${files.length} files`
    : `\n${DRY ? 'Would change' : 'Changed'} ${totalEdits} value${totalEdits === 1 ? '' : 's'} in ${changedFiles} file${changedFiles === 1 ? '' : 's'}.`
)
