#!/usr/bin/env python3
"""Flip the site's iOS wording from "coming soon" to "on the App Store".

Run ONLY after Apple approves the app and it is live on the App Store:

    python3 scripts/ios-launch-switch.py            # dry run: shows every change, writes nothing
    python3 scripts/ios-launch-switch.py --apply    # writes the changes, then rebuilds /compare

Then run the build, `npm test` and `npm run facts:check`, and check the result.

Why this is not a blind search-and-replace: on 2026-10-30 (commit 2713eea1 and the
follow-ups listed in docs/ios-launch-switch.md) every claim that StudyEdge AI was on
the App Store was rewritten, because the app was still in App Review. Each rewrite is
listed here as an exact phrase with its launch-day wording, and each file with how many
phrases it is expected to contain. The script refuses to write if a file has drifted
(a phrase missing or counted differently), so a later copy edit cannot silently turn
into a wrong claim. JSON-LD "operatingSystem" goes back to "Web, iOS" only on the 33
pages that said so before; the other pages have always said "Web".
"""
import json, os, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# Longest first, so a sentence is replaced before any shorter fragment inside it.
PHRASES = [
 ('Not yet as a native app. StudyEdge AI runs in the browser on any phone, and a native iOS app is coming soon.',
  'Yes. StudyEdge AI has a native iOS app on the App Store, and the web app also runs in any phone browser.'),
 ('Not yet as a native app. StudyEdge AI is a web app at getstudyedge.com that works on iPhone in the browser; a native iOS app is coming soon.',
  'Yes. StudyEdge AI has a native iOS app on the App Store (search "StudyEdge AI"), and the web app at getstudyedge.com works in any browser.'),
 ('Not yet. StudyEdge AI is a web app at getstudyedge.com that works in any browser, including on iPhone. A native iOS app is coming soon.',
  'Yes. StudyEdge AI is on the App Store (search "StudyEdge AI") and is also a web app at getstudyedge.com.'),
 ('Yes, in the browser. StudyEdge AI is a responsive web app that works on iPhone; a native iOS app is coming soon.',
  'Yes. StudyEdge AI has a native iOS app on the App Store and a responsive web app.'),
 ('A native iOS app is coming soon; until then, the web app works on iPhone.',
  'The native iOS app is on the App Store (search "StudyEdge AI").'),
 ('StudyEdge AI launched its web app in 2026; a native iOS app is coming soon.',
  'StudyEdge AI launched its web app and iOS app in 2026.'),
 ('One product: the StudyEdge AI study planner, on the web (iOS app coming soon).',
  'One product: the StudyEdge AI study planner, on the web and iOS.'),
 ('Available on the web (works on phones); native iOS app coming soon.',
  'Available on the web and on iOS.'),
 ('Works in any browser, including on phones (native iOS app coming soon)',
  'Works in any browser, plus a native iOS app'),
 ('Web app that works on phones; native iOS app coming soon',
  'Web app, plus a native iOS app'),
 ('<li><strong>iOS:</strong> native app coming soon</li>',
  '<li><strong>iOS:</strong> search "StudyEdge AI" on the App Store</li>'),
 ('- iOS app: coming soon (web app works on iPhone today)',
  '- iOS app: available on the App Store'),
 ('(works on phones); native iOS app coming soon',
  '(works on phones) and the native iOS app'),
 (', with a native iOS app coming soon.',
  ', and as a native iOS app on the App Store.'),
 ('; a native iOS app is coming soon.',
  ', and on iOS via the App Store.'),
 (' A native iOS app is coming soon.',
  ' The native iOS app is on the App Store (search "StudyEdge AI").'),
]
# Covers: product shots move from the browser frame to the phone frame (alternate kept in
# scripts/build-covers.mjs). Rerunning the generator re-renders only the product covers,
# because the device is part of each cover's signature.
PHRASES.append(("const PRODUCT_DEVICE = process.env.COVER_DEVICE || 'browser'",
                "const PRODUCT_DEVICE = process.env.COVER_DEVICE || 'phone'"))

OS_OLD, OS_NEW = '"operatingSystem": "Web"', '"operatingSystem": "Web, iOS"'

# file -> expected number of PHRASES replacements (recorded 2026-10-30)
PHRASE_FILES = {
 "content/compare/knowt.json": 1,
 "content/compare/quizlet.json": 2,
 "content/compare/studyfetch.json": 1,
 "public/ai-study-tools.html": 1,
 "public/best-ai-for-students.html": 1,
 "public/blog/best-note-taking-apps-for-college-students.html": 1,
 "public/chatgpt-alternative-for-students.html": 1,
 "public/compare/studyedge-vs-knowt.html": 1,
 "public/compare/studyedge-vs-quizlet.html": 3,
 "public/compare/studyedge-vs-studyfetch.html": 1,
 "public/llms.txt": 1,
 "public/not-affiliated-with-study-edge.html": 1,
 "public/okf/product.md": 1,
 "public/pricing.md": 1,
 "public/quizlet-qchat-alternative.html": 1,
 "public/studyedge-ai.html": 1,
 "public/studyedge-company.html": 5,
 "public/what-is-studyedge-ai.html": 4,
 "scripts/build-covers.mjs": 1
}
# files whose JSON-LD said "Web, iOS" before 2713eea1
OS_FILES = [
 "public/ai-study-planner.html",
 "public/best-study-app-for-canadian-university-students.html",
 "public/best-study-app-for-georgia-tech-students.html",
 "public/best-study-app-for-mcgill-students.html",
 "public/best-study-app-for-mcmaster-students.html",
 "public/best-study-app-for-nwu-students.html",
 "public/best-study-app-for-nyu-students.html",
 "public/best-study-app-for-ohio-state-students.html",
 "public/best-study-app-for-penn-state-students.html",
 "public/best-study-app-for-purdue-students.html",
 "public/best-study-app-for-queens-university-students.html",
 "public/best-study-app-for-south-african-students.html",
 "public/best-study-app-for-stellenbosch-students.html",
 "public/best-study-app-for-texas-am-students.html",
 "public/best-study-app-for-ubc-students.html",
 "public/best-study-app-for-ucla-students.html",
 "public/best-study-app-for-uct-students.html",
 "public/best-study-app-for-uj-students.html",
 "public/best-study-app-for-ukzn-students.html",
 "public/best-study-app-for-unisa-students.html",
 "public/best-study-app-for-university-of-alberta-students.html",
 "public/best-study-app-for-university-of-florida-students.html",
 "public/best-study-app-for-university-of-michigan-students.html",
 "public/best-study-app-for-university-of-toronto-students.html",
 "public/best-study-app-for-up-students.html",
 "public/best-study-app-for-us-college-students.html",
 "public/best-study-app-for-ut-austin-students.html",
 "public/best-study-app-for-waterloo-students.html",
 "public/best-study-app-for-western-university-students.html",
 "public/best-study-app-for-wits-students.html",
 "public/notion-alternative.html",
 "public/studyedge-company.html",
 "public/what-is-studyedge-ai.html"
]


def plan():
    changes, problems = {}, []
    for rel in sorted(set(PHRASE_FILES) | set(OS_FILES)):
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            problems.append(f'{rel}: file missing'); continue
        t0 = t = open(path, encoding='utf-8').read()
        n = 0
        for old, new in PHRASES:
            c = t.count(old)
            if c: t = t.replace(old, new); n += c
        if n != PHRASE_FILES.get(rel, 0):
            problems.append(f'{rel}: expected {PHRASE_FILES.get(rel, 0)} phrase(s), found {n}')
        if rel in OS_FILES:
            c = t.count(OS_OLD)
            if c != 1:
                problems.append(f'{rel}: expected 1 "operatingSystem": "Web", found {c}')
            t = t.replace(OS_OLD, OS_NEW)
        if t != t0: changes[rel] = (t0, t)
    return changes, problems


def main():
    apply = '--apply' in sys.argv
    changes, problems = plan()
    for rel, (a, b) in changes.items():
        print(f'{"WRITE" if apply and not problems else "would change"}: {rel}')
    if problems:
        print('\nRefusing to write; these files no longer match what was recorded:')
        for p in problems: print('  ' + p)
        print('Update PHRASE_FILES/OS_FILES (and docs/ios-launch-switch.md) to match, then rerun.')
        sys.exit(1)
    if not apply:
        print(f'\nDry run: {len(changes)} files would change. Re-run with --apply after App Store approval.')
        return
    for rel, (_, b) in changes.items():
        open(os.path.join(ROOT, rel), 'w', encoding='utf-8').write(b)
    subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build-compare.py')], check=True)
    subprocess.run(['node', os.path.join(ROOT, 'scripts', 'build-covers.mjs')], check=True)
    print(f'\nApplied to {len(changes)} files, rebuilt /compare and the product covers. Now run the build, npm test and facts:check.')


if __name__ == '__main__':
    main()
