#!/usr/bin/env node
/**
 * Transpile the landing page's JSX at build time instead of in the browser.
 *
 * The landing page ships React as three <script> tags from unpkg, the third
 * being @babel/standalone: 654 KB gzipped, 3.1 MB parsed, on the critical path
 * of every single visit. It exists only to turn the page's 89 KB of JSX into
 * React.createElement calls, which is work a build can do once instead of work
 * every visitor's phone does on every load.
 *
 * Until it finishes, #root still holds the .seo-prerender block, so the visitor
 * sits looking at raw unstyled HTML. That is the flash you see when you click
 * through from a search result. Moving the transpile here removes 89% of the
 * critical path and most of the flash with it.
 *
 * WHY THE OUTPUT IS SAFE
 *
 * This runs @babel/standalone at the SAME version the browser was loading
 * (7.29.0, pinned in devDependencies), through the SAME presets the browser
 * applies to a <script type="text/babel"> tag with no data-presets attribute.
 * Those defaults are ["react", "env"] -- not documented, but present verbatim
 * in the shipped bundle, so this is replication rather than reinterpretation.
 * Same compiler, same options, same output; only the timing moves.
 *
 * WHY IT ONLY TOUCHES dist/
 *
 * index.html at the repo root stays a plain file you can open in a browser.
 * Local dev keeps using Babel-in-browser, no build step needed to see a change.
 * The fast path is a property of what gets deployed, not of what gets edited.
 *
 * Every failure here is fatal. A landing page that silently ships an empty
 * <script> is worse than one that is merely slow, so anything unexpected stops
 * the build rather than degrading quietly.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Babel from '@babel/standalone'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = resolve(ROOT, 'dist/index.html')

// The defaults @babel/standalone applies to a script tag carrying no
// data-presets attribute. Changing these changes what visitors execute.
const PRESETS = ['react', 'env']

const BABEL_CDN = /\s*<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]*"><\/script>/
const BABEL_BLOCK = /<script\s+type="text\/babel"\s*>([\s\S]*?)<\/script>/

const die = (msg) => {
  console.error(`\nprecompileLanding: ${msg}\n`)
  process.exit(1)
}

if (!existsSync(TARGET)) die(`no dist/index.html -- run vite build first`)

let html = readFileSync(TARGET, 'utf8')

const blocks = html.match(new RegExp(BABEL_BLOCK.source, 'g')) || []
if (blocks.length === 0) die('found no <script type="text/babel"> block to compile')
if (blocks.length > 1) {
  die(`found ${blocks.length} text/babel blocks; this script assumes exactly one`)
}
if (!BABEL_CDN.test(html)) die('found the JSX block but not the @babel/standalone tag that compiles it')

const jsx = html.match(BABEL_BLOCK)[1]
if (jsx.trim().length < 1000) die(`the JSX block is only ${jsx.trim().length} chars, which is not the landing page`)

let compiled
try {
  compiled = Babel.transform(jsx, { presets: PRESETS, sourceType: 'script' }).code
} catch (err) {
  die(`Babel failed on the landing page JSX:\n${err.message}`)
}

if (!compiled || compiled.trim().length === 0) die('Babel returned empty output')
if (/<[A-Za-z][^>]*\/?>/.test(compiled.slice(0, 4000)) && !compiled.includes('createElement')) {
  die('output still looks like JSX -- the react preset did not run')
}
if (!compiled.includes('createElement')) die('output contains no createElement calls, so no JSX was compiled')

// Inline </script> inside a string literal would close the tag early and shatter
// the document. Babel emits none today; the guard is for the day someone adds one.
if (compiled.includes('</script')) die('compiled output contains a literal </script> and cannot be inlined safely')

html = html.replace(BABEL_CDN, '')
html = html.replace(BABEL_BLOCK, () => `<script>\n${compiled}\n</script>`)

if (html.includes('text/babel')) die('a text/babel reference survived the rewrite')
if (/@babel\/standalone/.test(html)) die('an @babel/standalone reference survived the rewrite')
if (!html.includes('createElement')) die('the rewritten document lost the compiled script')

writeFileSync(TARGET, html)

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(
  `precompileLanding: compiled ${kb(jsx.length)} of JSX -> ${kb(compiled.length)} of JS, ` +
  `dropped @babel/standalone (654 KB gzipped) from the critical path`
)
