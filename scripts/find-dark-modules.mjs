/**
 * Lists every module under src/ that nothing else imports.
 *
 * Written because three separate finished features had shipped to nobody for
 * exactly this reason: the file existed, was correct, and was referenced by
 * no one. Nothing errors in that state, so it is invisible without a check
 * like this one.
 *
 *   node find-dark.mjs <repo-root>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname, extname } from 'node:path'

const ROOT = resolve(process.argv[2] ?? '.')
const SRC = join(ROOT, 'src')

// Entry points are reachable by definition, not via an import statement.
const ENTRIES = new Set(['src/main.jsx', 'src/sw.js'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')

// Every specifier that appears in a static import, dynamic import, or require.
const SPEC = /(?:import\s[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const importedBy = new Map(files.map((f) => [rel(f), new Set()]))

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null            // package, not local
  const base = resolve(dirname(fromFile), spec)
  const candidates = extname(base)
    ? [base]
    : ['.js', '.jsx', '.ts', '.tsx'].flatMap((e) => [base + e, join(base, 'index' + e)])
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return rel(c) } catch { /* next candidate */ }
  }
  return null
}

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(SPEC)) {
    const target = resolveSpec(file, m[1])
    if (target && importedBy.has(target)) importedBy.get(target).add(rel(file))
  }
}

const dark = [...importedBy.entries()]
  .filter(([f, importers]) => importers.size === 0 && !ENTRIES.has(f))
  .map(([f]) => f)
  .sort()

if (!dark.length) {
  console.log('No unreferenced modules. Everything under src/ is reachable.')
} else {
  console.log(`${dark.length} module(s) that nothing imports:\n`)
  for (const f of dark) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n').length
    console.log(`  ${String(lines).padStart(5)} lines   ${f}`)
  }
}
