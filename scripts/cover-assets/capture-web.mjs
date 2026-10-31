#!/usr/bin/env node
/*
 * Capture desktop web-app screens for the product-shot covers.
 *
 * Source: the component harness in harness/ (real React components, fixture data, network
 * modules stubbed; no session, no Supabase, no real user data). Start it first:
 *   npx vite --config harness/vite.harness.config.js
 * then:
 *   node scripts/cover-assets/capture-web.mjs
 *
 * Writes 2x PNGs to scripts/cover-assets/screens/web-*.png using headless Chrome.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screens')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = {
  'web-gradehub': 'http://localhost:5199/?state=2a&w=1280',
  'web-review': 'http://localhost:5199/review-queue.html?state=due&w=1280',
}
for (const [name, url] of Object.entries(SHOTS)) {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=1280,800', '--virtual-time-budget=20000', `--screenshot=${path.join(OUT, name + '.png')}`, url], { stdio: 'ignore' })
  console.log('captured', name)
}
