# iOS launch switch

On 2026-10-30 every statement that StudyEdge AI was "on the App Store" was changed to say a native
iOS app is "coming soon", because the app was still in App Review (commit `2713eea1`, plus follow-ups
in this round: the Q-Chat page, `public/pricing.md` and the `/compare` pages).

When Apple approves the app and it is live:

```
python3 scripts/ios-launch-switch.py            # dry run, writes nothing
python3 scripts/ios-launch-switch.py --apply    # flips everything below and rebuilds /compare
npm run build && npm test && npm run facts:check
```

The script refuses to write if any file below has changed since it was recorded, so update both
this list and the script if you edit one of these sentences in the meantime. Generated pages in
`public/compare/` are rebuilt from `content/compare/*.json`, so the JSON is the source.

## Cover images

Product-shot covers (app, feature and comparison pages) show the web app in a browser
window while the iOS app is coming soon. A phone-frame version is kept in the generator
(samples: `docs/cover-samples/phone-alternate/`). The switch flips one line and the script
then reruns the generator, which re-renders only the product covers:

| File:line | Now | After launch |
|---|---|---|
| `scripts/build-covers.mjs`:49 | const PRODUCT_DEVICE = process.env.COVER_DEVICE \|\| 'browser' | const PRODUCT_DEVICE = process.env.COVER_DEVICE \|\| 'phone' |

## Every line (61 changes in 49 files)

| File:line | Now | After launch |
|---|---|---|
| `content/compare/knowt.json`:83 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `content/compare/quizlet.json`:83 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `content/compare/quizlet.json`:140 | Not yet as a native app. StudyEdge AI runs in the browser on any phone, and a native iOS app is coming soon. | Yes. StudyEdge AI has a native iOS app on the App Store, and the web app also runs in any phone browser. |
| `content/compare/studyfetch.json`:83 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `public/ai-study-planner.html`:35 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/ai-study-tools.html`:233 |  A native iOS app is coming soon. |  The native iOS app is on the App Store (search "StudyEdge AI"). |
| `public/best-ai-for-students.html`:285 |  A native iOS app is coming soon. |  The native iOS app is on the App Store (search "StudyEdge AI"). |
| `public/best-study-app-for-canadian-university-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-georgia-tech-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-mcgill-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-mcmaster-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-nwu-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-nyu-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-ohio-state-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-penn-state-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-purdue-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-queens-university-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-south-african-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-stellenbosch-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-texas-am-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-ubc-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-ucla-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-uct-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-uj-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-ukzn-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-unisa-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-university-of-alberta-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-university-of-florida-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-university-of-michigan-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-university-of-toronto-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-up-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-us-college-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-ut-austin-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-waterloo-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-western-university-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/best-study-app-for-wits-students.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/blog/best-note-taking-apps-for-college-students.html`:579 | Works in any browser, including on phones (native iOS app coming soon) | Works in any browser, plus a native iOS app |
| `public/chatgpt-alternative-for-students.html`:258 | Yes, in the browser. StudyEdge AI is a responsive web app that works on iPhone; a native iOS app is coming soon. | Yes. StudyEdge AI has a native iOS app on the App Store and a responsive web app. |
| `public/compare/studyedge-vs-knowt.html`:193 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `public/compare/studyedge-vs-quizlet.html`:101 | Not yet as a native app. StudyEdge AI runs in the browser on any phone, and a native iOS app is coming soon. | Yes. StudyEdge AI has a native iOS app on the App Store, and the web app also runs in any phone browser. |
| `public/compare/studyedge-vs-quizlet.html`:193 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `public/compare/studyedge-vs-quizlet.html`:260 | Not yet as a native app. StudyEdge AI runs in the browser on any phone, and a native iOS app is coming soon. | Yes. StudyEdge AI has a native iOS app on the App Store, and the web app also runs in any phone browser. |
| `public/compare/studyedge-vs-studyfetch.html`:193 | Web app that works on phones; native iOS app coming soon | Web app, plus a native iOS app |
| `public/llms.txt`:20 | Available on the web (works on phones); native iOS app coming soon. | Available on the web and on iOS. |
| `public/not-affiliated-with-study-edge.html`:124 | , with a native iOS app coming soon. | , and as a native iOS app on the App Store. |
| `public/notion-alternative.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/okf/product.md`:51 | - iOS app: coming soon (web app works on iPhone today) | - iOS app: available on the App Store |
| `public/pricing.md`:29 | (works on phones); native iOS app coming soon | (works on phones) and the native iOS app |
| `public/quizlet-qchat-alternative.html`:296 |  A native iOS app is coming soon. |  The native iOS app is on the App Store (search "StudyEdge AI"). |
| `public/studyedge-ai.html`:396 | Not yet as a native app. StudyEdge AI is a web app at getstudyedge.com that works on iPhone in the browser; a native iOS app is coming soon. | Yes. StudyEdge AI has a native iOS app on the App Store (search "StudyEdge AI"), and the web app at getstudyedge.com works in any browser. |
| `public/studyedge-company.html`:49 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/studyedge-company.html`:113 | ; a native iOS app is coming soon. | , and on iOS via the App Store. |
| `public/studyedge-company.html`:197 | StudyEdge AI launched its web app in 2026; a native iOS app is coming soon. | StudyEdge AI launched its web app and iOS app in 2026. |
| `public/studyedge-company.html`:205 | ; a native iOS app is coming soon. | , and on iOS via the App Store. |
| `public/studyedge-company.html`:213 | One product: the StudyEdge AI study planner, on the web (iOS app coming soon). | One product: the StudyEdge AI study planner, on the web and iOS. |
| `public/studyedge-company.html`:340 | A native iOS app is coming soon; until then, the web app works on iPhone. | The native iOS app is on the App Store (search "StudyEdge AI"). |
| `public/what-is-studyedge-ai.html`:37 | "operatingSystem": "Web" | "operatingSystem": "Web, iOS" |
| `public/what-is-studyedge-ai.html`:142 | Not yet. StudyEdge AI is a web app at getstudyedge.com that works in any browser, including on iPhone. A native iOS app is coming soon. | Yes. StudyEdge AI is on the App Store (search "StudyEdge AI") and is also a web app at getstudyedge.com. |
| `public/what-is-studyedge-ai.html`:200 | ; a native iOS app is coming soon. | , and on iOS via the App Store. |
| `public/what-is-studyedge-ai.html`:259 | <li><strong>iOS:</strong> native app coming soon</li> | <li><strong>iOS:</strong> search "StudyEdge AI" on the App Store</li> |
| `public/what-is-studyedge-ai.html`:299 |  A native iOS app is coming soon. |  The native iOS app is on the App Store (search "StudyEdge AI"). |

JSON-LD `"operatingSystem"` is switched back only on the 33 pages that said `"Web, iOS"` before
the change; the other pages have always said `"Web"` and stay that way.
