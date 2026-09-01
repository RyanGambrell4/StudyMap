# Entity submission pack — StudyEdge AI

**Purpose:** Google normalizes the string "studyedge" to "study edge", which
resolves to Study Edge, a Florida tutoring company operating since 2014. On
unambiguous queries ("what is studyedge ai") we rank #1, get cited in the AI
Overview, and show a brand card. On the bare brand term we lose to them.

That gap does not close from our own site. Google resolves entities from
third-party sources, and on the third-party web "StudyEdge AI" barely exists
while "Study Edge" has a decade of coverage. Every item below exists to put our
name in a source Google already reads.

**Do not invent facts to fill a field.** Every value here is verified against
the codebase or the live site. If a form asks for something not listed, leave it
blank or ask, rather than guessing. A directory entry contradicting our own site
is worse than no entry.

---

## Canonical facts

| Field | Value |
|---|---|
| Legal/product name | StudyEdge AI |
| Website | https://getstudyedge.com |
| Founded | 2025 |
| Category | Education technology, study tools, AI software |
| Audience | High school and college students |
| Business model | Freemium subscription |
| Free tier | Yes |
| Pro | $9.99/mo, $69.99/yr, 7-day free trial (card required) |
| Unlimited | $14.99/mo, $119.99/yr, no trial |
| Platforms | Web app; Android in preparation |

**Never write "no credit card required" next to the trial.** The 7-day Pro trial
runs through Stripe Checkout and collects a card. "7-day free trial, cancel
anytime" is the approved phrasing. The free tier genuinely needs no card, and
that is a different claim.

## Social profiles (use as-is; these are the sameAs set in our schema)

- https://www.tiktok.com/@getstudyedge
- https://www.instagram.com/getstudyedge/
- https://x.com/getstudyedge
- https://www.linkedin.com/company/getstudyedge/
- https://www.producthunt.com/products/studyedge

---

## Short description (under 160 characters)

> StudyEdge AI is an AI study planner for high school and college students. It
> builds your schedule, plans each session, and runs it with flashcards,
> quizzes, and an AI tutor.

## Medium description (about 300 characters)

> StudyEdge AI is an AI-powered study planner for high school and college
> students. Add your courses and exam dates and it builds a full study schedule,
> then generates a minute-by-minute Session Blueprint before every study block
> and runs the session with flashcards, quizzes, active recall prompts, and an
> AI tutor built in.

## Long description

> StudyEdge AI is an AI study planner and study system for high school and
> college students, at getstudyedge.com.
>
> Students add their courses, assignment deadlines, and exam dates. StudyEdge AI
> reverse-engineers a study schedule from those dates, allocating time by exam
> proximity and course difficulty. Before each study block it generates a
> Session Blueprint, a minute-by-minute plan for that specific course and goal,
> then runs the session itself with flashcards, practice quizzes, active recall
> prompts, and an AI tutor that answers course-specific questions. Grade Hub
> tracks assignment weights and calculates the score needed on remaining work to
> reach a target grade.
>
> StudyEdge AI is a software product. It does not provide human tutors,
> in-person classes, or live exam-review sessions.
>
> StudyEdge AI was founded in 2025 and is not affiliated with Study Edge
> (studyedge.com), a separate human tutoring company founded in Florida around
> 2014. The two companies have different founders, different products, and no
> business relationship.

## Disambiguation line (use wherever a field allows it)

> Not affiliated with Study Edge (studyedge.com), a separate Florida-based human
> tutoring company. StudyEdge AI is an AI software app at getstudyedge.com.

---

## Where to submit, in priority order

### 1. Tracxn — highest priority

Tracxn was a **cited source in our own AI Overview** for the query "studyedge
ai". Google already reads it for this exact query, and right now the only thing
it has under this name is the competitor. This is the single highest-leverage
listing.

- https://tracxn.com — "Add your company" / claim profile
- Use the medium description plus the disambiguation line
- Founded 2025, category Education Technology

### 2. Crunchbase

Heavily weighted for company entity resolution, and the reference Wikidata will
accept. Wikidata is blocked until this or an equivalent exists.

- https://www.crunchbase.com/register — free profile creation
- Fill founding year, category, website, and all five social profiles
- The social set matters: it is what links the Crunchbase record to our schema

### 3. Product Hunt — verify, do not create

We already claim https://www.producthunt.com/products/studyedge in our
Organization schema `sameAs`. Confirm it is live and that the display name reads
"StudyEdge AI", not "StudyEdge". A `sameAs` pointing at a dead or mismatched
page weakens the entity rather than strengthening it.

### 4. G2 and Capterra

Software directories that answer engines cite heavily for product comparisons.
Both are free to list. Category: Study Tools / Education Software.

- https://www.g2.com/products/new
- https://www.capterra.com/vendors

### 5. Wikidata — do last

Needs 2+ independent references, which items 1 and 2 provide. The payload:

- Label: `StudyEdge AI`
- Description: `AI study planner application for students`
- `instance of` → mobile app / web application
- `official website` → https://getstudyedge.com
- `inception` → 2025
- **`different from (P1889)` → the Study Edge item**

That P1889 statement is the strongest disambiguation signal available anywhere,
and it is the specific thing that tells Google's entity system these are two
companies rather than one.

---

## What this does not fix

Winning the bare query "studyedge" is a different and much harder problem: that
string is the competitor's actual name, they have held it since 2014, and the
searchers behind those 2,844 monthly impressions are mostly looking for them.
Everything here targets "studyedge ai" and the entity resolution behind it.
Treat "studyedge" as out of scope until "studyedge ai" is held consistently.
