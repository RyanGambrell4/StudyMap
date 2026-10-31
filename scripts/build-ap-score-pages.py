#!/usr/bin/env python3
"""Build public/is-a-3-on-ap-<subject>-good.html from content/ap-scores-2026.json.

Every number on these pages comes from the data file (College Board's 2026 score
distributions and 2027 exam schedule). Uses public/gpa-raise-calculator.html for the
shared head, nav and footer. Re-run after editing the data:
    python3 scripts/build-ap-score-pages.py
"""
import json, re, datetime, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
D = json.load(open(os.path.join(ROOT, 'content', 'ap-scores-2026.json'), encoding='utf-8'))
TEMPLATE = open(os.path.join(PUB, 'gpa-raise-calculator.html'), encoding='utf-8').read()
SRC = D['sources']
YEAR = D['year']
SCALE = D['score_scale']
GROUP_NAMES = {'science': 'AP science', 'math': 'AP math and computer science', 'english': 'AP English', 'history': 'AP history and social science'}


def page_slug(s):
    return f"is-a-3-on-ap-{s['slug']}-good"


def esc(x):
    return x.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


def title_for(s):
    for t in (f"Is a 3 on AP {s['name']} Good? {YEAR} Score Data | StudyEdge AI",
              f"Is a 3 on AP {s['name']} Good? | StudyEdge AI",
              f"Is a 3 on AP {s.get('short', s['name'])} Good? {YEAR} Data | StudyEdge AI"):
        if len(t) <= 60:
            return t
    raise SystemExit('no title fits for ' + s['slug'])


# Score-page slug -> flashcard deck slug (public/ap-<deck>-flashcards.html, built by
# scripts/build-ap-flashcard-pages.py). The deck link appears only if that page exists.
DECK_SLUGS = {'biology': 'biology', 'psychology': 'psychology', 'us-history': 'us-history',
              'world-history': 'world-history', 'calculus-ab': 'calculus-ab', 'chemistry': 'chemistry',
              'statistics': 'statistics', 'english-language': 'english-language', 'physics-1': 'physics-1'}


def deck_for(s):
    d = DECK_SLUGS.get(s['slug'])
    if d and os.path.exists(os.path.join(PUB, f'ap-{d}-flashcards.html')):
        return f'ap-{d}-flashcards'
    return None


def exam_date(s):
    d = datetime.date.fromisoformat(s['exam2027'][0])
    return d.strftime('%A, %B ') + str(d.day) + d.strftime(', %Y'), s['exam2027'][1]


def build(s):
    slug = page_slug(s)
    url = 'https://getstudyedge.com/' + slug
    name = s['name']
    full = s.get('full', name)
    p5, p4, p3, p2, p1 = s['pct']
    passing = s['pass']
    title = title_for(s)
    date_str, session = exam_date(s)
    desc = (f"A 3 on AP {name} is a passing score. In {YEAR}, {passing}% of students scored 3 or higher "
            f"and {p5}% earned a 5. See every score and the 2027 exam date.")
    assert len(desc) <= 165, (slug, len(desc))

    faq = [
        (f"Is a 3 on AP {name} good?",
         f"A 3 is a passing score. The College Board describes a 3 as \"{SCALE['3']}\" for college credit. In {YEAR}, {p3}% of AP {name} students "
         f"scored exactly 3, and {passing}% scored 3 or higher. Whether it earns credit depends on the college."),
        (f"What percent of students get a 5 on AP {name}?",
         f"In {YEAR}, {p5}% of AP {name} students earned a 5 and {p4}% earned a 4, according to the College Board's score distributions."),
        (f"When is the 2027 AP {name} exam?",
         f"The College Board has scheduled the 2027 AP {full} exam for {date_str}, in the {session} session. Your AP coordinator confirms the exact time and room."),
        (f"Does a 3 on AP {name} get college credit?",
         f"The College Board and the American Council on Education recommend that colleges award credit for scores of 3 or higher, but each college sets its own "
         f"policy and some require a 4 or 5. Check the college's policy with the College Board's AP credit policy search."),
    ]

    head = TEMPLATE[:TEMPLATE.index('  <script type="application/ld+json">')]
    head = head.replace("GPA Raise Calculator: How Many A's Do I Need? | StudyEdge AI", esc(title))
    head = re.sub(r'(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*',
                  lambda m: m.group(1) + esc(desc), head)
    head = head.replace('https://getstudyedge.com/gpa-raise-calculator', url)
    assert 'raise' not in head.lower(), slug

    lds = [
        {"@context": "https://schema.org", "@type": "Article", "headline": f"Is a 3 on AP {name} Good?",
         "description": desc, "url": url, "datePublished": "2026-10-31", "dateModified": "2026-10-31",
         "author": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"},
         "publisher": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"},
         "citation": [SRC['distributions'], SRC['score_scale'], SRC['exam_dates']]},
        {"@context": "https://schema.org", "@type": "FAQPage",
         "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://getstudyedge.com/"},
            {"@type": "ListItem", "position": 2, "name": "AP Score Calculator", "item": "https://getstudyedge.com/ap-score-calculator"},
            {"@type": "ListItem", "position": 3, "name": f"Is a 3 on AP {name} Good?", "item": url}]},
    ]
    ld_html = ''.join('  <script type="application/ld+json">\n  ' + json.dumps(x, indent=2).replace('\n', '\n  ') + '\n  </script>\n' for x in lds)

    style = """  <style>
    .ap-answer { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 24px 28px; max-width: 760px; margin: 0 auto; }
    .ap-answer p { margin: 0; font-size: 18px; line-height: 1.6; }
    .ap-bars { margin: 18px 0 8px; }
    .ap-bar { display: grid; grid-template-columns: 70px 1fr 56px; gap: 12px; align-items: center; margin: 8px 0; font-size: 15px; }
    .ap-bar .track { background: #EFF1F4; border-radius: 6px; height: 22px; overflow: hidden; }
    .ap-bar .fill { background: #3452D9; height: 100%; border-radius: 6px; }
    .ap-bar.is-three .fill { background: #10A56E; }
    .ap-bar .lab { font-weight: 600; }
    .ap-bar .pct { text-align: right; font-variant-numeric: tabular-nums; }
    .ap-sources { font-size: 14px; color: var(--muted); }
    .ap-sources li { margin: 4px 0; }
  </style>
"""
    tail_head = TEMPLATE[TEMPLATE.index('  <script src="/ph-init.js"></script>'):TEMPLATE.index('</header>') + len('</header>')]
    tail_head = re.sub(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', '', tail_head)

    bars = ''
    for score, pct in zip((5, 4, 3, 2, 1), s['pct']):
        cls = ' is-three' if score == 3 else ''
        bars += (f'        <div class="ap-bar{cls}"><span class="lab">Score {score}</span>'
                 f'<span class="track" role="presentation"><span class="fill" style="width:{pct}%;display:block"></span></span>'
                 f'<span class="pct">{pct}%</span></div>\n')

    study = []
    if s.get('schedule'):
        study.append(f'the <a href="/{s["schedule"]}">AP {name} study schedule</a>')
    deck = deck_for(s)
    if deck:
        study.append(f'the <a href="/{deck}">AP {name} flashcards</a> built from the course framework')
    study.append('the <a href="/ap-exam-study-schedule-templates">AP exam study schedule templates</a>')
    study.append('the <a href="/ap-score-calculator">AP score calculator</a>')
    study_sentence = ', '.join(study[:-1]) + ' and ' + study[-1]

    siblings = [x for x in D['subjects'] if x['group'] == s['group'] and x['slug'] != s['slug']]
    others = [x for x in D['subjects'] if x['group'] != s['group']][:max(0, 8 - len(siblings))]
    sib_html = ''.join(f'      <li><a href="/{page_slug(x)}">Is a 3 on AP {x["name"]} good?</a></li>\n' for x in siblings + others)

    faq_html = ''.join(f'    <h3>{esc(q)}</h3>\n    <p>{esc(a)}</p>\n' for q, a in faq)

    body = f"""

<section class="hero">
  <div class="container">
    <div class="eyebrow eyebrow-indigo">AP {esc(name)} scores</div>
    <h1>Is a 3 on AP {esc(name)} Good?</h1>
    <p class="hero-sub">What a 3, 4 or 5 on the AP {esc(full)} exam means, how many students earned each score in {YEAR}, and when the 2027 exam is.</p>
  </div>
</section>

<section class="section" style="padding-top: 24px;">
  <div class="container">
    <div class="ap-answer">
      <p><strong>Yes, a 3 on AP {esc(name)} is a passing score.</strong> The College Board calls a 3 "{SCALE['3']}". In {YEAR}, {p3}% of AP {esc(name)} students scored exactly 3, and {passing}% scored 3 or higher. A 3 meets the score the College Board recommends colleges accept for credit, but each college decides for itself.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width: 760px;">
    <h2>AP {esc(name)} score distribution, {YEAR}</h2>
    <p>The share of AP {esc(full)} students who earned each score in {YEAR}, from the College Board's published distributions.</p>
    <div class="ap-bars" role="img" aria-label="AP {esc(name)} {YEAR} scores: 5 {p5}%, 4 {p4}%, 3 {p3}%, 2 {p2}%, 1 {p1}%">
{bars}    </div>
    <p>{passing}% of students earned a 3 or higher. The College Board rounds each figure to a whole percent.</p>

    <h2>What a 4 or a 5 on AP {esc(name)} means</h2>
    <p>The College Board describes a 4 as "{SCALE['4']}" and a 5 as "{SCALE['5']}". In {YEAR}, {p4}% of AP {esc(name)} students earned a 4 and {p5}% earned a 5. A 2 ("{SCALE['2']}") went to {p2}% of students and a 1 ("{SCALE['1']}") to {p1}%.</p>

    <h2>Will a 3 on AP {esc(name)} get you college credit?</h2>
    <p>The College Board and the American Council on Education recommend that colleges and universities award credit for AP scores of 3 or higher. That is a recommendation, not a rule. Colleges set their own policies, and the score a college wants can differ by subject. Look up the exact policy for each college on your list with the <a href="{SRC['credit_search']}" target="_blank" rel="noopener">College Board's AP credit policy search</a>.</p>

    <h2>When is the 2027 AP {esc(name)} exam?</h2>
    <p>The College Board has scheduled the 2027 AP {esc(full)} exam for <strong>{date_str}</strong>, in the {session} session. The College Board says the two daily sessions are typically morning and afternoon, and your AP coordinator confirms the exact time and room.</p>

    <h2>How to aim higher than a 3</h2>
    <p>Start with {study_sentence}. Practice under timed conditions with real past free-response questions from AP Central, and spend most of your review on the units where you lose the most points.</p>

    <h2>Questions</h2>
{faq_html}
    <h2>Sources</h2>
    <ul class="ap-sources">
      <li>College Board, <a href="{SRC['distributions']}" target="_blank" rel="noopener">{YEAR} AP Score Distributions</a></li>
      <li>College Board, <a href="{SRC['score_scale']}" target="_blank" rel="noopener">AP Score Scale Table</a></li>
      <li>College Board, <a href="{SRC['credit_recommendation']}" target="_blank" rel="noopener">AP credit-granting recommendations</a></li>
      <li>College Board, <a href="{SRC['exam_dates']}" target="_blank" rel="noopener">2027 AP Exam Schedule</a></li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta-block">
      <h2>Turn the 2027 exam date into a plan.</h2>
      <p>Add your AP exams to StudyEdge AI and it builds study sessions from now until exam day, with flashcards, practice questions and Focus Mode in one place.</p>
      <a href="/app?signup=1" class="btn btn-primary btn-lg" data-seo-cta="ap-score-page">Try StudyEdge AI Free</a>
      <p class="cta-fine">Free plan available.</p>
    </div>
  </div>
</section>


<!-- Related links (internal) -->
<section class="related-links" style="background:#FFFFFF;border-top:1px solid rgba(0,0,0,0.07);padding:48px 24px">
  <div class="container" style="max-width:1100px;margin:0 auto">
    <h2 style="font-size:20px;font-weight:600;color:#111;margin:0 0 18px;letter-spacing:-0.01em">Other AP scores</h2>
    <ul style="list-style:none;padding:0;margin:0 0 32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
{sib_html}    </ul>
    <h2 style="font-size:20px;font-weight:600;color:#111;margin:0 0 18px;letter-spacing:-0.01em">AP study tools</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
      <li><a href="/ap-score-calculator">AP score calculator</a></li>
      <li><a href="/ap-exam-study-schedule-templates">AP exam study schedule templates</a></li>
{f'      <li><a href="/{s["schedule"]}">AP {esc(name)} study schedule</a></li>' + chr(10) if s.get('schedule') else ''}{f'      <li><a href="/{deck}">AP {esc(name)} flashcards</a></li>' + chr(10) if deck else ''}    </ul>
  </div>
</section>
"""
    footer = TEMPLATE[TEMPLATE.index('<footer class="site-footer">'):TEMPLATE.index('</footer>') + len('</footer>')]
    html = head + ld_html + style + tail_head + body + footer + '\n\n</body>\n</html>\n'
    assert chr(0x2014) not in html and chr(0x2013) not in html, slug
    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', html):
        json.loads(block)
    out = os.path.join(PUB, slug + '.html')
    # Keep the cover block build-covers.mjs added on an earlier run.
    if os.path.exists(out):
        old = open(out, encoding='utf-8').read()
        m = re.search(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', old)
        if m:
            html = html.replace('</head>', m.group(0) + '</head>', 1)
    open(out, 'w', encoding='utf-8').write(html)
    return slug, title


if __name__ == '__main__':
    for s in D['subjects']:
        slug, title = build(s)
        print(f'{slug}  ({len(title)})  {title}')
