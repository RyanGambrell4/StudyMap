#!/usr/bin/env node
/**
 * assertNoHiddenContent.mjs — fail the build if a page hides real content.
 *
 * Why this exists: on 2026-04-18 the homepage gained a .seo-prerender block
 * holding a full duplicate of the page (its own H1, its own body copy) styled
 * position:absolute, 1x1px, clip:rect(0,0,0,0). React destroys that container
 * on mount, so no human ever saw it. Googlebot read it. What the crawler read
 * and what a user saw were different documents, which is cloaking, and on
 * 2026-08-29 the homepage lost its position for our own brand name. Every other
 * URL on the site held. One page carried the pattern, one page was demoted.
 *
 * It survived four months of review because it looks like ordinary CSS. The
 * clip-rect pattern is the standard "visually hidden" utility, correct and
 * encouraged for screen-reader text: a skip link, a label on an icon button.
 * Nobody blinks at it. The bug was not the technique, it was wrapping an entire
 * page of marketing copy in it and aiming that at a crawler.
 *
 * A human reviewer cannot reliably catch that, because the diff looks fine. So
 * this runs on every build instead:
 *
 *   - a hidden subtree containing a heading            -> always a failure
 *   - a hidden subtree over MAX_HIDDEN_WORDS words     -> a failure
 *   - short hidden text                                -> allowed, that is a11y
 *
 * The line between "screen-reader label" and "cloaking" is length and
 * structure, so that is exactly what gets measured.
 *
 * Usage:
 *   node scripts/assertNoHiddenContent.mjs           # scan shipped HTML
 *   node scripts/assertNoHiddenContent.mjs --json    # machine-readable
 *   node scripts/assertNoHiddenContent.mjs <file...> # scan specific files
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A screen-reader label is short. A page is not. */
export const MAX_HIDDEN_WORDS = 25

/**
 * Declarations that take content out of the visual flow while leaving it in the
 * DOM for a crawler. Each is legitimate on its own, which is the whole problem.
 */
const HIDING_TESTS = [
  { name: 'clip-rect', re: /clip\s*:\s*rect\(\s*0[\s,]+0[\s,]+0[\s,]+0\s*\)/i },
  { name: 'clip-path-inset-100', re: /clip-path\s*:\s*inset\(\s*(100%|50%)\s*\)/i },
  { name: 'display-none', re: /display\s*:\s*none/i },
  { name: 'visibility-hidden', re: /visibility\s*:\s*hidden/i },
  { name: 'opacity-zero', re: /opacity\s*:\s*0(\.0+)?\s*(;|$|})/i },
  { name: 'font-size-zero', re: /font-size\s*:\s*0(px|em|rem)?\s*(;|$|})/i },
  { name: 'text-indent-offscreen', re: /text-indent\s*:\s*-\s*\d{3,}/i },
  { name: 'offscreen-position', re: /(left|top)\s*:\s*-\s*\d{4,}\s*px/i },
  // 1x1 boxes only count as hiding when paired with overflow clipping, or a
  // genuine 1px spacer div would trip this on every page that has one.
  {
    name: 'one-pixel-box',
    test: (css) =>
      /width\s*:\s*1px/i.test(css) &&
      /height\s*:\s*1px/i.test(css) &&
      /overflow\s*:\s*hidden/i.test(css),
  },
]

function hidingReason(css) {
  for (const t of HIDING_TESTS) {
    if (t.test ? t.test(css) : t.re.test(css)) return t.name
  }
  return null
}

/**
 * Declarations that bring an element back into view. A class that is hidden in
 * one rule and revealed in another is not cloaking, it is ordinary CSS:
 * `.fade-up{opacity:0}` paired with `.fade-up.in{opacity:1}` is a scroll
 * animation, and `.mobile-hero{display:none}` paired with a `display:block`
 * inside a media query is a responsive layout. Both were in this file, and
 * flagging them would have taught the next person to delete this check.
 *
 * The pattern that actually cost us the ranking looked different: .seo-prerender
 * was hidden by exactly one rule and revealed by nothing, anywhere.
 */
const REVEAL_TESTS = [
  /opacity\s*:\s*(0?\.\d*[1-9]|[1-9])/i,
  /display\s*:\s*(?!none)[a-z-]+/i,
  /visibility\s*:\s*visible/i,
  /clip\s*:\s*(auto|none|unset|initial)/i,
  /clip-path\s*:\s*none/i,
  // A transition or animation on the hiding rule itself means the hidden state
  // is a starting frame, not a resting state.
  /\b(transition|animation)\s*:/i,
]

const reveals = (css) => REVEAL_TESTS.some((re) => re.test(css))

/**
 * Strip CSS comments before anything else parses the sheet.
 *
 * Not cosmetic. The rule splitter treats everything before a `{` as the
 * selector, so a comment sitting above a rule becomes part of it. The comment
 * documenting this very check quotes `clip: rect(0,0,0,0)` in prose, and its
 * colon made isStateGated() read the following rule as state-gated and skip it.
 * A regression test caught the guard silently passing its own bug. Any comment
 * above any rule would have done the same.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * Drop `@media print` blocks. Hiding navigation and footers when a page is
 * printed is normal and has nothing to do with what a crawler sees, and the
 * printable-template page legitimately hides half its chrome that way.
 */
function stripPrintMedia(css) {
  let out = ''
  let i = 0
  const at = /@media[^{]*\bprint\b[^{]*\{/gi
  let m
  while ((m = at.exec(css))) {
    out += css.slice(i, m.index)
    let depth = 1
    let j = at.lastIndex
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
    at.lastIndex = j
  }
  return out + css.slice(i)
}

/**
 * A selector qualified by an attribute or pseudo-class describes a *state*, not
 * the element's resting style: `.calc-panel[hidden]{display:none}` hides only
 * while that attribute is present, which is how a tab panel works. Treating the
 * bare class as hidden there flagged a working GPA calculator.
 */
const isStateGated = (selector) => /[[:]/.test(selector)

/** Class selectors hidden by some rule and revealed by none. */
function hidingClasses(html) {
  const hidden = new Map()
  const revealed = new Set()
  for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = stripPrintMedia(stripComments(block[1]))
    // Naive rule split is fine here: these are hand-written style blocks, not
    // minified bundles, and a missed rule fails open rather than falsely.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = rule
      const reason = hidingReason(body)
      const isReveal = reveals(body)
      if (!reason && !isReveal) continue
      const gated = isStateGated(selector)
      for (const cls of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
        if (reason && !gated && !hidden.has(cls[1])) hidden.set(cls[1], reason)
        // Reveals still count from state selectors: `.fade-up.in{opacity:1}` is
        // exactly how a hidden class earns its way back into view.
        if (isReveal) revealed.add(cls[1])
      }
    }
  }
  for (const cls of revealed) hidden.delete(cls)
  return hidden
}

/**
 * Walk forward from an opening tag to its matching close, tracking depth so
 * nested same-name tags do not end the subtree early.
 */
function subtreeAt(html, tagName, openStart) {
  const openEnd = html.indexOf('>', openStart)
  if (openEnd === -1) return ''
  if (html[openEnd - 1] === '/') return '' // self-closing, no subtree
  const open = new RegExp(`<${tagName}\\b`, 'gi')
  const close = new RegExp(`</${tagName}\\s*>`, 'gi')
  let depth = 1
  let cursor = openEnd + 1
  while (depth > 0 && cursor < html.length) {
    open.lastIndex = cursor
    close.lastIndex = cursor
    const o = open.exec(html)
    const c = close.exec(html)
    if (!c) return html.slice(openEnd + 1)
    if (o && o.index < c.index) { depth++; cursor = o.index + 1 }
    else { depth--; cursor = c.index + (depth === 0 ? 0 : 1) }
  }
  return html.slice(openEnd + 1, cursor)
}

function visibleText(fragment) {
  let s = fragment
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Every element carrying one of the hiding classes, plus inline-hidden ones. */
function hiddenSubtrees(html, classes) {
  const out = []
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  for (const m of html.matchAll(tagRe)) {
    const [, tag, attrs] = m
    const classAttr = /(?:class|className)\s*=\s*"([^"]*)"/i.exec(attrs)
    const styleAttr = /style\s*=\s*"([^"]*)"/i.exec(attrs)

    let reason = null
    if (classAttr) {
      for (const c of classAttr[1].split(/\s+/)) {
        if (classes.has(c)) { reason = `.${c} (${classes.get(c)})`; break }
      }
    }
    if (!reason && styleAttr) {
      const r = hidingReason(styleAttr[1])
      if (r) reason = `inline style (${r})`
    }
    if (!reason) continue

    const fragment = subtreeAt(html, tag, m.index)
    const text = visibleText(fragment)
    out.push({
      tag,
      reason,
      words: text ? text.split(' ').length : 0,
      hasHeading: /<h[1-6]\b/i.test(fragment),
      line: html.slice(0, m.index).split('\n').length,
      excerpt: text.slice(0, 110),
    })
  }
  return out
}

export function scan(html) {
  return hiddenSubtrees(html, hidingClasses(html)).filter(
    (h) => h.hasHeading || h.words > MAX_HIDDEN_WORDS
  )
}

function shippedHtmlFiles() {
  const files = []
  const root = resolve(ROOT, 'index.html')
  if (existsSync(root)) files.push(root)
  const pub = resolve(ROOT, 'public')
  if (existsSync(pub)) {
    for (const f of readdirSync(pub)) {
      if (f.endsWith('.html')) files.push(resolve(pub, f))
    }
  }
  return files
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const explicit = args.filter((a) => !a.startsWith('--'))
  // Explicit paths come from a shell, so resolve them against the caller's cwd,
  // not the repo root.
  const files = explicit.length ? explicit.map((f) => resolve(process.cwd(), f)) : shippedHtmlFiles()

  const violations = []
  for (const file of files) {
    for (const v of scan(readFileSync(file, 'utf8'))) {
      violations.push({ file: relative(ROOT, file), ...v })
    }
  }

  if (json) {
    console.log(JSON.stringify({ scanned: files.length, violations }, null, 2))
  } else if (violations.length) {
    console.error(`\nHidden content found in ${violations.length} place(s).\n`)
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  <${v.tag}> hidden by ${v.reason}`)
      console.error(`    ${v.words} words${v.hasHeading ? ', contains a heading' : ''}`)
      console.error(`    "${v.excerpt}${v.excerpt.length >= 110 ? '...' : ''}"\n`)
    }
    console.error(
      'Content a crawler can read but a user cannot is cloaking, and it cost this\n' +
      'site its homepage ranking on 2026-08-29. Either make it visible, or delete\n' +
      `it. Short screen-reader labels (<= ${MAX_HIDDEN_WORDS} words, no headings) are fine.\n`
    )
  } else {
    console.log(`no hidden content in ${files.length} html file(s)`)
  }
  process.exit(violations.length ? 1 : 0)
}
