// Rewrites every <span data-law="key">…</span> on the law-median pages from
// content/law-school-medians.json. Run after updating the data for a new ABA year:
//   node scripts/sync-law-medians.mjs
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, LAW_PAGES, buildValues, syncHtml } from './law-medians-lib.mjs'

const values = buildValues()
let bad = false
for (const page of LAW_PAGES) {
  const file = path.join(ROOT, 'public', page)
  const before = fs.readFileSync(file, 'utf8')
  const { html, changed, unknown } = syncHtml(before, values)
  if (unknown.length) { bad = true; console.error(`${page}: unknown data-law keys: ${unknown.join(', ')}`) }
  if (html !== before) fs.writeFileSync(file, html)
  if (changed) console.log(`${page}: ${changed} value(s) updated`)
}
if (bad) process.exit(1)
