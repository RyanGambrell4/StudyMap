#!/usr/bin/env node
// Injects Newsreader + Inter Google Fonts link into hub and utility pages
// that the main rewriter skips (hubs use CollectionPage schema, not
// BlogPosting). Safe, idempotent, no other mutations.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG = resolve(__dirname, '..', 'public', 'blog');

const TARGETS = [
  'exam-prep.html',
  'gpa-grades.html',
  'study-techniques.html',
  'subject-guides.html',
  'study-schedule-tips.html',
  'author.html',
  'editorial-policy.html',
];

const NEWSREADER_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700&display=swap">`;

const DRY = !process.argv.includes('--execute');
const report = [];

for (const f of TARGETS) {
  const p = join(BLOG, f);
  let html;
  try { html = readFileSync(p, 'utf8'); }
  catch { report.push([f, 'MISSING']); continue; }

  if (/fonts\.googleapis\.com[^"]*Newsreader/.test(html)) {
    report.push([f, 'NOOP (already has Newsreader)']);
    continue;
  }

  // Replace any pre-existing google-fonts <link> stylesheet with the new pair.
  // Otherwise, insert after <title>.
  const existingFontLink = /<link[^>]*fonts\.googleapis\.com\/css2\?family=[^"]*"[^>]*\/?>(\s*<link[^>]*fonts\.googleapis\.com\/css2\?family=[^"]*"[^>]*\/?>)?/;
  const preconnectPair = /<link[^>]*preconnect[^>]*fonts\.googleapis\.com[^>]*\/?>[\s\S]{0,120}?<link[^>]*preconnect[^>]*fonts\.gstatic\.com[^>]*\/?>/;

  let out = html;
  if (preconnectPair.test(out)) {
    out = out.replace(preconnectPair, '');
  }
  if (existingFontLink.test(out)) {
    out = out.replace(existingFontLink, NEWSREADER_LINK);
    report.push([f, 'font-link-replaced']);
  } else {
    out = out.replace(/(<title>[\s\S]*?<\/title>)/, `$1\n  ${NEWSREADER_LINK}`);
    report.push([f, 'font-link-inserted']);
  }

  if (!DRY && out !== html) {
    writeFileSync(p, out, 'utf8');
  }
}

console.log(`\nHub-page font injection: ${DRY ? 'DRY-RUN' : 'EXECUTE'}\n`);
for (const [f, s] of report) console.log(`  ${f.padEnd(28)} ${s}`);
if (DRY) console.log('\nRe-run with --execute to write.');
