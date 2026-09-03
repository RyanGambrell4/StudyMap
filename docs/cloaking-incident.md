# Cloaking incident: the homepage prerender block

Closed 2026-09-01. Written up because a cloaking violation is serious enough
to document even after it is fixed, and because the shape of this bug is easy
to reintroduce by accident with good intentions.

## What it was

`index.html` served an 8,191-character, 680-word block inside `<div id="root">`
that no user ever saw. It carried eight headings (one `h1`, four `h2`, three
`h3`), a nav, a full feature list, and marketing copy.

It was hidden with the standard screen-reader clip pattern:

```css
.seo-prerender {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border: 0;
}
```

Two independent mechanisms kept it away from users. The CSS collapsed it to a
one-pixel clipped box, and `ReactDOM.createRoot(document.getElementById('root'))`
destroys every child of `#root` on mount, so React deleted the block outright a
moment after paint. Googlebot, fetching the raw HTML, read all 680 words.

## Crawler versus user

The clearest expression of the problem is the two `h1` elements:

| Audience | `h1` |
|---|---|
| Googlebot | `StudyEdge AI: AI Study Planner for Students \| getstudyedge.com` |
| User | `Your grades aren't the problem. Your system is.` |

The block also contained sentences written only for the crawler, which no
person could ever have read on the page:

> Search for "StudyEdge AI" or visit getstudyedge.com to access your account.

Serving a keyword-targeted heading and body copy to a crawler while showing
users something else is cloaking under Google's spam policies. It does not
matter that the intent was to help a client-rendered SPA get indexed.

## Timeline

| When | What |
|---|---|
| 2026-04-18 19:08 | Introduced in `c6f9afb`, "SEO: pre-render landing page content so Googlebot can index it" |
| 2026-04-18 to 2026-08-31 | Live on every homepage response, roughly four and a half months |
| 2026-09-01 | Removed in `bf265df` |
| 2026-09-01 | Second instance removed from `public/login.html`, build guard added, `251cd56` |

A note on impact, corrected: this was originally reported as the cause of an
Aug 29 ranking collapse. Weekly Search Console data does not support that. The
`studyedge ai` brand query held position 1.00 every week from June through
September. There is a real two-day dip in the daily homepage numbers on Aug 29
and 30, but the brand query itself never degraded. The block was a genuine
policy violation and removing it was correct on its own terms. It was not the
cause of a traffic loss, because there was no traffic loss.

## The second instance

`public/login.html` carried the same idea in a blunter form: a
`<div style="display:none;">` under the comment `<!-- SEO content for Google -->`,
holding a heading, three paragraphs and a link list. That page is
`<meta name="robots" content="noindex, follow" />`, so the hidden block could
never have ranked for anything. Pure downside, written months apart from the
first, and neither caught in review.

## Confirming nothing else like it exists

`scripts/assertNoHiddenContent.mjs` runs as a pre-step of `npm run build` and
fails the build on any hidden subtree that contains a heading or exceeds 25
words. As of this writing it reports **no hidden content in 243 html files**.

The guard distinguishes cloaking from legitimate CSS by looking for a class
hidden by some rule and revealed by none. Four patterns were checked and are
correctly allowed: scroll animations with a companion reveal rule (`.fade-up`),
responsive layout with a media-query override (`.mobile-hero`), attribute-gated
state (`.calc-panel[hidden]`), and rules inside `@media print` (`.no-print`).

Two implementation notes worth keeping:

1. CSS comments are stripped before parsing. They were not at first, and the
   guard's own explanatory comment quoting `clip: rect(0,0,0,0)` in prose was
   absorbed into the following selector, whose colon then made the rule look
   state-gated and skipped. The guard was blind to the exact bug it existed to
   catch. Only a regression test found it.
2. Short screen-reader text stays legal. The line is a heading or more than 25
   words, not the clip pattern itself, because that pattern is the correct way
   to write an accessible skip link.

## If you need prerendered HTML again

The legitimate versions of this are server-side rendering, static
pre-rendering, or dynamic rendering, all of which serve users and crawlers the
same content. If a prerender block must live inside the hydration root, it has
to be visible and it has to say what the rendered page says. `bf265df` did
exactly that: the block is now a normal visible section and its `h1` matches
the React hero.
