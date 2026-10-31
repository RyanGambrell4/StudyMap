#!/usr/bin/env python3
"""Em-dash pass helper (2026-10).

    python3 scripts/emdash-check.py list               # files with em dashes, and counts
    python3 scripts/emdash-check.py snapshot <files..> # record facts before editing
    python3 scripts/emdash-check.py verify <files..>   # compare against the snapshot

verify fails a file if any of these changed:
  - the multiset of numbers in the visible text (so no fact can drift)
  - the sequence of HTML tags (so markup and links stay identical)
  - the set of href/src targets
  - any JSON-LD block failing to parse
and reports any em dash (U+2014, &mdash;, &#8212;) still present.
"""
import glob, html, json, os, re, sys, collections

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SNAP = os.path.join(ROOT, '.emdash-snapshot.json')
EM = re.compile(r'—|&mdash;|&#8212;')


def files_with_dashes():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'public', '**', '*.html'), recursive=True) +
                    glob.glob(os.path.join(ROOT, 'public', '*.md')) + glob.glob(os.path.join(ROOT, 'public', 'okf', '*.md')) +
                    [os.path.join(ROOT, 'public', 'llms.txt'), os.path.join(ROOT, 'index.html')]):
        if '/covers/' in f or not os.path.exists(f): continue
        n = len(EM.findall(open(f, encoding='utf-8').read()))
        if n: out.append((os.path.relpath(f, ROOT), n))
    return out


def facts(path):
    t = open(os.path.join(ROOT, path), encoding='utf-8').read()
    text = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    nums = collections.Counter(re.findall(r'\d+(?:[.,]\d+)*', text))
    tags = re.findall(r'<\s*(/?[a-zA-Z][a-zA-Z0-9]*)', t)
    links = sorted(re.findall(r'(?:href|src|srcset)="([^"]*)"', t))
    ld_ok = True
    for blk in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
        try: json.loads(blk)
        except Exception: ld_ok = False
    return {'nums': dict(nums), 'tags': tags, 'links': links, 'ld_ok': ld_ok, 'dashes': len(EM.findall(t))}


def main():
    cmd, files = sys.argv[1], sys.argv[2:]
    if cmd == 'list':
        rows = files_with_dashes()
        for f, n in rows: print(n, f)
        print('TOTAL', sum(n for _, n in rows), 'in', len(rows), 'files')
        return
    snap = json.load(open(SNAP)) if os.path.exists(SNAP) else {}
    if cmd == 'snapshot':
        for f in files: snap[f] = facts(f)
        json.dump(snap, open(SNAP, 'w'))
        print('snapshot', len(files), 'files')
        return
    if cmd == 'verify':
        bad = 0
        for f in files:
            a, b = snap[f], facts(f)
            probs = []
            if a['nums'] != b['nums']:
                diff = {k: (a['nums'].get(k, 0), b['nums'].get(k, 0)) for k in set(a['nums']) | set(b['nums']) if a['nums'].get(k, 0) != b['nums'].get(k, 0)}
                probs.append(f'numbers changed {diff}')
            if a['tags'] != b['tags']: probs.append('HTML tag sequence changed')
            if a['links'] != b['links']: probs.append('links changed')
            if not b['ld_ok']: probs.append('JSON-LD does not parse')
            if b['dashes']: probs.append(f"{b['dashes']} em dashes left")
            if probs: bad += 1; print('FAIL', f, '|', '; '.join(probs))
        print(f'verified {len(files)} files, {bad} failing')
        sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
