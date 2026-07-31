#!/usr/bin/env node
// StudyEdge AI blog rewriter (v1)
// Scope: surgical HTML mutations only. Presentation lives in public/blog/blog.css.
// This script does NOT touch content prose, heading text, schema JSON-LD,
// meta tags, canonical URLs, image sources, or internal links.
//
// Mutations (per post, in order):
//   1. Inject Newsreader font <link> into <head> if not already present.
//   2. Delete <div class="author-avatar">XX</div> from .author-bio.
//   3. Insert <p class="editorial-note"> under .author-desc linking to
//      /blog/editorial-policy if not already present.
//   4. Add data-ph-event / data-post-slug / UTM params to every signup CTA
//      anchor pointing at /app?signup=1&plan=pro&billing=weekly&trial=1.
//      - .inline-cta anchors -> data-ph-event="blog_cta_mid"
//      - .blog-cta-section, .cta-section, .post-cta, .related-links anchors
//          -> data-ph-event="blog_cta_end"
//      - .site-nav / .nav-cta anchors are left alone (nav, not article CTA).
//
// Safety rails:
//   - Dry-run by default. Pass --execute to write files.
//   - Never touches feed.xml, sitemap.xml, .css, images.
//   - Skips index.html, author.html, editorial-policy.html.
//   - Skips any post that doesn't match the expected skeleton (see FINGERPRINTS).
//   - Reports every skip with a reason.
//   - Idempotent: safe to re-run.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = resolve(__dirname, '..', 'public', 'blog');

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has('--execute');
const VERBOSE = args.has('--verbose');
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? parseInt(arg.split('=')[1], 10) : Infinity;
})();

const NEVER_TOUCH = new Set([
  'feed.xml',
  'sitemap.xml',
  'blog.css',
]);

const HANDLED_SEPARATELY = new Set([
  'index.html',
  'author.html',
  'editorial-policy.html',
]);

const SIGNUP_PATH_PREFIX = '/app?signup=1&plan=pro&billing=weekly&trial=1';

const NEWSREADER_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700&display=swap">`;

const EDITORIAL_NOTE = `<p class="editorial-note">Reviewed against college learning-science research and updated when the underlying studies are revised. <a href="/blog/editorial-policy">Editorial policy</a></p>`;

// ─── Per-file processing ─────────────────────────────────────────────────────

function processFile(filename) {
  const filepath = join(BLOG_DIR, filename);
  const original = readFileSync(filepath, 'utf8');

  // Fingerprint checks: is this a conforming post?
  const has = {
    doctype: /^<!DOCTYPE html>/i.test(original),
    html: /<html[^>]*>/.test(original),
    head: /<head>/.test(original) && /<\/head>/.test(original),
    body: /<body[^>]*>/.test(original) && /<\/body>/.test(original),
    blogPostingSchema: /"@type":\s*"BlogPosting"/.test(original),
    signupUrl: original.includes(SIGNUP_PATH_PREFIX),
    inlineCta: /class="inline-cta"/.test(original),
    authorAvatar: /<div class="author-avatar">[\s\S]*?<\/div>/.test(original),
    newsreaderAlreadyLoaded: /fonts\.googleapis\.com[^"']*Newsreader/.test(original),
    editorialNoteAlreadyPresent: /class="editorial-note"/.test(original),
  };

  const skipReasons = [];
  if (!has.doctype || !has.html || !has.head || !has.body) {
    skipReasons.push('missing-html-scaffold');
  }
  if (!has.blogPostingSchema) {
    skipReasons.push('no-BlogPosting-schema');
  }
  if (!has.signupUrl) {
    skipReasons.push('no-signup-cta');
  }

  if (skipReasons.length) {
    return { filename, status: 'SKIP', reasons: skipReasons, mutations: [] };
  }

  const slug = filename.replace(/\.html$/, '');
  let html = original;
  const mutations = [];

  // ── 1. Inject Newsreader font <link> into <head> ──────────────────────────
  if (!has.newsreaderAlreadyLoaded) {
    // Insert just before existing Inter <link> if present, else after <title>.
    const interLinkRegex = /<link[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*"[^>]*>/;
    if (interLinkRegex.test(html)) {
      html = html.replace(interLinkRegex, NEWSREADER_LINK);
      mutations.push('font-link-replaced');
    } else {
      html = html.replace(/(<title>[\s\S]*?<\/title>)/, `$1\n${NEWSREADER_LINK}`);
      mutations.push('font-link-inserted');
    }
  }

  // ── 2. Remove fake author-avatar div ──────────────────────────────────────
  if (has.authorAvatar) {
    const before = html;
    html = html.replace(/[ \t]*<div class="author-avatar">[\s\S]*?<\/div>\s*\n?/g, '');
    if (html !== before) mutations.push('author-avatar-removed');
  }

  // ── 3. Add editorial-note after .author-desc ──────────────────────────────
  if (!has.editorialNoteAlreadyPresent && /<p class="author-desc">[\s\S]*?<\/p>/.test(html)) {
    html = html.replace(
      /(<p class="author-desc">[\s\S]*?<\/p>)/,
      `$1\n        ${EDITORIAL_NOTE}`
    );
    mutations.push('editorial-note-inserted');
  }

  // ── 4. Annotate signup CTAs with PostHog data attrs + UTMs ────────────────
  // Match every <a ...> whose href contains the signup path prefix.
  // Classify by wrapping context: .inline-cta -> mid; else -> end.
  // Skip if href already contains utm_source=blog.
  const anchorRegex = /<a\s+([^>]*?)href="\/app\?signup=1&plan=pro&billing=weekly&trial=1([^"]*)"([^>]*)>/g;
  let midCount = 0;
  let endCount = 0;

  html = html.replace(anchorRegex, (fullMatch, preAttrs, hrefTail, postAttrs, offset) => {
    // Already annotated? Skip.
    if (fullMatch.includes('data-ph-event=')) {
      return fullMatch;
    }
    if (fullMatch.includes('utm_source=blog')) {
      return fullMatch;
    }

    // Classify by nearest enclosing block class (walk backwards from offset).
    const before = html.slice(0, offset);
    const lastInlineCta = before.lastIndexOf('class="inline-cta"');
    const lastBlogCta = before.lastIndexOf('class="blog-cta-section"');
    const lastCtaSection = before.lastIndexOf('class="cta-section"');
    const lastPostCta = before.lastIndexOf('class="post-cta"');
    const lastRelated = before.lastIndexOf('class="related-links"');
    const lastAuthorBio = before.lastIndexOf('class="author-bio"');
    const lastFaqSection = before.lastIndexOf('class="faq-section"');
    const lastNavCta = Math.max(
      before.lastIndexOf('class="site-nav"'),
      before.lastIndexOf('class="nav-cta"'),
      before.lastIndexOf('class="site-header"')
    );

    // Find nearest closing markers to know if we're STILL inside those blocks.
    // Simple heuristic: pick the largest of the "class=" positions above.
    const candidates = [
      { pos: lastInlineCta, kind: 'mid' },
      { pos: lastBlogCta, kind: 'end' },
      { pos: lastCtaSection, kind: 'end' },
      { pos: lastPostCta, kind: 'end' },
      { pos: lastRelated, kind: 'skip' },       // related-links: don't tag
      { pos: lastAuthorBio, kind: 'skip' },     // author-bio: don't tag
      { pos: lastFaqSection, kind: 'faq' },     // faq mid-post inline anchor
      { pos: lastNavCta, kind: 'skip' },        // nav CTA: leave alone
    ].filter((c) => c.pos >= 0).sort((a, b) => b.pos - a.pos);

    const nearest = candidates[0];
    let phEvent;
    if (!nearest || nearest.kind === 'skip') {
      // No known container found; skip annotation but keep href intact.
      return fullMatch;
    }
    if (nearest.kind === 'mid') { phEvent = 'blog_cta_mid'; midCount++; }
    else if (nearest.kind === 'end') { phEvent = 'blog_cta_end'; endCount++; }
    else if (nearest.kind === 'faq') { phEvent = 'blog_cta_faq'; }
    else { return fullMatch; }

    // Preserve any query already tacked on after the prefix, then append UTMs.
    // If the existing hrefTail already contains query params, use &, else &.
    const cleanTail = hrefTail; // already starts with & or is empty
    const utmSuffix = `&utm_source=blog&utm_medium=cta&utm_campaign=${slug}&utm_content=${phEvent}`;
    const newHref = `/app?signup=1&plan=pro&billing=weekly&trial=1${cleanTail}${utmSuffix}`;
    const dataAttrs = ` data-ph-event="${phEvent}" data-post-slug="${slug}"`;

    return `<a ${preAttrs}href="${newHref}"${dataAttrs}${postAttrs}>`;
  });

  if (midCount) mutations.push(`cta-mid-annotated(${midCount})`);
  if (endCount) mutations.push(`cta-end-annotated(${endCount})`);

  return {
    filename,
    status: mutations.length ? 'MODIFY' : 'NOOP',
    reasons: [],
    mutations,
    diffBytes: html.length - original.length,
    newHtml: html,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const allFiles = readdirSync(BLOG_DIR)
    .filter((f) => statSync(join(BLOG_DIR, f)).isFile())
    .sort();

  const htmlFiles = allFiles.filter((f) => extname(f) === '.html');

  const preservedFiles = allFiles.filter(
    (f) => NEVER_TOUCH.has(f) || (extname(f) !== '.html' && extname(f) !== '.css')
  );

  const results = { MODIFY: [], NOOP: [], SKIP: [], HANDLED_SEPARATELY: [] };

  let processed = 0;
  for (const filename of htmlFiles) {
    if (processed >= LIMIT) break;
    if (HANDLED_SEPARATELY.has(filename)) {
      results.HANDLED_SEPARATELY.push({ filename, status: 'HANDLED_SEPARATELY' });
      continue;
    }
    const result = processFile(filename);
    results[result.status].push(result);

    if (result.status === 'MODIFY' && EXECUTE) {
      writeFileSync(join(BLOG_DIR, filename), result.newHtml, 'utf8');
    }
    processed++;
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const mode = EXECUTE ? 'EXECUTE (files written)' : 'DRY-RUN (no files written)';
  console.log(`\nBlog rewrite report (${mode})`);
  console.log('='.repeat(72));
  console.log(`Directory:  ${BLOG_DIR}`);
  console.log(`HTML files: ${htmlFiles.length}`);
  console.log(`  MODIFY:              ${results.MODIFY.length}`);
  console.log(`  NOOP (idempotent):   ${results.NOOP.length}`);
  console.log(`  SKIP (nonconform):   ${results.SKIP.length}`);
  console.log(`  HANDLED_SEPARATELY:  ${results.HANDLED_SEPARATELY.length}`);
  console.log(`Preserved untouched:   ${preservedFiles.join(', ') || '(none in dir)'}`);
  console.log('');

  if (results.SKIP.length) {
    console.log('SKIPPED FILES (require manual review):');
    for (const r of results.SKIP) {
      console.log(`  ${r.filename}  ->  ${r.reasons.join(', ')}`);
    }
    console.log('');
  }
  if (results.HANDLED_SEPARATELY.length) {
    console.log('HANDLED_SEPARATELY (redesigned directly, not via this rewriter):');
    for (const r of results.HANDLED_SEPARATELY) {
      console.log(`  ${r.filename}`);
    }
    console.log('');
  }

  // Mutation frequency
  const mutationTally = {};
  for (const r of results.MODIFY) {
    for (const m of r.mutations) {
      const key = m.replace(/\(\d+\)/, '');
      mutationTally[key] = (mutationTally[key] || 0) + 1;
    }
  }
  if (Object.keys(mutationTally).length) {
    console.log('Mutation frequency across MODIFY files:');
    for (const [k, v] of Object.entries(mutationTally).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(32)} ${v}`);
    }
    console.log('');
  }

  if (VERBOSE || !EXECUTE) {
    console.log('Per-file changes (MODIFY):');
    for (const r of results.MODIFY) {
      const diff = r.diffBytes >= 0 ? `+${r.diffBytes}b` : `${r.diffBytes}b`;
      console.log(`  ${r.filename.padEnd(52)} ${diff.padStart(8)}  ${r.mutations.join(', ')}`);
    }
    console.log('');
  }

  if (results.NOOP.length && VERBOSE) {
    console.log('NOOP files (already rewritten, safe to skip):');
    for (const r of results.NOOP) console.log(`  ${r.filename}`);
    console.log('');
  }

  if (!EXECUTE) {
    console.log('This was a DRY RUN. To apply, re-run with:');
    console.log(`  node scripts/blog-rewrite.mjs --execute`);
  } else {
    console.log(`Wrote ${results.MODIFY.length} files.`);
  }
}

main();
