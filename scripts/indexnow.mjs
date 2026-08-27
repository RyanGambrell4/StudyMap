#!/usr/bin/env node
/**
 * indexnow.mjs — push URLs to the IndexNow endpoint (Bing, Yandex, Seznam, Naver)
 *
 * Why this matters here more than it usually would: Bing and Copilot are the
 * only engines citing this site's deep pages today, and IndexNow is a direct
 * "crawl this now" channel that does not depend on the crawl budget Google is
 * rationing. Google does NOT participate in IndexNow — this is a Bing play, and
 * that is exactly the point.
 *
 * PREREQUISITE: the key file must already be live at
 *   https://getstudyedge.com/<key>.txt
 * and must contain the key and nothing else. IndexNow verifies it on every
 * submission. Because public/ only ships on a deploy, submitting before the key
 * file is live gets the whole batch rejected with 403. --verify-key checks this
 * for you and the script refuses to submit if the key is not reachable.
 *
 * Usage:
 *   node scripts/indexnow.mjs --verify-key        # is the key live yet?
 *   node scripts/indexnow.mjs --dry-run           # show what would be sent
 *   node scripts/indexnow.mjs --submit            # send every sitemap URL
 *   node scripts/indexnow.mjs --submit --changed-since 2026-08-20
 *   node scripts/indexnow.mjs --submit --urls /a,/b
 *
 * Re-submitting unchanged URLs is not rewarded and at volume looks like spam,
 * so prefer --changed-since for routine runs. The full sweep is for the first
 * submission and after a structural change.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'getstudyedge.com'
const ORIGIN = `https://${HOST}`
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const MAX_BATCH = 10000   // IndexNow hard limit per request

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }

/** The key is whatever 32-hex .txt file sits in public/. Single source of truth. */
function findKey() {
  const f = readdirSync(resolve(ROOT, 'public')).find((n) => /^[0-9a-f]{8,128}\.txt$/.test(n))
  if (!f) throw new Error('no IndexNow key file in public/ (expected <hex>.txt)')
  const key = f.replace(/\.txt$/, '')
  const body = readFileSync(resolve(ROOT, 'public', f), 'utf8').trim()
  if (body !== key) throw new Error(`key file ${f} must contain exactly "${key}", found "${body}"`)
  return key
}

function sitemapUrls() {
  const xml = readFileSync(resolve(ROOT, 'public/sitemap.xml'), 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
}

/** Only URLs whose sitemap lastmod is on/after `since` — keeps routine runs honest. */
function urlsChangedSince(since) {
  const xml = readFileSync(resolve(ROOT, 'public/sitemap.xml'), 'utf8')
  const out = []
  for (const b of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const loc = b.match(/<loc>([^<]+)<\/loc>/)?.[1]
    const lm = b.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]
    if (loc && lm && lm >= since) out.push(loc)
  }
  return out
}

async function verifyKey(key) {
  const url = `${ORIGIN}/${key}.txt`
  try {
    const r = await fetch(url, { redirect: 'follow' })
    const body = (await r.text()).trim()
    if (r.ok && body === key) { console.log(`key is live and correct: ${url}`); return true }
    console.error(`key NOT usable: ${url} -> HTTP ${r.status}, body "${body.slice(0, 40)}"`)
    return false
  } catch (e) {
    console.error(`key NOT reachable: ${url} (${e.message})`)
    return false
  }
}

async function submit(key, urls) {
  let sent = 0
  for (let i = 0; i < urls.length; i += MAX_BATCH) {
    const urlList = urls.slice(i, i + MAX_BATCH)
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList }),
    })
    // 200 accepted · 202 accepted, key validation pending · 403 key invalid
    // 422 URL/host mismatch · 429 too many requests
    const txt = await res.text().catch(() => '')
    console.log(`batch ${i / MAX_BATCH + 1}: ${urlList.length} urls -> HTTP ${res.status} ${txt.slice(0, 200)}`)
    if (res.status === 200 || res.status === 202) sent += urlList.length
    else { console.error('submission rejected; stopping.'); process.exitCode = 1; break }
  }
  console.log(`\naccepted: ${sent}/${urls.length}`)
}

async function main() {
  const key = findKey()
  console.log(`key: ${key}`)

  if (has('--verify-key')) { process.exitCode = (await verifyKey(key)) ? 0 : 1; return }

  const explicit = val('--urls')
  const since = val('--changed-since')
  let urls = explicit
    ? explicit.split(',').map((u) => (u.startsWith('http') ? u : `${ORIGIN}${u.startsWith('/') ? u : `/${u}`}`))
    : since ? urlsChangedSince(since)
    : sitemapUrls()

  urls = [...new Set(urls)].filter((u) => u.startsWith(ORIGIN))
  console.log(`urls to submit: ${urls.length}${since ? `  (lastmod >= ${since})` : ''}`)
  urls.slice(0, 8).forEach((u) => console.log(`  ${u}`))
  if (urls.length > 8) console.log(`  ... and ${urls.length - 8} more`)

  if (!has('--submit')) { console.log('\nno --submit flag: nothing sent.'); return }
  if (!urls.length) { console.log('nothing to submit.'); return }

  if (!(await verifyKey(key))) {
    console.error('\nRefusing to submit: key file is not live yet. Deploy public/ first.')
    process.exitCode = 1
    return
  }
  await submit(key, urls)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
