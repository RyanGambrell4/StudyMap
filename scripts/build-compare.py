#!/usr/bin/env python3
"""Render /compare pages from content/compare/*.json.

    python3 scripts/build-compare.py

Each JSON file is one head-to-head page. The rules the data must follow (they are
what make these pages trustworthy, and what got the old pages in trouble):

- Every competitor fact carries a source URL from the competitor's own site and is
  listed under "sources"; "checked" is the date those pages were read.
- StudyEdge AI facts come from the codebase (src/lib/subscription.js,
  content/facts.json). No ratings, review counts, user counts or testimonials
  beyond facts.audience.
- "pick_them" (when the competitor is the better choice) is written first and
  must be genuine.

Outputs public/compare/<slug>.html and the hub public/compare/index.html.
"""
import glob, html, json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'content', 'compare')
OUT = os.path.join(ROOT, 'public', 'compare')
ORIGIN = 'https://getstudyedge.com'
FACTS = json.load(open(os.path.join(ROOT, 'content', 'facts.json')))
PRO, UNL = FACTS['plans']['pro'], FACTS['plans']['unlimited']
TRIAL = FACTS['trial']['days']


def esc(s): return html.escape(s, quote=True)
def fmt_date(iso):
    import datetime
    d = datetime.date.fromisoformat(iso)
    return d.strftime('%B %-d, %Y')


HEAD_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
              '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
              '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">')

HEADER = '''<header class="site-header">
  <nav class="site-nav">
    <a class="nav-logo" href="/"><img src="/favicon.png" alt="StudyEdge AI" />StudyEdge AI</a>
    <div class="nav-links">
      <a href="/#features">Features</a>
      <a href="/pricing">Pricing</a>
      <a href="/blog">Blog</a>
      <a href="/app?signup=1" class="nav-cta">Try Free</a>
    </div>
  </nav>
</header>'''

FOOTER = '''<footer class="site-footer">
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/compare">Comparisons</a>
    <a href="/study-schedule-generator">Study Schedule</a>
    <a href="/ai-tutor">AI Tutor</a>
    <a href="/ai-flashcard-maker">Flashcards</a>
    <a href="/blog">Blog</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </div>
  <p class="footer-copy">&copy; 2026 StudyEdge AI &mdash; getstudyedge.com. Not affiliated with Study Edge (studyedge.com).</p>
</footer>'''


def head(title, desc, url, jsonld):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link rel="canonical" href="{url}" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{ORIGIN}/og-hero-v1.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc(title)}" />
  <meta name="twitter:description" content="{esc(desc)}" />
  {HEAD_FONTS}
  <link rel="stylesheet" href="/blog/blog.css" />
  <link rel="stylesheet" href="/blog/editorial.css" />
  <link rel="stylesheet" href="/compare/compare.css" />
  <script src="/ph-init.js"></script>
  <script src="/utm-propagate.js" defer></script>
  <script type="application/ld+json">
{json.dumps(jsonld, indent=2, ensure_ascii=False)}
  </script>
</head>'''


def render(d, others):
    them, slug = d['competitor'], d['slug']
    url = f'{ORIGIN}/compare/{slug}'
    checked = fmt_date(d['checked'])
    toc = [('short-answer', 'The short answer'), ('side-by-side', 'Side by side'),
           ('pick-them', f'When {them} is the better pick'), ('pick-us', 'When StudyEdge AI is the better pick'),
           ('pricing', 'Pricing')]
    toc += [(dd['id'], dd['h']) for dd in d['deep_dives']]
    toc += [('both', 'Can you use both?'), ('faq', 'Questions'), ('sources', 'Sources')]

    faq_ld = {'@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': q['a']}} for q in d['faq']]}
    jsonld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': d['title'], 'description': d['description'], 'url': url,
         'datePublished': d['checked'], 'dateModified': d['checked'],
         'author': {'@type': 'Organization', 'name': 'StudyEdge AI', 'url': ORIGIN},
         'publisher': {'@id': f'{ORIGIN}/#organization'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': ORIGIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Comparisons', 'item': ORIGIN + '/compare'},
            {'@type': 'ListItem', 'position': 3, 'name': f'StudyEdge AI vs {them}', 'item': url}]},
        faq_ld]}

    def li(items): return '\n'.join(f'          <li>{x}</li>' for x in items)

    rows = []
    for r in d['table']:
        if 'group' in r:
            rows.append(f'          <tr class="cmp-group"><th colspan="3" scope="colgroup">{esc(r["group"])}</th></tr>')
        else:
            rows.append(f'          <tr><th scope="row">{esc(r["topic"])}</th><td data-label="{esc(them)}">{r["them"]}</td><td class="is-us" data-label="StudyEdge AI">{r["us"]}</td></tr>')

    def price_rows(rs): return '\n'.join(f'        <div class="cmp-price-row"><span>{esc(a)}</span><span>{b}</span></div>' for a, b in rs)
    us_prices = [('Free', '$0, no card needed'),
                 ('Pro', f'${PRO["month"]}/mo or ${PRO["year"]}/yr'),
                 ('Unlimited', f'${UNL["month"]}/mo or ${UNL["year"]}/yr'),
                 ('Free trial', f'{TRIAL} days of Pro (card required)')]

    deep = '\n'.join(f'''    <h2 id="{dd["id"]}">{esc(dd["h"])}</h2>
{dd["html"]}''' for dd in d['deep_dives'])
    faq = '\n'.join(f'''      <details>
        <summary>{esc(q["q"])}</summary>
        <p>{esc(q["a"])}</p>
      </details>''' for q in d['faq'])
    sources = '\n'.join(f'        <li><a href="{esc(s["url"])}" rel="nofollow noopener" target="_blank">{esc(s["label"])}</a></li>' for s in d['sources'])
    more = '\n'.join(f'        <li><a href="/compare/{o["slug"]}">StudyEdge AI vs {esc(o["competitor"])}</a></li>' for o in others if o['slug'] != slug)
    toc_html = '\n'.join(f'        <li><a href="#{i}">{esc(t)}</a></li>' for i, t in toc)

    return head(d['title'], d['description'], url, jsonld) + f'''
<body>
{HEADER}

<section class="post-hero">
  <div class="container">
    <p class="ed-kicker"><a href="/compare">Comparison</a></p>
    <h1>StudyEdge AI vs {esc(them)}</h1>
    <p class="post-intro">{d["deck"]}</p>
    <div class="post-meta"><a href="/blog/author">StudyEdge AI</a> &middot; Updated {checked}</div>
  </div>
</section>

<div class="post-body">
  <div class="container">
    <p class="cmp-disclosure"><strong>Before you read:</strong> we make StudyEdge AI, so weigh that. Everything we say about {esc(them)} comes from {esc(them)}'s own website, checked on {checked}, and is linked under <a href="#sources">Sources</a>. Plans change; check their pricing page before you buy.</p>

    <div class="toc">
      <span class="toc-label">On this page</span>
      <ol>
{toc_html}
      </ol>
    </div>

    <h2 id="short-answer">The short answer</h2>
{d["short_answer"]}
    <div class="cmp-picks">
      <div class="cmp-pick">
        <p class="cmp-pick-label">Choose {esc(them)} if</p>
        <h3>{esc(d["pick_them_title"])}</h3>
        <ul>
{li(d["pick_them_short"])}
        </ul>
      </div>
      <div class="cmp-pick is-us">
        <p class="cmp-pick-label">Choose StudyEdge AI if</p>
        <h3>{esc(d["pick_us_title"])}</h3>
        <ul>
{li(d["pick_us_short"])}
        </ul>
      </div>
    </div>

    <h2 id="side-by-side">Side by side</h2>
    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr><th scope="col">Topic</th><th scope="col">{esc(them)}</th><th scope="col" class="is-us">StudyEdge AI</th></tr></thead>
        <tbody>
{chr(10).join(rows)}
        </tbody>
      </table>
    </div>
    <p class="cmp-note">{esc(them)} details from their website on {checked}. StudyEdge AI details from our current plans.</p>

    <h2 id="pick-them">When {esc(them)} is the better pick</h2>
{d["pick_them"]}

    <h2 id="pick-us">When StudyEdge AI is the better pick</h2>
{d["pick_us"]}

    <h2 id="pricing">Pricing</h2>
{d.get("pricing_intro", "")}
    <div class="cmp-pricing">
      <div class="cmp-price-col">
        <h3>{esc(them)}</h3>
{price_rows(d["their_prices"])}
        <p class="cmp-note">{d["their_price_note"]}</p>
      </div>
      <div class="cmp-price-col">
        <h3>StudyEdge AI</h3>
{price_rows(us_prices)}
        <p class="cmp-note">Free plan: 1 course, 5 AI actions a month, and one try of each premium tool. Prices in USD.</p>
      </div>
    </div>

{deep}

    <h2 id="both">Can you use both?</h2>
{d["both"]}

    <div class="cmp-cta">
      <h2>See how your semester looks planned out</h2>
      <p>Add your courses and exam dates, and StudyEdge AI builds the schedule, the session plans and the review cards around them.</p>
      <a class="cmp-btn" href="/app?signup=1">Start free</a>
      <span class="cmp-fine">Free plan, no card. {TRIAL}-day Pro trial available.</span>
    </div>

    <section class="cmp-faq">
      <h2 id="faq">Questions</h2>
{faq}
    </section>

    <section class="cmp-sources">
      <h2 id="sources">Sources</h2>
      <p>{esc(them)} pages read on {checked}:</p>
      <ul>
{sources}
      </ul>
    </section>

    <nav class="cmp-more" aria-label="Other comparisons">
      <h2>Other comparisons</h2>
      <ul>
{more}
        <li><a href="/compare">All comparisons</a></li>
      </ul>
    </nav>
  </div>
</div>

{FOOTER}
<script src="/blog/editorial.js" defer></script>
</body>
</html>
'''


def render_hub(pages):
    url = f'{ORIGIN}/compare'
    title = 'StudyEdge AI Comparisons: How It Stacks Up | StudyEdge AI'
    desc = 'Honest head-to-head comparisons of StudyEdge AI with other study apps, with sources for every claim and the cases where the other app is the better pick.'
    jsonld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'StudyEdge AI comparisons', 'url': url,
              'hasPart': [{'@type': 'Article', 'name': f'StudyEdge AI vs {p["competitor"]}', 'url': f'{url}/{p["slug"]}'} for p in pages]}
    items = '\n'.join(f'''    <li><a href="/compare/{p["slug"]}"><strong>StudyEdge AI vs {esc(p["competitor"])}</strong><span>{esc(p["hub_blurb"])}</span></a></li>''' for p in pages)
    return head(title, desc, url, jsonld) + f'''
<body>
{HEADER}
<section class="post-hero">
  <div class="container">
    <p class="ed-kicker"><a href="/compare">Comparisons</a></p>
    <h1>How StudyEdge AI compares</h1>
    <p class="post-intro">Head-to-head pages for the study apps students ask us about. Each one says where the other app wins, and links every claim about it to that company's own website.</p>
  </div>
</section>
<div class="post-body">
  <div class="container">
    <ul class="cmp-hub-list">
{items}
    </ul>
    <p class="cmp-note">We make StudyEdge AI. Found something out of date? Email support@getstudyedge.com and we will fix it.</p>
  </div>
</div>
{FOOTER}
</body>
</html>
'''


pages = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(SRC, '*.json')))]
pages.sort(key=lambda p: p.get('order', 99))
os.makedirs(OUT, exist_ok=True)
for p in pages:
    open(os.path.join(OUT, p['slug'] + '.html'), 'w', encoding='utf-8').write(render(p, pages))
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(render_hub(pages))
print('built', [p['slug'] for p in pages], '+ hub')
