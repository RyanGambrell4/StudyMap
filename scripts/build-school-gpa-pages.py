#!/usr/bin/env python3
"""Build what-gpa-do-you-need-for-<school>.html pages from content/cds-gpa-2025.json.

Every figure comes from the school's own Common Data Set 2025-26 (section C) or is
plain arithmetic on it. Schools that leave C12 blank get a page that says so rather
than an estimate. Re-run after editing the data:
    python3 scripts/build-school-gpa-pages.py
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
D = json.load(open(os.path.join(ROOT, 'content', 'cds-gpa-2025.json'), encoding='utf-8'))
TEMPLATE = open(os.path.join(PUB, 'gpa-raise-calculator.html'), encoding='utf-8').read()
BANDS = ['4.0 and above', '3.75 to 3.99', '3.50 to 3.74', '3.25 to 3.49', '3.00 to 3.24', '2.50 to 2.99', '2.00 to 2.49', '1.00 to 1.99']
STUDY_APP = {'carnegie-mellon': 'carnegie-mellon', 'florida-state': 'florida-state', 'university-of-georgia': 'university-of-georgia',
             'university-of-pittsburgh': 'university-of-pittsburgh', 'university-of-pennsylvania': 'upenn', 'georgia-tech': 'georgia-tech',
             'unc-chapel-hill': 'unc-chapel-hill', 'university-of-florida': 'university-of-florida', 'uiuc': 'uiuc',
             'university-of-virginia': 'university-of-virginia', 'yale': 'yale'}


def page_slug(s):
    return s.get('page') or f"what-gpa-do-you-need-for-{s['slug']}"


def esc(x):
    return str(x).replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


def pct(x):
    return f'{x:g}'


def fmt_gpa(x):
    return f'{x:.2f}' if round(x, 2) != round(x, 1) else f'{x:.1f}'


def the(name):
    # 'the University of Chicago' in running text; titles keep the bare name.
    return 'the ' + name if name.startswith('University') else name


def title_for(s):
    for n in (s['name'], s.get('short', s['name'])):
        for t in (f"What GPA Do You Need for {n}? (2026) | StudyEdge AI", f"What GPA Do You Need for {n}? | StudyEdge AI", f"GPA for {n}: 2025-26 Data | StudyEdge AI"):
            if len(t) <= 60:
                return t
    raise SystemExit('no title fits ' + s['slug'])


def build(s):
    slug = page_slug(s)
    url = 'https://getstudyedge.com/' + slug
    name, short = s['name'], s.get('short', s['name'])
    tname = the(name)
    rate = f"{round(100 * s['admitted'] / s['applied'], 1):g}"
    counts = f"{s['admitted']:,} of {s['applied']:,} applicants"
    gpa = s.get('c12_gpa')
    title = title_for(s)
    src_link = f'<a href="{s["url"]}" target="_blank" rel="noopener">{esc(name)} Common Data Set {s["cds"]}</a>'
    url_note = f' ({esc(s["url_note"])})' if s.get('url_note') else ''

    if gpa is not None:
        g = fmt_gpa(gpa)
        typ = s.get('gpa_type')
        if typ == 'unweighted':
            kind = f" That figure is unweighted. {esc(short)} also reports a weighted average of {fmt_gpa(s['weighted_gpa'])}."
        elif gpa > 4.0:
            kind = " The Common Data Set does not say whether this is weighted or unweighted, but an average above 4.0 is only possible if weighted GPAs are included."
        else:
            kind = " The Common Data Set does not say whether this average is weighted or unweighted."
        answer = (f"First-year students who enrolled at {esc(tname)} in fall 2025 had an average high school GPA of <strong>{g}</strong>, "
                  f"according to the school's {s['cds']} Common Data Set ({pct(s['c12_pct'])}% of them reported a GPA).{kind} "
                  f"{esc(short)} admitted {rate}% of applicants ({counts}).")
        desc = f"{name}'s fall 2025 first-year class averaged a {g} high school GPA, and {rate}% of applicants were admitted. Official Common Data Set figures."
        if len(desc) > 160:
            desc = f"{short}'s fall 2025 class averaged a {g} high school GPA; {rate}% of applicants were admitted. Official Common Data Set data."
        faq = [(f"What GPA do you need for {name}?",
                f"There is no published minimum. First-year students who enrolled in fall 2025 averaged a {g} high school GPA, according to {short}'s {s['cds']} Common Data Set."),
               (f"What is {name}'s acceptance rate?",
                f"{short} admitted {rate}% of first-year applicants for fall 2025: {s['admitted']:,} of {s['applied']:,}, from its {s['cds']} Common Data Set.")]
        if typ != 'unweighted':
            faq.append((f"Is {short}'s average GPA weighted or unweighted?",
                        "The Common Data Set does not say." + (" Because the average is above 4.0, it must include weighted GPAs." if gpa > 4.0 else " Colleges can report either.")))
    else:
        answer = (f"{esc(tname[0].upper() + tname[1:])} does not publish an average high school GPA. Its {s['cds']} Common Data Set leaves the GPA section (C12) blank, "
                  f"so any average you see quoted for {esc(short)} comes from somewhere other than the school. What it does publish: "
                  f"{esc(short)} admitted {rate}% of applicants for fall 2025 ({counts}).")
        desc = f"{name} does not publish an average GPA in its Common Data Set. Here is what it does publish, including its {rate}% admit rate for fall 2025."
        if len(desc) > 160:
            desc = f"{short} does not publish an average GPA. Here is what its 2025-26 Common Data Set does show, including a {rate}% admit rate."
        faq = [(f"What GPA do you need for {name}?",
                f"{short} does not publish an average or minimum high school GPA; the GPA section of its {s['cds']} Common Data Set is blank. It admitted {rate}% of applicants for fall 2025."),
               (f"What is {name}'s acceptance rate?",
                f"{short} admitted {rate}% of first-year applicants for fall 2025: {s['admitted']:,} of {s['applied']:,}, from its {s['cds']} Common Data Set.")]
    assert len(desc) <= 160, (slug, len(desc))

    dist = ''
    if s.get('c11'):
        rows = ''
        for band, v in zip(BANDS, s['c11']):
            if v is None:
                continue
            rows += (f'        <div class="ap-bar"><span class="lab">{band}</span><span class="track" role="presentation">'
                     f'<span class="fill" style="width:{min(v, 100)}%;display:block"></span></span><span class="pct">{pct(v)}%</span></div>\n')
        top3 = round(sum(x or 0 for x in s['c11'][:3]), 1)
        note = f'<p class="ap-sources">{esc(s["c11_note"])}</p>' if s.get('c11_note') else ''
        dist = f"""
    <h2>GPAs of {esc(short)}'s fall 2025 first-year class</h2>
    <p>The share of enrolled first-year students in each high school GPA band, from section C11 of the Common Data Set.</p>
    <div class="ap-bars" role="img" aria-label="{esc(short)} fall 2025 first-years by high school GPA">
{rows}    </div>
    {note}
    <p>Adding the top three bands, about {top3:g}% of enrolled first-years had a GPA of 3.50 or higher. {pct(s['c11'][0])}% had a 4.0 or above.</p>
"""
    elif s.get('c11_note') and gpa is not None:
        dist = f'\n    <p class="ap-sources">{esc(s["c11_note"])}</p>\n'

    weighted_line = ''
    if s.get('gpa_type') == 'unweighted':
        weighted_line = (f"<p>{esc(short)} is one of the few schools that reports both: an unweighted average of {fmt_gpa(gpa)} "
                         f"and a weighted average of {fmt_gpa(s['weighted_gpa'])} ({pct(s['weighted_pct'])}% submitting). Compare your own GPA on the same basis.</p>")

    if gpa is not None:
        hero_sub = f"The average high school GPA and admit rate {esc(short)} reported for its fall 2025 first-year class, straight from its Common Data Set."
        read_lead = "These are the GPAs of students who enrolled, not a cutoff."
    else:
        hero_sub = f"What {esc(short)}'s own Common Data Set says, and does not say, about GPA for its fall 2025 first-year class."
        read_lead = "Without a published average, the honest comparison is with the admit rate and the factors the school lists."
    faq_html = ''.join(f'    <h3>{esc(q)}</h3>\n    <p>{esc(a)}</p>\n' for q, a in faq)
    head = TEMPLATE[:TEMPLATE.index('  <script type="application/ld+json">')]
    head = head.replace("GPA Raise Calculator: How Many A's Do I Need? | StudyEdge AI", esc(title))
    head = re.sub(r'(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*', lambda m: m.group(1) + esc(desc), head)
    head = head.replace('https://getstudyedge.com/gpa-raise-calculator', url)
    assert 'raise' not in head.lower()

    lds = [
        {"@context": "https://schema.org", "@type": "Article", "headline": f"What GPA do you need for {name}?", "description": desc, "url": url,
         "datePublished": "2026-10-31", "dateModified": "2026-10-31",
         "author": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"},
         "publisher": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"},
         "citation": s.get('ir_page') or s['url'], "about": {"@type": "CollegeOrUniversity", "name": name}},
        {"@context": "https://schema.org", "@type": "FAQPage",
         "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://getstudyedge.com/"},
            {"@type": "ListItem", "position": 2, "name": "GPA Requirements", "item": "https://getstudyedge.com/gpa-requirements"},
            {"@type": "ListItem", "position": 3, "name": f"What GPA do you need for {name}?", "item": url}]},
    ]
    ld_html = ''.join('  <script type="application/ld+json">\n  ' + json.dumps(x, indent=2).replace('\n', '\n  ') + '\n  </script>\n' for x in lds)
    style = """  <style>
    .ap-answer { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 24px 28px; max-width: 760px; margin: 0 auto; }
    .ap-answer p { margin: 0; font-size: 18px; line-height: 1.6; }
    .ap-bars { margin: 18px 0 8px; }
    .ap-bar { display: grid; grid-template-columns: 110px 1fr 64px; gap: 12px; align-items: center; margin: 8px 0; font-size: 15px; }
    .ap-bar .track { background: #EFF1F4; border-radius: 6px; height: 22px; overflow: hidden; }
    .ap-bar .fill { background: #3452D9; height: 100%; border-radius: 6px; }
    .ap-bar .lab { font-weight: 600; }
    .ap-bar .pct { text-align: right; font-variant-numeric: tabular-nums; }
    .ap-sources { font-size: 14px; color: var(--muted); }
  </style>
"""
    tail_head = TEMPLATE[TEMPLATE.index('  <script src="/ph-init.js"></script>'):TEMPLATE.index('</header>') + len('</header>')]
    tail_head = re.sub(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', '', tail_head)

    app = STUDY_APP.get(s['slug'])
    app_li = f'      <li><a href="/best-study-app-for-{app}-students">Best study app for {esc(short)} students</a></li>\n' if app else ''
    app_sentence = f' and our guide to the <a href="/best-study-app-for-{app}-students">best study app for {esc(short)} students</a>' if app else ''
    peers = [x for x in D['schools'] if x is not s and x.get('c12_gpa') is not None][:10]
    peer_html = ''.join(f'      <li><a href="/{page_slug(x)}">What GPA do you need for {esc(x.get("short", x["name"]))}?</a></li>\n' for x in peers)

    body = f"""

<section class="hero">
  <div class="container">
    <div class="eyebrow eyebrow-indigo">GPA requirements</div>
    <h1>What GPA Do You Need for {esc(name)}?</h1>
    <p class="hero-sub">{hero_sub}</p>
  </div>
</section>

<section class="section" style="padding-top: 24px;">
  <div class="container">
    <div class="ap-answer">
      <p>{answer}</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width: 760px;">{dist}
    <h2>How to read these numbers</h2>
    <p>{read_lead} {esc(short)} does not publish a minimum GPA in its Common Data Set, and the same document's section C7 lists how much weight the school says it gives to GPA, course rigor and other factors. High schools also calculate GPA differently, so check whether yours is weighted before comparing. The <a href="/weighted-gpa-calculator">weighted vs unweighted GPA calculator</a> converts between the two.</p>
    {weighted_line}

    <h2>Once you are in college</h2>
    <p>College GPA starts over at 0 credits. To see what it takes to reach a target, use the <a href="/gpa-calculator">GPA calculator</a> and the <a href="/gpa-raise-calculator">GPA raise calculator</a>{app_sentence}.</p>

    <h2>Questions</h2>
{faq_html}
    <h2>Source</h2>
    <p class="ap-sources">{src_link}{url_note}, section C (first-time, first-year admission), fall 2025 entering class. Retrieved October 31, 2026.{(' Applicant counts are ' + esc(s['applied_note']) + '.') if s.get('applied_note') else ''}</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta-block">
      <h2>Keep your GPA where you want it.</h2>
      <p>StudyEdge AI turns your exam dates into a weekly study plan, with flashcards, practice questions and grade tracking in one place.</p>
      <a href="/app?signup=1" class="btn btn-primary btn-lg" data-seo-cta="school-gpa-page">Try StudyEdge AI Free</a>
      <p class="cta-fine">Free plan available.</p>
    </div>
  </div>
</section>


<!-- Related links (internal) -->
<section class="related-links" style="background:#FFFFFF;border-top:1px solid rgba(0,0,0,0.07);padding:48px 24px">
  <div class="container" style="max-width:1100px;margin:0 auto">
    <h2 style="font-size:20px;font-weight:600;color:#111;margin:0 0 18px;letter-spacing:-0.01em">GPA at other schools</h2>
    <ul style="list-style:none;padding:0;margin:0 0 32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
{peer_html}      <li><a href="/gpa-requirements">All GPA requirement guides</a></li>
    </ul>
    <h2 style="font-size:20px;font-weight:600;color:#111;margin:0 0 18px;letter-spacing:-0.01em">GPA tools</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
      <li><a href="/gpa-calculator">GPA calculator</a></li>
      <li><a href="/weighted-gpa-calculator">Weighted vs unweighted GPA calculator</a></li>
      <li><a href="/gpa-raise-calculator">How many A's to raise your GPA</a></li>
{app_li}    </ul>
  </div>
</section>
"""
    footer = TEMPLATE[TEMPLATE.index('<footer class="site-footer">'):TEMPLATE.index('</footer>') + len('</footer>')]
    html = head + ld_html + style + tail_head + body + footer + '\n\n</body>\n</html>\n'
    assert '—' not in html, slug
    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', html):
        json.loads(block)
    out = os.path.join(PUB, slug + '.html')
    if os.path.exists(out):
        old = open(out, encoding='utf-8').read()
        m = re.search(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', old)
        if m:
            html = html.replace('</head>', m.group(0) + '</head>', 1)
    open(out, 'w', encoding='utf-8').write(html)
    return slug, title


if __name__ == '__main__':
    for s in D['schools']:
        slug, title = build(s)
        print(f'{slug} ({len(title)})')
