// Every URL in public/sitemap.xml must reach a real file on Vercel. Top-level pages need an
// explicit rewrite in vercel.json (there is no cleanUrls), so a new page without one 404s on
// its clean URL even though the build succeeds. This caught /gpa-raise-calculator in 2026-10.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const sitemap = fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8')
const locs = [...sitemap.matchAll(/<loc>https:\/\/getstudyedge\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/')

function resolve(p) {
  if (p === '/' || p === '') return 'index.html'
  for (const r of vercel.rewrites || []) {
    const re = new RegExp('^' + r.source.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$')
    const m = p.match(re)
    if (m) return r.destination.replace(/:(\w+)/g, (_, k) => m.groups[k]).replace(/^\//, '')
  }
  return p.replace(/^\//, '')
}

describe('sitemap URLs resolve to files', () => {
  it.each(locs)('%s', loc => {
    const p = loc.replace(/\/$/, '') || '/'
    const file = resolve(p)
    const candidates = [file, path.join(file, 'index.html')]
    const ok = candidates.some(f => fs.existsSync(path.join(root, 'public', f)) || (f === 'index.html' && fs.existsSync(path.join(root, 'index.html'))))
    expect(ok, `${loc} -> ${file}`).toBe(true)
  })
})
