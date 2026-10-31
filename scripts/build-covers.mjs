#!/usr/bin/env node
/*
 * Cover generator: one unique 1200x630 cover per blog post and SEO page, rendered from
 * code (satori lays out, sharp rasterises). No stock photos, no AI images.
 *
 *   node scripts/build-covers.mjs --samples      6 samples into docs/cover-samples/ (for review)
 *   node scripts/build-covers.mjs --only <slug>  render one page
 *   node scripts/build-covers.mjs                every page: render (only new or changed) into
 *                                                public/covers/ and wire into the HTML
 *   node scripts/build-covers.mjs --force        re-render everything
 *
 * Three templates, picked from the page slug:
 *   number     GPA and stat pages. The number is parsed from the page itself; if no number
 *              can be found on the page, the page falls back to the editorial template
 *              rather than inventing one.
 *   product    App, feature and comparison pages. Uses real StudyEdge AI screens cropped
 *              from the build 22 App Store set (iOS simulator, UI-test fixture data: the
 *              "Econ" course and "Elasticity" session; no real user data). Crops live in
 *              scripts/cover-assets/screens/.
 *   editorial  Everything else. Serif headline plus one line icon from the small set below,
 *              in one of three layouts chosen by slug so covers do not all look the same.
 *
 * Design rules: light background, StudyEdge blue (#3452D9) as the only accent, Source
 * Serif 4 headlines like the blog, no gradients, no dark backgrounds, no glow.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import satori from 'satori'
import sharp from 'sharp'
import crypto from 'node:crypto'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1200, H = 630
const C = { bg: '#FBFAF7', ink: '#1C1B18', muted: '#5C5952', dim: '#8A877F', blue: '#3452D9', blueBg: '#E9EDFB', rule: '#E6E3DC', track: '#E8E6E0' }

const font = (pkg, file) => fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file))
const FONTS = [
  { name: 'Serif', data: font('source-serif-4', 'source-serif-4-latin-600-normal.woff'), weight: 600, style: 'normal' },
  { name: 'Serif', data: font('source-serif-4', 'source-serif-4-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'Sans', data: font('inter', 'inter-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'Sans', data: font('inter', 'inter-latin-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Sans', data: font('inter', 'inter-latin-600-normal.woff'), weight: 600, style: 'normal' },
]
const dataUri = (p, mime = 'image/png') => `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`
const LOGO = dataUri(path.join(ROOT, 'public', 'favicon.png'))
// Product shots use the web app in a browser window while the iOS app is "coming soon".
// scripts/ios-launch-switch.py flips this to 'phone' on App Store launch day.
const PRODUCT_DEVICE = process.env.COVER_DEVICE || 'browser'
const SCREENS = {
  // web: captured by scripts/cover-assets/capture-web.mjs from the harness (fixture data)
  'web-review': dataUri(path.join(ROOT, 'scripts', 'cover-assets', 'screens', 'web-review.png')),
  'web-gradehub': dataUri(path.join(ROOT, 'scripts', 'cover-assets', 'screens', 'web-gradehub.png')),
  // phone: cropped from the build 22 App Store set (UI-test fixture data)
  today: dataUri(path.join(ROOT, 'scripts', 'cover-assets', 'screens', 'today.png')),
  session: dataUri(path.join(ROOT, 'scripts', 'cover-assets', 'screens', 'session.png')),
  coach: dataUri(path.join(ROOT, 'scripts', 'cover-assets', 'screens', 'coach.png')),
}

// tiny hyperscript for satori
const h = (type, style = {}, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter(c => c !== null && c !== false && c !== undefined) } })
const img = (src, style) => ({ type: 'img', props: { src, style } })

// ── Line icon set: 24x24 grid, 1.75 stroke, round caps. Drawn for this generator. ─────────
const ICONS = {
  timer: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 13V9', 'M10 2h4', 'M12 2v3', 'M19 6l1.5-1.5'],
  cards: ['M5 7h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M7 4h12a2 2 0 0 1 2 2v10', 'M7 12h7', 'M7 15h4'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z'],
  calendar: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4', 'M8 14h3', 'M13 14h3', 'M8 17h3'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21a2 2 0 0 1 2-2h13', 'M9 7h6'],
  flask: ['M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3', 'M7.5 15h9'],
  chart: ['M4 20V11', 'M10 20V5', 'M16 20v-6', 'M3 20h18'],
  pencil: ['M4 20l4-1L19 8l-3-3L5 16z', 'M14 7l3 3'],
  cap: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5', 'M22 9v5'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z'],
  music: ['M9 18V5l11-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  people: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M18 14c2.4.7 4 2.9 4 6'],
}
const ICON_RULES = [
  ['timer', /pomodoro|focus|cram|night|all-nighter|procrastinat|time-management|working-full-time/],
  ['cards', /flashcard|anki|quizlet|memoriz|spaced|active-recall|retrieval/],
  ['music', /music/],
  ['people', /group|adhd|anxiety/],
  ['calendar', /schedule|plan|finals|midterm|week|semester|course-load|multiple-exams/],
  ['flask', /chemistry|biology|biochem|anatomy|physics|nursing|nclex|usmle|mcat|medical/],
  ['chart', /statistic|gpa|grade|economics|finance|accounting|business|marketing/],
  ['pencil', /essay|test|exam|sat|act|lsat|gmat|gre|bar-exam|multiple-choice/],
  ['book', /read|textbook|notes|note-taking|history|english|literature|philosophy|spanish|cornell/],
  ['cap', /college|university|school/],
  ['target', /effective|smarter|improve|get-an-a|focus/],
]
const pickIcon = slug => (ICON_RULES.find(([, re]) => re.test(slug)) || ['bulb'])[0]
const icon = (name, size, color = C.blue, stroke = 1.75) => ({
  type: 'svg',
  props: { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    children: ICONS[name].map(d => ({ type: 'path', props: { d } })) },
})

const titleSize = (t, base = 64) => t.length < 34 ? base : t.length < 56 ? base - 8 : t.length < 80 ? base - 16 : base - 22
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

const brand = (color = C.muted) => h('div', { alignItems: 'center', gap: 10 },
  img(LOGO, { width: 26, height: 26, borderRadius: 6 }),
  h('div', { fontFamily: 'Sans', fontWeight: 600, fontSize: 19, color: C.ink }, 'StudyEdge AI'),
  h('div', { fontFamily: 'Sans', fontSize: 17, color, marginLeft: 6 }, 'getstudyedge.com'))
const kicker = text => h('div', { fontFamily: 'Sans', fontWeight: 600, fontSize: 17, letterSpacing: 2.2, color: C.blue, textTransform: 'uppercase' }, text)
const frame = (...children) => h('div', { width: W, height: H, backgroundColor: C.bg, position: 'relative', overflow: 'hidden' },
  h('div', { position: 'absolute', left: 0, top: 0, width: W, height: 6, backgroundColor: C.blue }), ...children)

// ── Template a: big number ──────────────────────────────────────────────────────────
// The scale shows 0.0-4.0 by default; admissions pages (all values above 2) use 2.0-4.0 so a
// narrow range like 3.85 to 4.0 is still visible. The axis labels always say which.
function numberCover({ title, kickerText, value, lo, hi, label, min = 0 }) {
  const span = 4 - min, TW = 1040
  const x = v => Math.round(TW * (Math.min(Math.max(v, min), 4) - min) / span)
  const ticks = min === 0 ? ['0.0', '1.0', '2.0', '3.0', '4.0'] : ['2.0', '2.5', '3.0', '3.5', '4.0']
  const scale = h('div', { flexDirection: 'column', width: TW },
    h('div', { position: 'relative', height: 30, width: TW },
      h('div', { position: 'absolute', left: 0, width: TW, top: 11, height: 8, borderRadius: 4, backgroundColor: C.track }),
      hi === undefined
        ? h('div', { position: 'absolute', left: 0, width: x(lo), top: 11, height: 8, borderRadius: 4, backgroundColor: C.blue })
        : h('div', { position: 'absolute', left: x(lo), width: Math.max(x(hi) - x(lo), 14), top: 7, height: 16, borderRadius: 8, backgroundColor: C.blue }),
      hi === undefined ? h('div', { position: 'absolute', left: x(lo) - 15, top: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', border: `6px solid ${C.blue}` }) : null),
    h('div', { justifyContent: 'space-between', marginTop: 14, fontFamily: 'Sans', fontSize: 19, color: C.dim },
      ...ticks.map(t => h('div', {}, t))))
  return frame(
    h('div', { position: 'absolute', left: 80, right: 80, top: 30, bottom: 100, flexDirection: 'column', justifyContent: 'center' },
      kicker(kickerText),
      h('div', { alignItems: 'flex-end', gap: 30, marginTop: 14, marginBottom: 44 },
        h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: 184, lineHeight: 1, color: C.blue, letterSpacing: -4 }, value),
        h('div', { flexDirection: 'column', paddingBottom: 22, maxWidth: 560 },
          h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 50), lineHeight: 1.1, color: C.ink }, title),
          label ? h('div', { fontFamily: 'Sans', fontSize: 20, color: C.muted, marginTop: 12 }, label) : null)),
      scale),
    h('div', { position: 'absolute', left: 80, bottom: 44 }, brand()))
}

// ── Template b: product shot ────────────────────────────────────────────────────────
function productCover({ title, kickerText, sub, screen, device }) {
  if (device === 'browser') {
    const win = h('div', { position: 'absolute', left: 610, top: 92, width: 700, height: 560, flexDirection: 'column', borderRadius: 14,
        backgroundColor: '#fff', border: `1px solid ${C.rule}`, boxShadow: '0 24px 60px rgba(28,27,24,0.12)', overflow: 'hidden' },
      h('div', { height: 44, alignItems: 'center', gap: 8, paddingLeft: 18, borderBottom: `1px solid ${C.rule}`, backgroundColor: '#F6F5F2' },
        ...[0, 1, 2].map(() => h('div', { width: 11, height: 11, borderRadius: 6, backgroundColor: '#D6D3CC' })),
        h('div', { marginLeft: 22, height: 26, width: 300, borderRadius: 7, backgroundColor: '#fff', border: `1px solid ${C.rule}`, alignItems: 'center', paddingLeft: 12,
          fontFamily: 'Sans', fontSize: 14, color: C.dim }, 'getstudyedge.com/app')),
      h('div', { position: 'relative', width: 700, height: 516, overflow: 'hidden' },
        img(SCREENS[screen], { position: 'absolute', left: screen === 'web-review' ? -58 : -96, top: -18, width: 1180, height: 738 })))
    return frame(
      h('div', { position: 'absolute', left: 80, top: 0, bottom: 0, width: 490, flexDirection: 'column', justifyContent: 'center' },
        kicker(kickerText),
        h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 56), lineHeight: 1.08, color: C.ink, marginTop: 16, letterSpacing: -0.5 }, title),
        sub ? h('div', { fontFamily: 'Sans', fontSize: 21, lineHeight: 1.45, color: C.muted, marginTop: 18 }, sub) : null),
      win,
      h('div', { position: 'absolute', left: 80, bottom: 44 }, brand()))
  }
  const phone = h('div', { position: 'absolute', right: 96, top: 70, width: 330, height: 690, borderRadius: 52, backgroundColor: '#fff',
      border: `1px solid ${C.rule}`, boxShadow: '0 24px 60px rgba(28,27,24,0.12)', padding: 12 },
    h('div', { width: 306, height: 666, borderRadius: 42, overflow: 'hidden', backgroundColor: '#F5F6F8' },
      img(SCREENS[screen], { width: 306, height: 678, objectFit: 'cover', objectPosition: 'top' })))
  return frame(
    h('div', { position: 'absolute', left: 80, top: 0, bottom: 0, width: 620, flexDirection: 'column', justifyContent: 'center' },
      kicker(kickerText),
      h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 60), lineHeight: 1.08, color: C.ink, marginTop: 16, letterSpacing: -0.5 }, title),
      sub ? h('div', { fontFamily: 'Sans', fontSize: 22, lineHeight: 1.45, color: C.muted, marginTop: 18 }, sub) : null),
    phone,
    h('div', { position: 'absolute', left: 80, bottom: 44 }, brand()))
}

// ── Template c: editorial (three layouts) ───────────────────────────────────────────
function editorialCover({ title, kickerText, iconName, variant }) {
  if (variant === 0) {
    return frame(
      h('div', { position: 'absolute', left: 80, top: 0, bottom: 0, width: 700, flexDirection: 'column', justifyContent: 'center' },
        kicker(kickerText),
        h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 66), lineHeight: 1.08, color: C.ink, marginTop: 18, letterSpacing: -0.5 }, title)),
      h('div', { position: 'absolute', right: 96, top: 155, width: 320, height: 320, borderRadius: 160, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' },
        icon(iconName, 168)),
      h('div', { position: 'absolute', left: 80, bottom: 44 }, brand()))
  }
  if (variant === 1) {
    return frame(
      h('div', { position: 'absolute', left: 80, top: 78, right: 80, flexDirection: 'column' },
        h('div', { alignItems: 'center', gap: 18 },
          h('div', { width: 76, height: 76, borderRadius: 18, border: `2px solid ${C.blue}`, alignItems: 'center', justifyContent: 'center' }, icon(iconName, 44)),
          kicker(kickerText)),
        h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 82), lineHeight: 1.05, color: C.ink, marginTop: 44, maxWidth: 1040, letterSpacing: -1 }, title)),
      h('div', { position: 'absolute', left: 80, right: 80, bottom: 96, height: 2, backgroundColor: C.rule }),
      h('div', { position: 'absolute', left: 80, bottom: 40 }, brand()))
  }
  // variant 2: large outline icon bleeding off the right edge, headline left
  return frame(
    h('div', { position: 'absolute', right: -70, top: 40, opacity: 0.9 }, icon(iconName, 560, C.blueBg, 1.4)),
    h('div', { position: 'absolute', right: 120, top: 210 }, icon(iconName, 150, C.blue, 1.6)),
    h('div', { position: 'absolute', left: 80, top: 0, bottom: 0, width: 690, flexDirection: 'column', justifyContent: 'center' },
      h('div', { width: 64, height: 6, backgroundColor: C.blue, marginBottom: 26 }),
      kicker(kickerText),
      h('div', { fontFamily: 'Serif', fontWeight: 600, fontSize: titleSize(title, 64), lineHeight: 1.08, color: C.ink, marginTop: 16, letterSpacing: -0.5 }, title)),
    h('div', { position: 'absolute', left: 80, bottom: 44 }, brand()))
}

// ── Page reading ────────────────────────────────────────────────────────────────────
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
function readPage(rel) {
  const html = fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8')
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const cat = html.match(/<p class="ed-kicker"><a [^>]*>([^<]+)<\/a>/)
  return { html, title: h1 ? strip(h1[1]) : rel, category: cat ? strip(cat[1]) : null }
}
const slugOf = rel => rel.replace(/\.html$/, '')

function chooseTemplate(slug) {
  if (/^(is-a-\d-\d-gpa-good|what-gpa-do-you-need-for-)/.test(slug)) return 'number'
  if (/^compare\/|^(studyedge-|ai-|.*-alternative$|best-study-app|best-ai|pricing$|about$)/.test(slug)) return 'product'
  return 'editorial'
}

// Only numbers that appear on the page. Returns null to fall back to editorial.
function findNumber(slug, html) {
  const m = slug.match(/^is-a-(\d)-(\d)-gpa-good$/)
  if (m) {
    const v = `${m[1]}.${m[2]}`
    if (!html.includes(v)) return null
    return { value: v, lo: Number(v), label: 'On a 4.0 scale' }
  }
  const text = strip(html)
  const range = text.match(/Middle 50% GPA:\s*(\d\.\d{1,2}) to (\d\.\d{1,2}) unweighted/)
  if (range) return { value: range[1], lo: Number(range[1]), hi: Number(range[2]), min: 2, label: `Middle 50% of admits: ${range[1]} to ${range[2]} unweighted` }
  const avg = text.match(/Avg(?: unweighted)? GPA:\s*~?(\d\.\d{1,2})/)
  if (avg) return { value: avg[1], lo: Number(avg[1]), min: 2, label: 'Average unweighted GPA of admitted students' }
  return null
}

function coverFor(rel, opts = {}) {
  const slug = slugOf(rel)
  const { html, title, category } = readPage(rel)
  let tpl = chooseTemplate(slug)
  let tree, alt
  if (tpl === 'number') {
    const n = findNumber(slug, html)
    if (n) {
      tree = numberCover({ title, kickerText: 'GPA guide', ...n })
      alt = `Cover for "${title}": the number ${n.value} on a GPA scale from ${n.min ? '2.0' : '0.0'} to 4.0${n.hi ? `, with the ${n.lo} to ${n.hi} range highlighted` : ', with a marker at that point'}.`
    } else tpl = 'editorial'
  }
  if (tpl === 'product') {
    const device = opts.device || PRODUCT_DEVICE
    const screen = device === 'browser'
      ? (/compare|alternative|flashcard|anki|quizlet|recall|review/.test(slug) ? 'web-review' : 'web-gradehub')
      : (/compare|alternative/.test(slug) ? 'today' : /coach|planner|schedule/.test(slug) ? 'coach' : 'session')
    const sub = slug.startsWith('compare/') ? 'Sourced, side by side, with where each app wins.' : null
    tree = productCover({ title, kickerText: slug.startsWith('compare/') ? 'Comparison' : 'StudyEdge AI', sub, screen, device })
    const screenName = { 'web-review': 'Review Queue screen', 'web-gradehub': 'Grade Hub screen', today: 'Today screen', session: 'study session screen', coach: 'AI Coach screen' }[screen]
    alt = `Cover for "${title}": the StudyEdge AI ${screenName} shown ${device === 'browser' ? 'in a browser window' : 'on a phone'}, beside the page title.`
  }
  if (tpl === 'editorial') {
    const iconName = pickIcon(slug)
    const variant = hash(slug) % 3
    tree = editorialCover({ title, kickerText: category || (rel.startsWith('blog/') ? 'Study guide' : 'StudyEdge AI'), iconName, variant })
    alt = `Cover for "${title}": the title in serif type with a line drawing of a ${{ bulb: 'light bulb', cards: 'stack of flashcards', timer: 'timer', calendar: 'calendar', book: 'book', flask: 'lab flask', chart: 'bar chart', pencil: 'pencil', cap: 'graduation cap', target: 'target', music: 'music note', people: 'two people' }[iconName]}.`
  }
  return { slug, tpl, tree, alt, title }
}

async function render(tree, outBase) {
  const svg = await satori(tree, { width: W, height: H, fonts: FONTS })
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
  fs.mkdirSync(path.dirname(outBase), { recursive: true })
  fs.writeFileSync(outBase + '.png', png)
  await sharp(png).webp({ quality: 86 }).toFile(outBase + '.webp')
  return png
}


// ── Rollout: render every page, then wire the covers into the HTML ────────────────────
const VERSION = 'v1'
const ORIGIN = 'https://getstudyedge.com'
const SKIP = new Set(['login.html', 'unsubscribe.html', 'utm-builder.html', 'og-hero-render.html', 'landing-hero.html', 'embed-gpa-calculator.html'])
// Secondary stock photos on product pages become real web-app screens (harness, fixture data).
const APP_SHOTS = {
  'grade-hub': { src: 'web-gradehub.png', alt: 'StudyEdge AI Grade Hub showing a course average, the score needed on remaining work and the grade components' },
  'review-queue': { src: 'web-review.png', alt: 'StudyEdge AI Review Queue listing topics that are due for review, with mastery scores and how overdue each one is' },
}

function listPages() {
  const out = []
  for (const dir of ['', 'blog/', 'compare/']) {
    for (const f of fs.readdirSync(path.join(ROOT, 'public', dir))) {
      if (!f.endsWith('.html') || SKIP.has(f)) continue
      const rel = dir + f
      if (!/<h1[\s>]/.test(fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8'))) continue
      out.push(rel)
    }
  }
  return out.sort()
}

const keyOf = rel => rel.replace(/\.html$/, '')
const coverUrl = (rel, ext) => `/covers/${keyOf(rel)}.${ext}`
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function pictureTag(rel, alt, cls, eager) {
  return `<picture><source srcset="${coverUrl(rel, 'webp')}" type="image/webp"><img${cls ? ` class="${cls}"` : ''} src="${coverUrl(rel, 'png')}" alt="${escAttr(alt)}" width="1200" height="630" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}></picture>`
}

function wire(rel, alt) {
  const file = path.join(ROOT, 'public', rel)
  let t = fs.readFileSync(file, 'utf8')
  const t0 = t
  const abs = ORIGIN + coverUrl(rel, 'png')
  // 1. social meta: drop the old image/card tags, add one marked block
  t = t.replace(/[ \t]*<meta\b(?=[^>]*\b(?:property|name)="(?:og:image(?::\w+)?|twitter:image(?::alt)?|twitter:card)")[^>]*>\s*\n?/g, '')
  t = t.replace(/[ \t]*<!-- cover:meta -->[\s\S]*?<!-- \/cover:meta -->\n?/, '')
  const meta = `  <!-- cover:meta -->\n  <meta property="og:image" content="${abs}" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />\n  <meta property="og:image:alt" content="${escAttr(alt)}" />\n  <meta name="twitter:card" content="summary_large_image" />\n  <meta name="twitter:image" content="${abs}" />\n  <meta name="twitter:image:alt" content="${escAttr(alt)}" />\n  <!-- /cover:meta -->\n`
  t = t.replace('</head>', meta + '</head>')
  // 2. stock-photo preloads/preconnects go; JSON-LD images point at the cover
  t = t.replace(/[ \t]*<link rel="preconnect" href="https:\/\/images\.unsplash\.com"[^>]*>\s*\n?/g, '')
  // blog index: the featured article shows that post's cover
  t = t.replace(/(<a href="\/blog\/([^"]+)" class="featured-article">\s*<div class="featured-article-img">\s*)<img src="https:\/\/images\.unsplash\.com[^"]*"[^>]*>/,
    (m, a, slug) => a + `<picture><source srcset="/covers/blog/${slug}.webp" type="image/webp"><img src="/covers/blog/${slug}.png" alt="" width="1200" height="630" loading="eager"></picture>`)
  t = t.replace(/[ \t]*<link rel="preload" as="image" href="https:\/\/images\.unsplash\.com[^"]*"[^>]*>\s*\n?/g, '')
  t = t.replace(/(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g, s => s.replace(/https:\/\/images\.unsplash\.com\/[^"\s]+/g, abs))
  // 3. hero: the post cover (blog), the hub photo, or the first stock photo on a product page
  let heroDone = false
  t = t.replace(/<img class="ed-cover" src="https:\/\/images\.unsplash\.com[^"]*"[^>]*>/, () => { heroDone = true; return pictureTag(rel, alt, 'ed-cover', true) })
  if (!heroDone) t = t.replace(/(<div class="hub-intro">\s*)<img src="https:\/\/images\.unsplash\.com[^"]*"[^>]*>/, (m, a) => { heroDone = true; return a + pictureTag(rel, alt, 'hub-cover', true) })
  if (!heroDone && !rel.startsWith('blog/')) {
    t = t.replace(/<img\b[^>]*src="https:\/\/images\.unsplash\.com[^"]*"[^>]*>/, m => { heroDone = true; return pictureTag(rel, alt, 'page-cover', true) })
    // any further stock photos on the page: real app screens, alternating
    let i = 0
    t = t.replace(/<img\b[^>]*src="https:\/\/images\.unsplash\.com[^"]*"[^>]*>/g, () => {
      const k = ['grade-hub', 'review-queue'][i++ % 2]
      return `<picture><source srcset="/covers/app/${k}.webp" type="image/webp"><img class="app-shot" src="/covers/app/${k}.png" alt="${escAttr(APP_SHOTS[k].alt)}" width="1600" height="1000" loading="lazy"></picture>`
    })
  }
  if (t !== t0) fs.writeFileSync(file, t)
  return t !== t0
}

async function rollout(args) {
  const force = args.includes('--force')
  const manifestPath = path.join(ROOT, 'public', 'covers', 'manifest.json')
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}
  fs.mkdirSync(path.join(ROOT, 'public', 'covers', 'app'), { recursive: true })
  for (const [k, v] of Object.entries(APP_SHOTS)) {
    const src = path.join(ROOT, 'scripts', 'cover-assets', 'screens', v.src)
    const out = path.join(ROOT, 'public', 'covers', 'app', k)
    if (force || !fs.existsSync(out + '.webp')) {
      await sharp(src).resize(1600).png({ compressionLevel: 9 }).toFile(out + '.png')
      await sharp(src).resize(1600).webp({ quality: 84 }).toFile(out + '.webp')
    }
  }
  let rendered = 0, wired = 0, failed = []
  const pages = listPages()
  for (const rel of pages) {
    try {
      const c = coverFor(rel)
      const sig = crypto.createHash('sha1').update(VERSION + PRODUCT_DEVICE + JSON.stringify(c.tree)).digest('hex')
      const base = path.join(ROOT, 'public', 'covers', keyOf(rel))
      if (force || manifest[rel]?.sig !== sig || !fs.existsSync(base + '.png')) {
        await render(c.tree, base); rendered++
      }
      manifest[rel] = { sig, template: c.tpl, alt: c.alt }
      if (wire(rel, c.alt)) wired++
    } catch (e) { failed.push(`${rel}: ${e.message}`) }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`covers: ${pages.length} pages, ${rendered} rendered, ${wired} wired, ${failed.length} failed`)
  for (const f of failed) console.log('  FAILED', f)
  if (failed.length) process.exit(1)
}

const SAMPLES = ['is-a-3-5-gpa-good.html', 'what-gpa-do-you-need-for-ucla.html', 'compare/studyedge-vs-quizlet.html', 'ai-study-coach.html',
  'blog/how-to-study-effectively.html', 'blog/pomodoro-technique-for-studying.html']

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--samples')) {
    const outDir = path.join(ROOT, 'docs', 'cover-samples')
    const meta = []
    const pngs = []
    for (const rel of SAMPLES) {
      const c = coverFor(rel)
      pngs.push(await render(c.tree, path.join(outDir, c.slug.replace(/\//g, '--'))))
      meta.push({ page: rel, template: c.tpl, alt: c.alt })
      console.log(c.tpl.padEnd(9), rel)
    }
    for (const rel of SAMPLES) {
      const c = coverFor(rel, { device: 'phone' })
      if (c.tpl === 'product') { await render(c.tree, path.join(outDir, 'phone-alternate', c.slug.replace(/\//g, '--'))); meta.push({ page: rel, template: 'product (phone alternate)', alt: c.alt }) }
    }
    fs.writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(meta, null, 2) + '\n')
    // contact sheet: 2 columns x 3 rows at half size
    const tiles = await Promise.all(pngs.map(p => sharp(p).resize(600, 315).toBuffer()))
    await sharp({ create: { width: 1240, height: 1005, channels: 3, background: '#D9D6CF' } })
      .composite(tiles.map((t, i) => ({ input: t, left: 13 + (i % 2) * 614, top: 13 + Math.floor(i / 2) * 330 })))
      .png().toFile(path.join(outDir, 'contact-sheet.png'))
    return
  }
  await rollout(args)
}
main().catch(e => { console.error(e); process.exit(1) })
