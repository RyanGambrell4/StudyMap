#!/usr/bin/env node
/**
 * hardenBrandEntity.mjs — collapse 398 Organization nodes into one entity
 *
 * The problem this solves, stated precisely: searching the brand in incognito
 * returns the competitor (studyedge.com) at organic #1 and an AI Overview that
 * describes THEIR product, sourced from THEIR Instagram. Signed into an account
 * that already knows us, Google resolves the entity correctly. So Google can
 * tell us apart when it has a prior; it just has no strong independent anchor.
 *
 * Schema is one of the few anchors we control, and ours is fragmented: 398
 * Organization nodes across the site carry no @id, so each is a separate
 * unlinked entity to a consumer. Only 6 are anchored. Publisher stubs inside
 * Article schema are the bulk of them:
 *
 *     { "@type": "Organization", "name": "StudyEdge AI" }
 *
 * Adding the canonical @id to every one makes them all references to a single
 * node rather than 398 lookalike organisations. That is the entire fix; the
 * stubs stay minimal on purpose, because the full definition should live in one
 * place and be pointed at, not copy-pasted.
 *
 * Also normalises whitespace-damaged brand strings ("Study Edge  AI" from HTML
 * line wrapping), which read as the competitor's name plus a suffix.
 *
 * Deliberately NOT touched: bare "Study Edge" in visible copy. 26 of 37
 * occurrences are legitimate references to the competitor on the disambiguation
 * pages, and rewriting those would destroy the very copy that distinguishes us.
 *
 * Usage:
 *   node scripts/hardenBrandEntity.mjs --dry-run
 *   node scripts/hardenBrandEntity.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORG_ID = 'https://getstudyedge.com/#organization'
const DRY = process.argv.includes('--dry-run')

const files = [
  ...readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, 'public', f)),
  ...readdirSync(join(ROOT, 'public/blog')).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, 'public/blog', f)),
  join(ROOT, 'index.html'),
]

let addedId = 0, fixedWs = 0, touched = 0

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let html = original

  // 1. Anchor every Organization node that lacks an @id.
  //    Only rewrites inside ld+json blocks so page copy is never affected.
  html = html.replace(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, (block, json) => {
    const patched = json.replace(/\{([^{}]*?"@type"\s*:\s*"Organization"[^{}]*?)\}/g, (node, inner) => {
      if (/"@id"\s*:/.test(inner)) return node
      addedId++
      // Insert directly after @type so the anchor reads first, and match the
      // node's own quote/space style rather than imposing a new one.
      return node.replace(/("@type"\s*:\s*"Organization")/, `$1, "@id": "${ORG_ID}"`)
    })
    return block.replace(json, patched)
  })

  // 2. Whitespace-damaged brand strings. "Study Edge  AI" and "StudyEdge  AI"
  //    come from HTML line wrapping and read as the competitor plus a suffix.
  const before = html
  html = html
    .replace(/Study\s*Edge\s{2,}AI/g, 'StudyEdge AI')
    .replace(/StudyEdge\s{2,}AI/g, 'StudyEdge AI')
    .replace(/StudyEdge\s*\n\s*(?:\n\s*)*AI/g, 'StudyEdge AI')
  if (html !== before) fixedWs++

  if (html !== original) {
    touched++
    if (!DRY) writeFileSync(file, html)
  }
}

console.log(`files scanned      : ${files.length}`)
console.log(`Organization @id added : ${addedId}`)
console.log(`whitespace-fixed files : ${fixedWs}`)
console.log(`${DRY ? 'would touch' : 'touched'}          : ${touched} files`)
