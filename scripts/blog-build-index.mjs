#!/usr/bin/env node
// Rebuilds public/blog/index.html to the dense-list v2 layout using
// the post metadata already present in the existing file. Preserves
// <head>: title, meta tags, canonical, hreflang, OG/Twitter, robots,
// AND the full <script type="application/ld+json"> blog schema.
//
// Extracts every existing .b-card into { href, category, title, teaser,
// date, readTime, dateSort } and re-emits grouped by category with a
// segmented category nav and a featured card.
//
// Idempotent: reads existing curated data and never invents fields.
// If the current file has already been rebuilt (no .b-card blocks),
// exits without writing.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(__dirname, '..', 'public', 'blog', 'index.html');
const DRY = !process.argv.includes('--execute');

const html = readFileSync(INDEX, 'utf8');

// Extract head + schema.
const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);
if (!headMatch) { console.error('No <head> found.'); process.exit(1); }

// Preserve only the parts of <head> that matter: meta + JSON-LD + font pre-connect.
// Drop the old inline <style> block; we load /blog/blog.css.
const rawHead = headMatch[1];
const keepFromHead = [];

// Preserve everything except old <style> blocks and old Google-Fonts <link>s.
const headParts = rawHead
  .split(/(<style[\s\S]*?<\/style>|<link[^>]*fonts\.googleapis\.com[^>]*>)/gi)
  .filter((p) => p && !/^<style/i.test(p) && !/fonts\.googleapis\.com/i.test(p));

const cleanHead = headParts.join('').trim();

// Extract cards.
const CARD_RE = /<a\s+href="(\/blog\/[^"]+)"\s+class="b-card">\s*<div class="b-cover cat-([a-z-]+)">\s*<span class="b-cover-tag">([^<]+)<\/span>[\s\S]*?<\/div>\s*<div class="b-body">\s*<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>\s*<div class="b-foot"><span class="b-meta">([^<]+)<\/span>[\s\S]*?<\/div>\s*<\/div>\s*<\/a>/g;

const cards = [];
let m;
while ((m = CARD_RE.exec(html)) !== null) {
  const [, href, catSlug, catLabel, title, teaser, meta] = m;
  const [dateStr, readTime] = meta.split(/\s*·\s*|\s*&middot;\s*/);
  cards.push({
    href,
    catSlug,
    catLabel: catLabel.replace(/&amp;/g, '&'),
    title: title.trim(),
    teaser: teaser.trim(),
    date: dateStr.trim(),
    readTime: (readTime || '').trim(),
    dateSort: parseDate(dateStr.trim()),
  });
}

if (cards.length === 0) {
  console.log('No .b-card blocks found. Index may already be rebuilt. Skipping.');
  process.exit(0);
}

function parseDate(s) {
  // "Jul 13, 2026" -> Date
  const d = new Date(s);
  return isNaN(d) ? 0 : d.getTime();
}

// Order categories with the biggest/most useful clusters first.
const CATEGORY_ORDER = [
  { slug: 'study',    label: 'Study Techniques'    },
  { slug: 'planning', label: 'Planning & Schedule' },
  { slug: 'exam',     label: 'Exam Prep'           },
  { slug: 'subject',  label: 'Subject Guides'      },
  { slug: 'gpa',      label: 'GPA & Grades'        },
  { slug: 'focus',    label: 'Focus & Habits'      },
  { slug: 'premed',   label: 'Pre-Med'             },
  { slug: 'college',  label: 'College Life'        },
  { slug: 'ai',       label: 'AI & Tools'          },
];

const byCat = new Map();
for (const c of cards) {
  const key = CATEGORY_ORDER.find((x) => x.slug === c.catSlug) ? c.catSlug : 'study';
  if (!byCat.has(key)) byCat.set(key, []);
  byCat.get(key).push(c);
}
for (const [, arr] of byCat) arr.sort((a, b) => b.dateSort - a.dateSort);

// Featured: newest overall.
const featured = cards.slice().sort((a, b) => b.dateSort - a.dateSort)[0];

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Build body.
const navHtml = CATEGORY_ORDER
  .filter((c) => byCat.has(c.slug))
  .map((c) => `<a href="#cat-${c.slug}">${c.label}</a>`)
  .join('\n      ');

const clusterHtml = CATEGORY_ORDER
  .filter((c) => byCat.has(c.slug))
  .map((c) => {
    const posts = byCat.get(c.slug);
    const rows = posts.map((p) => `        <li><a href="${p.href}">${esc(p.title)}<span class="row-meta">${esc(p.date)}${p.readTime ? ` &middot; ${esc(p.readTime)}` : ''}</span></a></li>`).join('\n');
    return `    <section class="blog-cluster" id="cat-${c.slug}">
      <h2>${c.label}</h2>
      <p>${clusterDeck(c.slug, posts.length)}</p>
      <ol>
${rows}
      </ol>
    </section>`;
  })
  .join('\n\n');

function clusterDeck(slug, count) {
  const decks = {
    study:    `Cognitive science on retrieval, spacing, interleaving, and the methods that survive scrutiny. ${count} pieces.`,
    planning: `Building a schedule that survives the semester it was made for. ${count} pieces.`,
    exam:     `Preparing for the specific exam, not studying in general. ${count} pieces.`,
    subject:  `Course-specific study systems for the ${count} subjects with the biggest gap between effort and grade.`,
    gpa:      `Grade math, recovery plans, and what actually moves a transcript. ${count} pieces.`,
    focus:    `Attention, procrastination, energy management. ${count} pieces.`,
    premed:   `MCAT, med school prerequisites, and the long game. ${count} pieces.`,
    college:  `Sleep, jobs, mental load, and the parts of college that quietly determine grades. ${count} pieces.`,
    ai:       `Where AI helps studying and where it hurts. ${count} pieces.`,
  };
  return decks[slug] || `${count} pieces.`;
}

const body = `<body>

<header class="site-header">
  <nav class="site-nav">
    <a class="nav-logo" href="/"><img src="/favicon.png" alt="StudyEdge AI" />StudyEdge AI</a>
    <div class="nav-links">
      <a href="/#features">Features</a>
      <a href="/studyedge-ai#pricing">Pricing</a>
      <a href="/blog">Blog</a>
      <a href="/app?signup=1&plan=pro&billing=weekly&trial=1" class="nav-cta">Try Free</a>
    </div>
  </nav>
</header>

<section class="blog-index-hero">
  <div class="container">
    <h1>Study tips for college, written like a real editorial</h1>
    <p>Evidence-based guides on study techniques, exam prep, GPA math, and the AI tools that actually help. ${cards.length} pieces, updated as the research changes.</p>
  </div>
</section>

<nav class="blog-index-nav" aria-label="Post categories">
      ${navHtml}
    </nav>

<div class="blog-index-body">

  <section class="blog-featured" aria-label="Featured piece">
    <span class="blog-featured-eyebrow">Latest</span>
    <a href="${featured.href}">${esc(featured.title)}</a>
    <span class="meta">${esc(featured.date)}${featured.readTime ? ` &middot; ${esc(featured.readTime)}` : ''} &middot; ${featured.catLabel === 'Standardized Tests' ? 'Exam Prep' : featured.catLabel}</span>
  </section>

${clusterHtml}

</div>

<section class="blog-cta-section">
  <div class="container">
    <div class="eyebrow">StudyEdge AI</div>
    <h2>Turn any note, syllabus, or PDF into an active-recall study set</h2>
    <p>The techniques on this blog are built into the app. Upload course material and get flashcards, practice exams, and a spaced-repetition schedule in under a minute.</p>
    <div class="cta-btn-row">
      <a href="/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=blog&utm_medium=cta&utm_campaign=index&utm_content=blog_cta_end" class="btn btn-primary btn-lg" data-ph-event="blog_cta_end" data-post-slug="index">Start free trial</a>
    </div>
    <p class="cta-fine">3-day free trial &middot; Cancel anytime &middot; $2.99/wk after trial</p>
  </div>
</section>

<footer class="site-footer">
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/gpa-calculator">GPA Calculator</a>
    <a href="/grade-calculator">Grade Calculator</a>
    <a href="/ai-study-coach">AI Study Coach</a>
    <a href="/ai-flashcard-maker">AI Flashcard Maker</a>
    <a href="/blog">Blog</a>
    <a href="/blog/editorial-policy">Editorial policy</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </div>
  <p>&copy; 2026 StudyEdge AI</p>
</footer>

</body>
</html>`;

const newHead = `<head>
${cleanHead}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700&display=swap">
</head>`;

const out = `<!DOCTYPE html>
<html lang="en">
${newHead}
${body}
`;

console.log(`Cards extracted: ${cards.length}`);
for (const c of CATEGORY_ORDER) {
  if (byCat.has(c.slug)) console.log(`  ${c.label.padEnd(24)} ${byCat.get(c.slug).length}`);
}
console.log(`Featured: ${featured.title}`);
console.log(`Output size: ${out.length} bytes  (was ${html.length})`);

if (DRY) {
  console.log('\nDRY RUN. Re-run with --execute to write index.html.');
} else {
  writeFileSync(INDEX, out, 'utf8');
  console.log('\nWrote index.html.');
}
