#!/usr/bin/env node
/**
 * repairInternalLinks.mjs — give under-linked pages a route in from related pages
 *
 * Why: median inbound internal links across the static pages is 6, but 8
 * indexable pages have zero and 48 have two or fewer. GSC confirms the cost —
 * pages Google has discovered but never crawled, and pages crawled once in
 * June and never revisited. On a crawl-rationed domain an orphan is
 * functionally invisible no matter how good it is.
 *
 * Approach: for each starved page, find topically related donor pages that
 * already carry a `related-links` section and add one link there. Donors are
 * scored on slug-token overlap, so links land next to genuinely related content
 * rather than being sprayed sitewide. Both caps below exist to keep this from
 * degenerating into a link farm:
 *
 *   MAX_NEW_INBOUND — a starved page gains at most this many new links
 *   MAX_BLOCK_LINKS — a donor's related block never grows past this size
 *
 * Pages already at or above HEALTHY_INBOUND are left alone.
 *
 * Usage:
 *   node scripts/repairInternalLinks.mjs --dry-run
 *   node scripts/repairInternalLinks.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = resolve(ROOT, 'public')

const HEALTHY_INBOUND = 3   // at/above this, a page is not starved
const MAX_NEW_INBOUND = 3   // new links added per starved page
const MAX_BLOCK_LINKS = 8   // ceiling on any one related-links block
const DRY = process.argv.includes('--dry-run')

const STOP = new Set(['best', 'study', 'app', 'for', 'students', 'the', 'a', 'to', 'how', 'what',
  'do', 'you', 'need', 'is', 'and', 'of', 'in', 'with', 'your', 'blog', 'gpa', 'good'])

const files = []
for (const f of readdirSync(PUB)) if (f.endsWith('.html')) files.push(resolve(PUB, f))
for (const f of readdirSync(resolve(PUB, 'blog'))) if (f.endsWith('.html')) files.push(resolve(PUB, 'blog', f))

const slugOf = (file) => (file.includes('/blog/') ? 'blog/' : '') + basename(file, '.html')
const pathOf = (file) => '/' + slugOf(file)
const read = (f) => readFileSync(f, 'utf8')

/** Tokens used for topical matching. Stopwords stripped so "biology" outweighs "study". */
const tokens = (slug) => new Set(
  slug.replace(/^blog\//, '').split(/[-/]/).filter((t) => t && !STOP.has(t) && t.length > 2)
)

/**
 * Slug tokens alone are too naive for semantic relatedness: the top asset,
 * /blog/retrieval-practice-vs-rereading, shares no slug token with
 * spaced-repetition-study-technique despite being its closest neighbour. So a
 * second tier scores donors on distinctive body terms instead.
 *
 * "Distinctive" = frequent on this page but rare across the corpus, which is
 * TF-IDF in spirit. Cheap version: drop terms appearing on >25% of pages, which
 * removes both English stopwords and this site's boilerplate in one pass.
 */
const BODY_STOP = new Set(['study', 'students', 'studyedge', 'college', 'learning', 'time', 'help',
  'make', 'work', 'need', 'best', 'more', 'your', 'this', 'that', 'with', 'from', 'they', 'them',
  'have', 'will', 'what', 'when', 'which', 'about', 'each', 'into', 'than', 'then', 'also', 'been'])

function bodyTerms(html) {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
  const freq = new Map()
  for (const w of text.match(/[a-z]{4,}/g) || []) {
    if (BODY_STOP.has(w) || STOP.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  return freq
}

const page = new Map()
for (const f of files) {
  const html = read(f)
  const slug = slugOf(f)
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? slug)
    .replace(/<[^>]+>/g, '').replace(/\s*[|·]\s*StudyEdge AI.*$/i, '').replace(/\s+/g, ' ').trim()
  page.set(slug, {
    file: f, slug, html, title,
    noindex: /noindex/i.test(html),
    hasBlock: /class="related-links"/.test(html),
    tokens: tokens(slug),
    freq: bodyTerms(html),
  })
}

// Corpus document-frequency, used to discard boilerplate before similarity.
const df = new Map()
for (const p of page.values()) for (const w of p.freq.keys()) df.set(w, (df.get(w) ?? 0) + 1)
const CORPUS_MAX = page.size * 0.25
for (const p of page.values()) {
  p.top = new Set(
    [...p.freq.entries()]
      .filter(([w]) => (df.get(w) ?? 0) <= CORPUS_MAX)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([w]) => w)
  )
}

/** Jaccard over distinctive body terms. 0..1; ~0.15+ is a genuine topical neighbour. */
function bodySim(a, b) {
  let inter = 0
  for (const w of a.top) if (b.top.has(w)) inter++
  const union = a.top.size + b.top.size - inter
  return union ? inter / union : 0
}

/** Count inbound internal links, resolving both /slug and /slug.html forms. */
function inboundCounts() {
  const c = new Map([...page.keys()].map((s) => [s, 0]))
  const sources = [...files, resolve(ROOT, 'index.html')]
  for (const f of sources) {
    const from = f.endsWith('index.html') && !f.includes('/public/') ? '__home__' : slugOf(f)
    const seen = new Set()
    for (const m of read(f).matchAll(/href="\/([a-zA-Z0-9\-/]+?)(?:\.html)?"/g)) {
      const t = m[1].replace(/\/$/, '')
      if (page.has(t) && t !== from) seen.add(t)
    }
    for (const t of seen) c.set(t, c.get(t) + 1)
  }
  return c
}

const before = inboundCounts()

// /blog/index.html is served at /blog and is linked as href="/blog" by 73 posts,
// so the raw counter scores it 0. It is a hub, not an orphan. The author and
// editorial-policy pages are real E-E-A-T assets but belong in the blog hub's
// own navigation rather than in topical related-links blocks, so they are
// handled by linkEeatFromHub() below instead of the donor search.
const NOT_TARGETS = new Set(['blog/index', 'blog/author', 'blog/editorial-policy'])

const starved = [...page.values()]
  .filter((p) => !p.noindex && !NOT_TARGETS.has(p.slug) && before.get(p.slug) < HEALTHY_INBOUND)
  .sort((a, b) => before.get(a.slug) - before.get(b.slug))

/**
 * Surface the two trust pages from the blog hub. Google's helpful-content
 * guidance leans on author identity and editorial standards being reachable;
 * right now neither is linked from anywhere, so neither is being counted.
 */
function linkEeatFromHub() {
  const hub = page.get('blog/index')
  if (!hub) return 0
  const wanted = [
    { href: '/blog/author', title: 'About the author' },
    { href: '/blog/editorial-policy', title: 'Editorial policy' },
  ].filter((l) => !new RegExp(`href="${l.href}"`).test(hub.html))
  if (!wanted.length) return 0

  const nav = wanted.map((l) => `<a href="${l.href}">${l.title}</a>`).join('\n        ')
  const updated = hub.html.replace(
    /<\/main>|<footer/i,
    (m) => `<p class="blog-trust-links" style="margin:32px 0 0;font-size:14px;color:#5C5952">\n        ${nav}\n      </p>\n  ${m}`
  )
  if (updated === hub.html) { console.log('  WARN could not place E-E-A-T links in /blog'); return 0 }
  if (!DRY) writeFileSync(hub.file, updated)
  console.log(`  ${DRY ? 'would link' : 'linked'} ${wanted.length} trust page(s) from /blog`)
  return wanted.length
}

console.log(`pages: ${page.size}  |  starved (<${HEALTHY_INBOUND} inbound, indexable): ${starved.length}`)
console.log(`  of which orphans (0 inbound): ${starved.filter((p) => before.get(p.slug) === 0).length}`)

const pending = new Map()   // donor slug -> [{href,title}]
const added = []

for (const target of starved) {
  const eligible = [...page.values()]
    .filter((d) => d.slug !== target.slug && d.hasBlock && !d.noindex)
    .filter((d) => !new RegExp(`href="/${target.slug}(\\.html)?"`).test(d.html))
    .filter((d) => (pending.get(d.slug)?.length ?? 0) + (d.html.match(/<li><a href="\//g)?.length ?? 0) < MAX_BLOCK_LINKS)

  // Tier 1: shared slug tokens — precise, prefer these.
  let donors = eligible
    .map((d) => {
      let score = 0
      for (const t of target.tokens) if (d.tokens.has(t)) score++
      if (d.slug.startsWith('blog/') === target.slug.startsWith('blog/')) score += 0.5
      return { d, score, how: 'slug' }
    })
    .filter((x) => x.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NEW_INBOUND)

  // Tier 2: body-term similarity, for pages whose slug shares no vocabulary
  // with its neighbours (the retrieval-practice case).
  if (donors.length < MAX_NEW_INBOUND) {
    const taken = new Set(donors.map((x) => x.d.slug))
    const extra = eligible
      .filter((d) => !taken.has(d.slug))
      .map((d) => ({ d, score: bodySim(target, d), how: 'body' }))
      .filter((x) => x.score >= 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NEW_INBOUND - donors.length)
    donors = donors.concat(extra)
  }

  for (const { d, how } of donors) {
    if (!pending.has(d.slug)) pending.set(d.slug, [])
    pending.get(d.slug).push({ href: `/${target.slug}`, title: target.title })
    added.push({ from: d.slug, to: target.slug, how })
  }
  if (!donors.length) console.log(`  no donor found: /${target.slug}  (inbound ${before.get(target.slug)})`)
}

console.log(`\nlinks to add: ${added.length} across ${pending.size} donor pages`)

let written = 0
for (const [donorSlug, links] of pending) {
  const p = page.get(donorSlug)
  const items = links.map((l) => `      <li><a href="${l.href}">${l.title}</a></li>`).join('\n')
  const updated = p.html.replace(
    /(<section class="related-links"[\s\S]*?<ul[^>]*>)([\s\S]*?)(<\/ul>)/,
    (_m, open, body, close) => `${open}${body.replace(/\s*$/, '')}\n${items}\n    ${close}`
  )
  if (updated === p.html) { console.log(`  WARN could not splice block: /${donorSlug}`); continue }
  if (!DRY) writeFileSync(p.file, updated)
  written++
}

linkEeatFromHub()
console.log(`${DRY ? 'would update' : 'updated'} ${written} donor pages`)

if (!DRY) {
  const after = inboundCounts()
  const stillStarved = [...page.keys()].filter((s) => !page.get(s).noindex && after.get(s) < HEALTHY_INBOUND)
  const stillOrphan = [...page.keys()].filter((s) => !page.get(s).noindex && after.get(s) === 0)
  console.log(`\nafter: starved ${starved.length} -> ${stillStarved.length}  |  orphans -> ${stillOrphan.length}`)
  if (stillOrphan.length) console.log('  remaining orphans:', stillOrphan.map((s) => '/' + s).join(', '))
}
