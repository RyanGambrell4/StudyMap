/**
 * find-em-dashes - report em dashes in user-facing copy only.
 *
 *   npm run find:emdash
 *
 * The house rule is "no em dashes in copy". It is NOT "no em dashes in the
 * repository": they are fine and often clearer inside code comments, which no
 * student ever reads. A blind global replace would churn thousands of comment
 * lines and bury the handful of real hits, so this strips comments first and
 * only reports what survives.
 *
 * Comment stripping is a scanner, not a parser. It tracks whether it is inside
 * a line comment, a block comment, or a string, so an em dash in a comment is
 * dropped while `"a — b"` on the same line is kept. It does not understand
 * regex literals containing quotes, which is the one place it could misjudge;
 * that is called out in the output rather than silently trusted.
 *
 * Exit code is always 0. This is a report, not a gate: some hits are inside
 * data passed to an API rather than shown on screen, and a human has to judge.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] ?? '.'
const SRC = join(ROOT, 'src')
const EXTS = ['.js', '.jsx', '.ts', '.tsx']
const EM = '—'

/** Returns the line with comment spans blanked out, preserving column numbers. */
function stripComments(line, state) {
  let out = ''
  let i = 0
  while (i < line.length) {
    const c = line[i]
    const next = line[i + 1]

    if (state.inBlock) {
      if (c === '*' && next === '/') { state.inBlock = false; out += '  '; i += 2; continue }
      out += ' '
      i++
      continue
    }

    if (state.inString) {
      out += c
      if (c === '\\') { out += line[i + 1] ?? ''; i += 2; continue }
      if (c === state.quote) { state.inString = false; state.quote = null }
      i++
      continue
    }

    if (c === '/' && next === '/') { out += ' '.repeat(line.length - i); break }
    if (c === '/' && next === '*') { state.inBlock = true; out += '  '; i += 2; continue }

    if (c === '"' || c === "'" || c === '`') {
      state.inString = true
      state.quote = c
      out += c
      i++
      continue
    }

    out += c
    i++
  }
  return out
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (EXTS.some(e => entry.endsWith(e))) acc.push(full)
  }
  return acc
}

const hits = []
for (const file of walk(SRC)) {
  const state = { inBlock: false, inString: false, quote: null }
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, idx) => {
    // A line whose em dashes all sit in a comment is not a copy problem.
    const code = stripComments(line, state)
    // An apostrophe in JSX text ("you'll") looks exactly like an opening quote
    // to a scanner. Left alone it would swallow the rest of the file and stop
    // comments being stripped at all. Only template literals legally span
    // lines, so anything else still open at the newline was never a string.
    if (state.inString && state.quote !== '`') { state.inString = false; state.quote = null }
    if (!code.includes(EM)) return
    hits.push({ file: relative(ROOT, file), line: idx + 1, text: line.trim() })
  })
}

if (hits.length === 0) {
  console.log('No em dashes in copy.')
} else {
  const byFile = new Map()
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, [])
    byFile.get(h.file).push(h)
  }
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [file, list] of sorted) {
    console.log(`\n${file}  (${list.length})`)
    for (const h of list) {
      console.log(`  ${String(h.line).padStart(5)}  ${h.text.slice(0, 150)}`)
    }
  }
  console.log(`\n${hits.length} em dashes outside comments, in ${byFile.size} files.`)
  console.log('Not all are on-screen copy. Check each before changing it.')
}
