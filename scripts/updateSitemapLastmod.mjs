#!/usr/bin/env node
/**
 * updateSitemapLastmod.mjs — write true <lastmod> values into public/sitemap.xml
 *
 * Why: every lastmod in the sitemap was a hand-set batch value. 147 URLs read
 * 2026-07-30 and 54 read 2026-06-20 regardless of when the file actually
 * changed. A sitemap whose lastmod does not move is a sitemap crawlers learn to
 * ignore, which matters most on a young domain that is already being crawl
 * rationed.
 *
 * Date resolution, best source first:
 *   1. "dateModified" in the page's JSON-LD  (172 of 327 pages have one, and it
 *      is what Google actually reads on the page, so the two should agree)
 *   2. git log -1 --format=%cs for the file  (true last content change)
 *   3. filesystem mtime                      (last resort; survives a shallow
 *                                             clone or a file git never saw)
 *
 * A lastmod is never invented for a URL whose file cannot be located, and never
 * moved forward past today. Both would be lying to a crawler.
 *
 * Usage:
 *   node scripts/updateSitemapLastmod.mjs            # rewrite in place
 *   node scripts/updateSitemapLastmod.mjs --check    # exit 1 if stale, write nothing
 *   node scripts/updateSitemapLastmod.mjs --dry-run  # print the diff only
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITEMAP = resolve(ROOT, 'public/sitemap.xml')
const ORIGIN = 'https://getstudyedge.com'
const TODAY = new Date().toISOString().slice(0, 10)

const args = new Set(process.argv.slice(2))
const CHECK = args.has('--check')
const DRY = args.has('--dry-run')

/** Map a sitemap <loc> back to the file on disk that serves it. */
function fileFor(loc) {
  let p = loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) : loc
  p = p.split(/[?#]/)[0].replace(/\/+$/, '')
  if (p === '') return resolve(ROOT, 'index.html')       // homepage is repo-root
  const rel = p.replace(/^\//, '')
  for (const cand of [`public/${rel}.html`, `public/${rel}/index.html`, `public/${rel}`]) {
    const abs = resolve(ROOT, cand)
    if (existsSync(abs) && statSync(abs).isFile()) return abs
  }
  return null
}

/**
 * Pull dateModified out of JSON-LD. Deliberately a scan of the ld+json blocks
 * rather than a full parse: several pages carry more than one graph and a few
 * have trailing-comma JSON that JSON.parse rejects but Google still reads.
 */
function dateFromJsonLd(file) {
  const html = readFileSync(file, 'utf8')
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []
  const found = []
  for (const b of blocks) {
    for (const m of b.matchAll(/"dateModified"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})/g)) found.push(m[1])
  }
  return found.length ? found.sort().at(-1) : null   // newest wins on multi-graph pages
}

function dateFromGit(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch { return null }
}

const dateFromMtime = (file) => statSync(file).mtime.toISOString().slice(0, 10)

function main() {
  if (!existsSync(SITEMAP)) { console.error(`missing ${SITEMAP}`); process.exit(2) }
  const xml = readFileSync(SITEMAP, 'utf8')

  const stats = { total: 0, jsonld: 0, git: 0, mtime: 0, unresolved: 0, changed: 0, clamped: 0 }
  const changes = []
  const unresolved = []

  // Rewrite each <url> block independently so <loc> and its sibling <lastmod>
  // stay paired even when blocks carry xhtml:link alternates between them.
  const out = xml.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
    if (!loc) return block
    stats.total++

    const file = fileFor(loc)
    if (!file) { stats.unresolved++; unresolved.push(loc); return block }

    let date = dateFromJsonLd(file)
    if (date) stats.jsonld++
    else if ((date = dateFromGit(file))) stats.git++
    else { date = dateFromMtime(file); stats.mtime++ }

    // Never claim a page changed in the future.
    if (date > TODAY) { date = TODAY; stats.clamped++ }

    const current = block.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1]
    if (current === date) return block

    stats.changed++
    changes.push({ loc: loc.replace(ORIGIN, '') || '/', from: current ?? '(none)', to: date })

    return current !== undefined
      ? block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`)
      : block.replace(/(<loc>[^<]+<\/loc>)/, `$1\n    <lastmod>${date}</lastmod>`)
  })

  console.log(`sitemap URLs      : ${stats.total}`)
  console.log(`  from JSON-LD    : ${stats.jsonld}`)
  console.log(`  from git        : ${stats.git}`)
  console.log(`  from mtime      : ${stats.mtime}`)
  console.log(`  unresolved      : ${stats.unresolved}${stats.unresolved ? '  (left untouched)' : ''}`)
  if (stats.clamped) console.log(`  clamped to today: ${stats.clamped}`)
  console.log(`lastmod changed   : ${stats.changed}`)

  for (const c of changes.slice(0, 15)) console.log(`    ${c.from} -> ${c.to}  ${c.loc}`)
  if (changes.length > 15) console.log(`    ... and ${changes.length - 15} more`)
  for (const u of unresolved.slice(0, 10)) console.log(`    UNRESOLVED  ${u}`)

  if (CHECK) {
    if (stats.changed) { console.error(`\n${stats.changed} stale lastmod values. Run: npm run sitemap:lastmod`); process.exit(1) }
    console.log('\nsitemap lastmod is current.'); return
  }
  if (DRY) { console.log('\n--dry-run: nothing written.'); return }

  writeFileSync(SITEMAP, out)
  console.log(`\nwrote ${SITEMAP}`)
}

main()
