// Shared by scripts/sync-law-medians.mjs and src/lib/lawSchoolMedians.test.js.
// Turns content/law-school-medians.json (ABA Standard 509 data) into the flat
// key -> display string map that pages reference with <span data-law="key">.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_PATH = path.join(ROOT, 'content', 'law-school-medians.json')

// Pages that talk about law school GPA medians. The guard test scans every one,
// whether or not it currently has data-law spans.
export const LAW_PAGES = [
  'grad-school-gpa-requirements.html',
  'gpa-requirements.html',
  'what-gpa-do-you-need-for-law-school-admissions.html',
  'is-a-2-0-gpa-good.html', 'is-a-2-5-gpa-good.html', 'is-a-3-0-gpa-good.html',
  'is-a-3-2-gpa-good.html', 'is-a-3-3-gpa-good.html', 'is-a-3-4-gpa-good.html',
  'is-a-3-5-gpa-good.html', 'is-a-3-6-gpa-good.html', 'is-a-3-7-gpa-good.html',
  'is-a-3-8-gpa-good.html',
  'best-study-app-for-university-of-arizona-students.html',
  'best-study-app-for-university-of-rochester-students.html',
]

export function loadData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
}

const gpa = x => x.toFixed(2)

// Median of a sorted array.
function median(sorted) {
  const n = sorted.length
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

export function buildValues(data = loadData()) {
  const v = { year: String(data.report_year), class: data.entering_class }
  const bySlug = Object.fromEntries(data.schools.map(s => [s.slug, s]))
  for (const s of data.schools) {
    if (s.name) v[`${s.slug}.name`] = s.name
    for (const k of ['gpa25', 'gpa50', 'gpa75']) if (s[k] != null) v[`${s.slug}.${k}`] = gpa(s[k])
    for (const k of ['lsat25', 'lsat50', 'lsat75']) if (s[k] != null) v[`${s.slug}.${k}`] = String(s[k])
  }
  const t14 = data.t14.map(slug => bySlug[slug])
  const lo = t14.reduce((a, b) => (b.gpa50 < a.gpa50 ? b : a))
  const hi = t14.reduce((a, b) => (b.gpa50 > a.gpa50 ? b : a))
  Object.assign(v, {
    't14.gpa50.min': gpa(lo.gpa50), 't14.gpa50.minSchool': lo.name,
    't14.gpa50.max': gpa(hi.gpa50), 't14.gpa50.maxSchool': hi.name,
    't14.lsat50.min': String(Math.min(...t14.map(s => s.lsat50))),
    't14.lsat50.max': String(Math.max(...t14.map(s => s.lsat50))),
  })
  // National picture: every school's median GPA, then the median of those and
  // the middle half (quartiles taken as the medians of the lower and upper halves).
  const meds = data.schools.map(s => s.gpa50).filter(x => x != null).sort((a, b) => a - b)
  const half = Math.floor(meds.length / 2)
  Object.assign(v, {
    'all.count': String(meds.length),
    'all.gpa50.median': gpa(median(meds)),
    'all.gpa50.q1': gpa(median(meds.slice(0, half))),
    'all.gpa50.q3': gpa(median(meds.slice(meds.length - half))),
  })
  return v
}

const SPAN = /(<span data-law="([^"]+)">)([^<]*)(<\/span>)/g

// Returns { html, changed, unknown } with every data-law span set to its value.
export function syncHtml(html, values) {
  const unknown = []
  let changed = 0
  const out = html.replace(SPAN, (m, open, key, cur, close) => {
    if (!(key in values)) { unknown.push(key); return m }
    if (cur !== values[key]) changed++
    return open + values[key] + close
  })
  return { html: out, changed, unknown }
}
