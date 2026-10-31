#!/usr/bin/env python3
"""Static enhancements for /blog pages that the stylesheet alone cannot do.

Idempotent: safe to re-run after adding a post. Run from the repo root:
    python3 scripts/blog-enhance.py

What it does
- Index cards: replaces the gradient cover + generic icon with the post's own
  cover photo (from the post's first inline image, else its og:image).
- Posts: tags the cover photo (class="ed-cover") so CSS can widen it, adds a
  category kicker above the headline, appends a three-card "Keep reading"
  block (same category first) before the related links, and loads
  /blog/editorial.js (sticky "On this page" rail).

Category comes from the index card for that post; posts without one get no
kicker and fall back to "Study Techniques" for Keep-reading neighbours.
"""
import glob, html, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'blog')
os.chdir(ROOT)

HUBS = {
    'Study Techniques': '/blog/study-techniques', 'Exam Prep': '/blog/exam-prep',
    'Standardized Tests': '/blog/exam-prep', 'Subject Guides': '/blog/subject-guides',
    'GPA &amp; Grades': '/blog/gpa-grades', 'Pre-Med': '/blog/exam-prep',
}
SKIP = {'index.html', 'author.html', 'editorial-policy.html'}


def base(url):
    return (url or '').split('?')[0]


def thumb(url, w=720, h=450):
    if not url: return url
    # generated covers (scripts/build-covers.mjs): use the WebP next to the PNG
    if '/covers/' in url:
        return '/covers/' + url.split('/covers/', 1)[1].rsplit('.', 1)[0] + '.webp'
    url = re.sub(r'([?&])w=\d+', rf'\1w={w}', url)
    return re.sub(r'([?&])h=\d+', rf'\1h={h}', url)


index = open('index.html', encoding='utf-8').read()
category = {href.rsplit('/', 1)[1]: cat for href, cat in re.findall(
    r'<a href="(/blog/[^"]+)" class="b-card">\s*<div class="b-cover[^"]*">\s*(?:<img[^>]*>\s*)?<span class="b-cover-tag">([^<]+)</span>', index)}

posts = {}
for f in sorted(glob.glob('*.html')):
    if f in SKIP: continue
    t = open(f, encoding='utf-8').read()
    # ignore our own Keep-reading thumbnails when looking for this post's cover
    t = re.sub(r'<!-- ed:keep-reading -->.*?<!-- /ed:keep-reading -->', '', t, flags=re.S)
    slug = f[:-5]
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', t, re.S)
    hero = re.search(r'<img[^>]+src="(https://images\.unsplash\.com/[^"]+)"', t[t.find('</h1>'):] if '</h1>' in t else t)
    og = re.search(r'<meta property="og:image" content="([^"]+)"', t)
    hub = re.search(r'"@type":\s*"CollectionPage"', t)
    posts[slug] = dict(
        title=re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h1.group(1))).strip() if h1 else slug,
        img=(og.group(1) if og and '/covers/' in og.group(1) else hero.group(1) if hero else (og.group(1) if og else None)),
        cat=category.get(slug), hub=bool(hub))

# ---------------------------------------------------------------- index cards
def card_cover(m):
    slug, cls, tag = m.group(1), m.group(2), m.group(3)
    img = thumb(posts.get(slug, {}).get('img'))
    pic = f'<img src="{img}" alt="" loading="lazy" width="1200" height="630">' if img else ''
    return (f'<a href="/blog/{slug}" class="b-card">\n        <div class="b-cover {cls}">\n          {pic}\n'
            f'          <span class="b-cover-tag">{tag}</span>\n        </div>')

index2 = re.sub(
    r'<a href="/blog/([^"]+)" class="b-card">\s*<div class="b-cover ([^"]*)">\s*(?:<img[^>]*>\s*)?<span class="b-cover-tag">([^<]+)</span>\s*(?:<svg>.*?</svg>\s*)?</div>',
    card_cover, index, flags=re.S)
if index2 != index:
    open('index.html', 'w', encoding='utf-8').write(index2)

# ---------------------------------------------------------------- posts
order = [s for s in posts if not posts[s]['hub']]

def keep_reading(slug):
    cat = posts[slug]['cat'] or 'Study Techniques'
    same = [s for s in order if s != slug and posts[s]['cat'] == cat and posts[s]['img']]
    rest = [s for s in order if s != slug and s not in same and posts[s]['img']]
    i = order.index(slug) if slug in order else 0
    pool = (same[i % max(len(same), 1):] + same[:i % max(len(same), 1)]) + rest[i % len(rest):] + rest[:i % len(rest)]
    # no two cards (or the current post) may share a cover photo
    seen = {base(posts[slug]['img'])}
    picks = []
    for s in pool:
        b = base(posts[s]['img'])
        if b in seen: continue
        seen.add(b); picks.append(s)
        if len(picks) == 3: break
    cards = []
    for s in picks:
        p = posts[s]
        c = p['cat'] or 'Study Techniques'
        cards.append(
            f'      <a class="kr-card" href="/blog/{s}">\n'
            f'        <img src="{thumb(p["img"])}" alt="" loading="lazy" width="1200" height="630">\n'
            f'        <span class="kr-cat">{c}</span>\n'
            f'        <span class="kr-title">{html.escape(html.unescape(p["title"]), quote=False)}</span>\n'
            f'      </a>')
    return ('<!-- ed:keep-reading -->\n<section class="keep-reading" aria-labelledby="kr-h">\n  <div class="kr-inner">\n'
            '    <h2 id="kr-h">Keep reading</h2>\n    <div class="kr-grid">\n' + '\n'.join(cards) +
            '\n    </div>\n  </div>\n</section>\n<!-- /ed:keep-reading -->\n')

changed = 0
for slug, p in posts.items():
    f = slug + '.html'
    t0 = t = open(f, encoding='utf-8').read()
    # cover photo: first unsplash <img> after the headline
    h1_end = t.find('</h1>')
    if h1_end != -1 and 'class="ed-cover"' not in t:
        stop = t.find('<!-- ed:keep-reading -->')
        m = re.compile(r'<img src="https://images\.unsplash\.com/[^"]+"[^>]*>').search(t, h1_end, stop if stop != -1 else len(t))
        if m:
            tag = re.sub(r'\s+style="[^"]*"', '', m.group(0)).replace('<img ', '<img class="ed-cover" ', 1)
            t = t[:m.start()] + tag + t[m.end():]
    # kicker above the headline
    if p['cat'] and 'class="ed-kicker"' not in t and not p['hub']:
        href = HUBS.get(p['cat'], '/blog')
        t = re.sub(r'(<h1[^>]*>)', f'<p class="ed-kicker"><a href="{href}">{p["cat"]}</a></p>\n    \\1', t, count=1)
    # keep reading
    if not p['hub']:
        block = keep_reading(slug)
        if '<!-- ed:keep-reading -->' in t:
            t = re.sub(r'<!-- ed:keep-reading -->.*?<!-- /ed:keep-reading -->\n', block, t, flags=re.S)
        else:
            anchor = re.search(r'<section class="related-links"', t) or re.search(r'<footer', t)
            if anchor: t = t[:anchor.start()] + block + t[anchor.start():]
    if '/blog/editorial.js' not in t:
        t = t.replace('</body>', '<script src="/blog/editorial.js" defer></script>\n</body>', 1)
    if t != t0:
        open(f, 'w', encoding='utf-8').write(t); changed += 1

print(f'index cards: {len(category)} categorised; posts changed: {changed}/{len(posts)}')
