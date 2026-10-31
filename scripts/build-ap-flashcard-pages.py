#!/usr/bin/env python3
"""Build public/ap-<slug>-flashcards.html from content/ap-flashcards.json.

Every card comes from the College Board's Course and Exam Description (CED) for
the course and names the essential knowledge (EK), key concept (KC) or learning
objective code it quotes or paraphrases. Unit titles and exam weights come from
the same CED. Uses public/is-a-3-on-ap-biology-good.html (built by
scripts/build-ap-score-pages.py) for the shared head, nav and footer. Re-run
after editing the data:
    python3 scripts/build-ap-flashcard-pages.py
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
D = json.load(open(os.path.join(ROOT, 'content', 'ap-flashcards.json'), encoding='utf-8'))
TEMPLATE_SLUG = 'is-a-3-on-ap-biology-good'
TEMPLATE = open(os.path.join(PUB, TEMPLATE_SLUG + '.html'), encoding='utf-8').read()
TEMPLATE_TITLE = re.search(r'<title>([^<]*)</title>', TEMPLATE).group(1)
COURSES = D['courses']


def page_slug(c):
    return f"ap-{c['slug']}-flashcards"


def esc(x):
    return x.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


def n_units(c):
    return len(c['units'])


def title_for(c):
    n = n_units(c)
    for t in (f"AP {c['name']} Flashcards: All {n} Units | StudyEdge AI",
              f"AP {c['short']} Flashcards: All {n} Units | StudyEdge AI",
              f"AP {c['short']} Flashcards | StudyEdge AI"):
        if len(t) <= 60:
            return t
    raise SystemExit('no title fits for ' + c['slug'])


def desc_for(c):
    n, k = n_units(c), len(c['cards'])
    name = c['name']
    for d in (f"{k} free AP {name} flashcards built from the College Board's official course framework, covering all {n} units. Flip them online or export to Anki or Quizlet.",
              f"{k} free AP {name} flashcards built from the College Board's course framework, covering all {n} units. Flip them online or export to Anki or Quizlet.",
              f"{k} free AP {name} flashcards from the College Board's course framework, all {n} units. Flip them online or export them to Anki or Quizlet.",
              f"{k} free AP {name} flashcards from the official course framework, all {n} units. Flip online or export to Anki or Quizlet.",
              f"{k} free AP {name} flashcards built from the College Board's official course framework, covering all {n} units with exam weights. Export to Anki or Quizlet."):
        if 150 <= len(d) <= 160:
            return d
    raise SystemExit(f"no description fits for {c['slug']}: " + str([len(x) for x in (d,)]))


def upper(w):
    m = re.match(r'(\d+)-(\d+)%', w)
    return (int(m.group(2)), int(m.group(1))) if m else (0, 0)


def deck_tsv(c):
    return '\n'.join(f"{x['front']}\t{x['back']}" for x in c['cards']) + '\n'


def build(c):
    slug = page_slug(c)
    url = 'https://getstudyedge.com/' + slug
    name, full = c['name'], c['full']
    n, k = n_units(c), len(c['cards'])
    title = title_for(c)
    desc = desc_for(c)
    is_kc = c['cards'][0]['code'].startswith('KC-')
    stmt = 'key concept' if is_kc else 'essential knowledge'

    head = TEMPLATE[:TEMPLATE.index('  <script type="application/ld+json">')]
    head = head.replace(TEMPLATE_TITLE, esc(title))
    head = re.sub(r'(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*',
                  lambda m: m.group(1) + esc(desc), head)
    head = head.replace('https://getstudyedge.com/' + TEMPLATE_SLUG, url)
    assert 'is-a-3' not in head and 'Is a 3' not in head, slug

    tail_head = TEMPLATE[TEMPLATE.index('  <script src="/ph-init.js"></script>'):TEMPLATE.index('</header>') + len('</header>')]
    tail_head = re.sub(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', '', tail_head)
    footer = TEMPLATE[TEMPLATE.index('<footer class="site-footer">'):TEMPLATE.index('</footer>') + len('</footer>')]

    score_url = f"/is-a-3-on-ap-{c['score_slug']}-good"
    has_schedule = c.get('schedule') and os.path.exists(os.path.join(PUB, c['schedule'] + '.html'))

    lds = [
        {"@context": "https://schema.org", "@type": "LearningResource", "name": f"AP {name} Flashcards",
         "headline": f"AP {name} Flashcards", "description": desc, "url": url,
         "learningResourceType": "Flashcards", "educationalLevel": "High school (AP)", "inLanguage": "en",
         "isAccessibleForFree": True, "datePublished": "2026-10-31", "dateModified": D['verified'],
         "about": {"@type": "Course", "name": f"AP {full}",
                   "provider": {"@type": "Organization", "name": "College Board", "url": "https://www.collegeboard.org"}},
         "isBasedOn": {"@type": "CreativeWork", "name": c['ced_edition'], "url": c['ced_url'],
                       "publisher": {"@type": "Organization", "name": "College Board"}},
         "author": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"},
         "publisher": {"@type": "Organization", "name": "StudyEdge AI", "url": "https://getstudyedge.com"}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://getstudyedge.com/"},
            {"@type": "ListItem", "position": 2, "name": "AP Score Calculator", "item": "https://getstudyedge.com/ap-score-calculator"},
            {"@type": "ListItem", "position": 3, "name": f"AP {name} Flashcards", "item": url}]},
    ]
    ld_html = ''.join('  <script type="application/ld+json">\n  ' + json.dumps(x, indent=2, ensure_ascii=False).replace('\n', '\n  ') + '\n  </script>\n' for x in lds)

    style = """  <style>
    .fc-answer { background: #FFFFFF; border: 1px solid rgba(0,0,0,0.07); border-radius: 14px; padding: 24px 28px; max-width: 760px; margin: 0 auto; }
    .fc-answer p { margin: 0; font-size: 18px; line-height: 1.6; color: #1C1B18; }
    .fc-wrap { max-width: 760px; margin: 0 auto; }
    .fc-units { width: 100%; border-collapse: collapse; font-size: 15px; margin: 12px 0 8px; background: #FFFFFF; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; overflow: hidden; }
    .fc-units th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #5C5952; padding: 10px 14px; background: #F7F8FA; border-bottom: 1px solid rgba(0,0,0,0.07); }
    .fc-units td { padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.07); color: #1C1B18; vertical-align: top; }
    .fc-units tr:last-child td { border-bottom: none; }
    .fc-units td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .fc-note { font-size: 14px; color: #5C5952; }
    .fc-deck { display: none; background: #F7F8FA; border: 1px solid rgba(0,0,0,0.07); border-radius: 16px; padding: 20px; margin: 16px 0 8px; }
    .js .fc-deck { display: block; }
    .fc-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
    .fc-bar label { font-size: 14px; color: #5C5952; }
    .fc-bar select, .fc-btn { font: inherit; font-size: 14px; color: #1C1B18; background: #FFFFFF; border: 1px solid rgba(0,0,0,0.14); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
    .fc-btn:hover, .fc-bar select:hover { border-color: #3452D9; }
    .fc-btn:focus-visible, .fc-bar select:focus-visible, .fc-card:focus-visible { outline: 3px solid rgba(52,82,217,0.45); outline-offset: 2px; }
    .fc-btn.primary { background: #3452D9; border-color: #3452D9; color: #FFFFFF; }
    .fc-btn.primary:hover { background: #2A43B8; }
    .fc-stage { perspective: 1200px; }
    .fc-card { display: grid; width: 100%; min-height: 220px; padding: 0; border: 0; background: transparent; cursor: pointer; text-align: left; font: inherit; transition: transform 0.45s ease; transform-style: preserve-3d; border-radius: 14px; }
    .fc-card.is-flipped { transform: rotateY(180deg); }
    .fc-face { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; background: #FFFFFF; border: 1px solid rgba(0,0,0,0.07); border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 24px 26px; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
    .fc-face.back { transform: rotateY(180deg); border-color: rgba(52,82,217,0.35); }
    .fc-tag { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #5C5952; }
    .fc-face.back .fc-tag { color: #3452D9; }
    .fc-text { font-size: 20px; line-height: 1.45; color: #1C1B18; }
    .fc-code { font-size: 13px; color: #5C5952; }
    .fc-nav { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 14px; }
    .fc-count { font-size: 14px; color: #5C5952; font-variant-numeric: tabular-nums; }
    .fc-hint { font-size: 13px; color: #5C5952; margin: 10px 0 0; }
    .fc-export { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 12px 0; }
    .fc-status { font-size: 14px; color: #10A56E; }
    .fc-list h3 { margin: 28px 0 8px; font-size: 18px; }
    .fc-list dl { margin: 0; border-top: 1px solid rgba(0,0,0,0.07); }
    .fc-list dt { font-weight: 600; color: #1C1B18; padding-top: 12px; }
    .fc-list dd { margin: 4px 0 0; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.07); color: #1C1B18; }
    .fc-list dd small { display: block; color: #5C5952; font-size: 13px; margin-top: 4px; }
    .fc-source { font-size: 14px; color: #5C5952; border-left: 3px solid #3452D9; padding: 4px 0 4px 14px; }
    @media (prefers-reduced-motion: reduce) { .fc-card { transition: none; } }
    @media (max-width: 640px) { .fc-text { font-size: 18px; } .fc-face { padding: 20px; } .fc-answer { padding: 20px; } }
  </style>
"""

    # Unit table
    counts = {u['number']: sum(1 for x in c['cards'] if x['unit'] == u['number']) for u in c['units']}
    has_weights = any(u['weight'] for u in c['units'])
    rows = ''
    for u in c['units']:
        label = u['title'] if u['title'] != f"Unit {u['number']}" else 'Untitled in the CED'
        wcell = f'<td class="num">{u["weight"]}</td>' if has_weights else ''
        rows += f'        <tr><td class="num">Unit {u["number"]}</td><td>{esc(label)}</td>{wcell}<td class="num">{counts[u["number"]]}</td></tr>\n'
    whead = '<th>Exam weight</th>' if has_weights else ''

    # Answer-first intro
    weights = [u for u in c['units'] if u['weight']]
    tops = sorted(weights, key=lambda u: upper(u['weight']), reverse=True)
    weight_line = ''
    if tops and upper(tops[0]['weight']) != upper(tops[-1]['weight']):
        best = [u for u in tops if upper(u['weight']) == upper(tops[0]['weight'])]
        if len(best) == 1:
            weight_line = f" Unit {best[0]['number']}, {esc(best[0]['title'])}, carries the largest exam weight ({best[0]['weight']})."
        else:
            names = ' and '.join(f"Unit {u['number']}" for u in best)
            weight_line = f" {names} carry the largest exam weight ({best[0]['weight']} each)."
    elif tops:
        weight_line = f" The CED weights every unit the same, {tops[0]['weight']} of the exam."
    else:
        weight_line = ' The CED gives no exam weight per unit for this course; it weights the multiple-choice section by skill instead.'
    intro = (f"<strong>Here are {k} free AP {esc(name)} flashcards covering all {n} units of the course.</strong> "
             f"Every card comes from the College Board's official course framework ({esc(c['ced_edition'])}) and names the {stmt} code it quotes or paraphrases, "
             f"so you review the same statements the exam is built on.{weight_line} Flip them below, or export the deck to Anki or Quizlet.")

    # Crawlable list, grouped by unit
    list_html = ''
    for u in c['units']:
        cards = [x for x in c['cards'] if x['unit'] == u['number']]
        if not cards:
            continue
        head_t = f"Unit {u['number']}: {esc(u['title'])}" if u['title'] != f"Unit {u['number']}" else f"Unit {u['number']}"
        if u['weight']:
            head_t += f" ({u['weight']})"
        list_html += f'    <h3 id="unit-{u["number"]}">{head_t}</h3>\n    <dl>\n'
        for x in cards:
            where = f"Topic {x['topic']}, CED code {x['code']}" if x['topic'] else f"CED code {x['code']}"
            list_html += f'      <dt>{esc(x["front"])}</dt>\n      <dd>{esc(x["back"])}<small>{esc(where)}</small></dd>\n'
        list_html += '    </dl>\n'

    unit_opts = ''.join(f'<option value="{u["number"]}">Unit {u["number"]}' + (f': {esc(u["title"])}' if u['title'] != f"Unit {u['number']}" else '') + '</option>'
                        for u in c['units'] if counts[u['number']])

    deck_json = json.dumps({'slug': c['slug'], 'cards': [{'u': x['unit'], 't': x['topic'], 'f': x['front'], 'b': x['back'], 'c': x['code']} for x in c['cards']]},
                           ensure_ascii=False).replace('</', '<\\/')

    unit_note = f"    <p class=\"fc-note\">{esc(c['unit_note'])}</p>\n" if c.get('unit_note') else ''

    study_links = [f'<a href="{score_url}">whether a 3 on AP {esc(name)} is a good score</a>']
    if has_schedule:
        study_links.insert(0, f'the <a href="/{c["schedule"]}">8-week AP {esc(name)} study schedule</a>')

    others = [x for x in COURSES if x['slug'] != c['slug']]
    other_html = ''.join(f'      <li><a href="/{page_slug(x)}">AP {esc(x["name"])} flashcards</a></li>\n' for x in others)
    tools = [f'      <li><a href="{score_url}">Is a 3 on AP {esc(name)} good?</a></li>\n']
    if has_schedule:
        tools.append(f'      <li><a href="/{c["schedule"]}">AP {esc(name)} study schedule</a></li>\n')
    tools += ['      <li><a href="/ap-score-calculator">AP score calculator</a></li>\n',
              '      <li><a href="/ap-exam-study-schedule-templates">AP exam study schedule templates</a></li>\n',
              '      <li><a href="/flashcard-converter">Flashcard converter for Anki and Quizlet</a></li>\n',
              '      <li><a href="/ai-flashcard-maker">AI flashcard maker</a></li>\n']

    body = f"""

<section class="hero">
  <div class="container">
    <div class="eyebrow eyebrow-indigo">AP {esc(name)} flashcards</div>
    <h1>AP {esc(name)} Flashcards</h1>
    <p class="hero-sub">{k} cards across all {n} units of AP {esc(full)}, taken from the College Board's official course framework. Flip them here or export them to Anki or Quizlet.</p>
  </div>
</section>

<section class="section" style="padding-top: 24px;">
  <div class="container">
    <div class="fc-answer">
      <p>{intro}</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="container fc-wrap">
    <h2>AP {esc(name)} units{' and exam weights' if has_weights else ''}</h2>
    <table class="fc-units">
      <thead><tr><th>Unit</th><th>Title</th>{whead}<th>Cards</th></tr></thead>
      <tbody>
{rows}      </tbody>
    </table>
    <p class="fc-note">{esc(c['weight_note'])}</p>
{unit_note}
    <h2 id="deck">Study the deck</h2>
    <div class="fc-deck" id="fc-deck" aria-label="AP {esc(name)} flashcard deck">
      <div class="fc-bar">
        <label for="fc-unit">Unit</label>
        <select id="fc-unit"><option value="all">All units</option>{unit_opts}</select>
        <button type="button" class="fc-btn" id="fc-shuffle">Shuffle</button>
        <button type="button" class="fc-btn" id="fc-order">Original order</button>
      </div>
      <div class="fc-stage">
        <button type="button" class="fc-card" id="fc-card" aria-describedby="fc-help">
          <span class="fc-face front"><span class="fc-tag">Question</span><span class="fc-text" id="fc-front"></span></span>
          <span class="fc-face back" aria-hidden="true"><span class="fc-tag">Answer</span><span class="fc-text" id="fc-back"></span><span class="fc-code" id="fc-code"></span></span>
        </button>
      </div>
      <div class="fc-nav">
        <button type="button" class="fc-btn" id="fc-prev">Previous</button>
        <span class="fc-count" id="fc-count" aria-live="polite"></span>
        <button type="button" class="fc-btn primary" id="fc-next">Next</button>
      </div>
      <p class="fc-hint" id="fc-help">Click the card or press Enter or Space to flip it. Use the left and right arrow keys to move between cards.</p>
    </div>

    <h2>Export to Anki or Quizlet</h2>
    <p>The export puts one card per line, with a tab between the question and the answer. Both Anki and Quizlet read that format: in Anki use File, Import and pick tab as the field separator; in Quizlet paste it into a new set's import box and choose Tab between term and definition. The <a href="/flashcard-converter">flashcard converter</a> walks through both imports.</p>
    <div class="fc-export">
      <button type="button" class="fc-btn" id="fc-copy">Copy as text</button>
      <a class="fc-btn" id="fc-download" href="#" download="ap-{c['slug']}-flashcards.txt">Download .txt</a>
      <span class="fc-status" id="fc-status" role="status"></span>
    </div>

    <h2>All {k} AP {esc(name)} flashcards</h2>
    <p>The full deck as text, grouped by unit. Each answer lists the CED topic and code it comes from.</p>
    <div class="fc-list">
{list_html}    </div>

    <h2>Source</h2>
    <p class="fc-source">College Board, <a href="{c['ced_url']}" target="_blank" rel="noopener">{esc(c['ced_edition'])}</a>. Unit titles, exam weights and topic numbers come from this document. Each card quotes or closely paraphrases the {stmt} statement named by its CED code; open the PDF and search the code to read the full statement.</p>

    <h2>Use the deck with a plan</h2>
    <p>Flashcards cover the facts and definitions. For the rest of your prep, see {' and '.join(study_links)}.</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta-block">
      <h2>Study AP {esc(name)} in StudyEdge AI</h2>
      <p>StudyEdge AI does not import decks like this one. Paste or upload your own class notes and it makes flashcards from them, then schedules your reviews with spaced repetition so the cards you miss come back sooner.</p>
      <a href="/app?signup=1" class="btn btn-primary btn-lg" data-seo-cta="ap-deck-{c['slug']}">Make flashcards from your notes</a>
      <p class="cta-fine">Free plan available.</p>
    </div>
  </div>
</section>


<!-- Related links (internal) -->
<section class="related-links" style="background:#FFFFFF;border-top:1px solid rgba(0,0,0,0.07);padding:48px 24px">
  <div class="container" style="max-width:1100px;margin:0 auto">
    <h2 style="font-size:20px;font-weight:600;color:#1C1B18;margin:0 0 18px;letter-spacing:-0.01em">AP {esc(name)} study tools</h2>
    <ul style="list-style:none;padding:0;margin:0 0 32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
{''.join(tools)}    </ul>
    <h2 style="font-size:20px;font-weight:600;color:#1C1B18;margin:0 0 18px;letter-spacing:-0.01em">More AP flashcard decks</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 24px">
{other_html}    </ul>
  </div>
</section>

<script type="application/json" id="fc-data">{deck_json}</script>
<script>
(function () {{
  var root = document.documentElement;
  var data;
  try {{ data = JSON.parse(document.getElementById('fc-data').textContent); }} catch (e) {{ return; }}
  root.classList.add('js');
  var all = data.cards.map(function (c, i) {{ c.i = i; return c; }});
  var view = all.slice(), pos = 0, flipped = false;
  var $ = function (id) {{ return document.getElementById(id); }};
  var card = $('fc-card'), back = card.querySelector('.back'), front = card.querySelector('.front');
  function tsv(list) {{ return list.map(function (c) {{ return c.f.replace(/[\\t\\n]/g, ' ') + '\\t' + c.b.replace(/[\\t\\n]/g, ' '); }}).join('\\n') + '\\n'; }}
  function render() {{
    var c = view[pos];
    if (!c) return;
    $('fc-front').textContent = c.f;
    $('fc-back').textContent = c.b;
    $('fc-code').textContent = 'Unit ' + c.u + (c.t ? ', topic ' + c.t : '') + '. CED code ' + c.c + '.';
    card.classList.toggle('is-flipped', flipped);
    back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
    front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    card.setAttribute('aria-label', (flipped ? 'Answer: ' + c.b : 'Question: ' + c.f) + '. Press to flip.');
    $('fc-count').textContent = 'Card ' + (pos + 1) + ' of ' + view.length + (flipped ? ', answer side' : '');
  }}
  function go(step) {{ pos = (pos + step + view.length) % view.length; flipped = false; render(); }}
  function filter() {{
    var u = $('fc-unit').value;
    view = all.filter(function (c) {{ return u === 'all' || String(c.u) === u; }});
    pos = 0; flipped = false; render();
  }}
  card.addEventListener('click', function () {{ flipped = !flipped; render(); }});
  $('fc-next').addEventListener('click', function () {{ go(1); }});
  $('fc-prev').addEventListener('click', function () {{ go(-1); }});
  $('fc-unit').addEventListener('change', filter);
  $('fc-shuffle').addEventListener('click', function () {{
    for (var i = view.length - 1; i > 0; i--) {{ var j = Math.floor(Math.random() * (i + 1)); var t = view[i]; view[i] = view[j]; view[j] = t; }}
    pos = 0; flipped = false; render();
  }});
  $('fc-order').addEventListener('click', function () {{ view.sort(function (a, b) {{ return a.i - b.i; }}); pos = 0; flipped = false; render(); }});
  $('fc-deck').addEventListener('keydown', function (e) {{
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') {{ e.preventDefault(); go(1); }}
    else if (e.key === 'ArrowLeft') {{ e.preventDefault(); go(-1); }}
  }});
  var text = tsv(all);
  var dl = $('fc-download');
  try {{ dl.href = URL.createObjectURL(new Blob([text], {{ type: 'text/plain;charset=utf-8' }})); }} catch (e) {{ dl.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text); }}
  $('fc-copy').addEventListener('click', function () {{
    var done = function () {{ $('fc-status').textContent = 'Copied ' + all.length + ' cards.'; }};
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      navigator.clipboard.writeText(text).then(done, fallback);
    }} else {{ fallback(); }}
    function fallback() {{
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try {{ document.execCommand('copy'); done(); }} catch (e) {{ $('fc-status').textContent = 'Copy failed. Use Download .txt instead.'; }}
      document.body.removeChild(ta);
    }}
  }});
  render();
}})();
</script>
"""
    html = head + ld_html + style + tail_head + body + footer + '\n\n</body>\n</html>\n'
    assert chr(0x2014) not in html and chr(0x2013) not in html, slug
    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', html):
        json.loads(block)
    for href in re.findall(r'href="(/[^"#?]*)', html):
        if href in ('/', '/app') or href.startswith('/blog') or href.strip('/') in {page_slug(x) for x in COURSES}:
            continue
        p = href.strip('/')
        assert os.path.exists(os.path.join(PUB, p + '.html')) or os.path.exists(os.path.join(PUB, p)), (slug, href)
    out = os.path.join(PUB, slug + '.html')
    # Keep the cover block build-covers.mjs added on an earlier run.
    if os.path.exists(out):
        old = open(out, encoding='utf-8').read()
        m = re.search(r'  <!-- cover:meta -->[\s\S]*?<!-- /cover:meta -->\n', old)
        if m:
            html = html.replace('</head>', m.group(0) + '</head>', 1)
    open(out, 'w', encoding='utf-8').write(html)
    return slug, title, desc


if __name__ == '__main__':
    for c in COURSES:
        slug, title, desc = build(c)
        print(f'{slug}  title({len(title)}) {title}  desc({len(desc)})  cards {len(c["cards"])}')
