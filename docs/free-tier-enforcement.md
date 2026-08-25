# The free tier has never been enforced. Here is what that actually cost.

Brief for a decision. No pricing change made.

## The headline, which contradicts the hypothesis

The premise was: a free user has had unlimited access to everything except AI
actions, so there was close to no reason to pay, and that may explain the trial
behaviour better than the card-ask timing does.

**The data does not support that.** Enforcing every free limit today, exactly as
configured, would affect almost nobody, because almost nobody uses the product
deeply enough to reach any limit.

Production, 815 accounts, 2026-08-21:

| Limit | Configured free cap | Accounts currently over it |
|---|---|---|
| Courses | 1 | **7** total, 5 of them free. Max held is 11 |
| Saved artifacts | 1 each for several tools | **1** account has more than one |
| Topic signals | n/a, activity proxy | **2** accounts have more than one |
| Course uploads | n/a, activity proxy | **5** accounts have more than one |
| AI actions | 5 per month | 27 at or over |

And the denominator that matters:

- **17 of 815 accounts have completed a single study session.** Four have three
  or more.
- 802 of 815 are on the free plan.

So the free tier was not being drained. It was barely being touched. The thing
that did not happen is not payment, it is **use**. You cannot leak value that
nobody consumed.

This does not mean the unenforced tier is harmless. It means it is not the
explanation for the trial behaviour, and fixing it will not move revenue. The
activation problem is the whole problem, and the course gate plus the
after-a-win card ask are aimed at exactly that.

## What was supposed to be limited, and what users were told

From `FREE_LIMITS` in `src/lib/subscription.js`:

| Feature | Configured | Advertised on the landing page | Advertised in Account |
|---|---|---|---|
| courses | 1 | "1 course (preview only)" | yes |
| aiTutor | 5 / month | "5 AI tutor actions a month" | "5 AI messages a month" |
| coachPlan | 1 total | "1 Coach Plan" | yes |
| practiceExam | 1 total | "1 Practice Exam" | yes |
| focusMode | 30 min / day | "30 min Focus/day" | yes |
| blueprint | 1 total | **not mentioned** | "Session Blueprint · 1 total" |
| brainDump | 1 total | **not mentioned** | "Brain Dump, Quiz Burst, Exam Rescue · 1 each" |
| quizBurst | 1 total | **not mentioned** | as above |
| examRescue | 1 total | **not mentioned** | as above |
| flashcardDecks | 1 | **not mentioned** | **not mentioned** |
| flashcardCardsPerDeck | 10 | **not mentioned** | **not mentioned** |

Two disagreements of the same kind as the AI quota:

1. **Six limits are configured but never appear on the pricing page.** Four of
   them do appear in the Account screen, which a user sees only after signing
   up. A prospect comparing plans is not told that flashcard decks are capped at
   one, or that a deck is capped at ten cards.
2. **`flashcardDecks` and `flashcardCardsPerDeck` appear in no user-facing copy
   at all.** They exist only in config. If they were ever enforced, they would
   be the first thing a user hit and the last thing they could have predicted.

Nothing contradicts the AI quota now: config, copy and the server agree on 5 per
month since the earlier commit.

## Why none of it was enforced

`canUseFeature()` reads `subscription.feature_usage`, and the browser has never
been able to write that key. `user_data_guard_subscription_trg` reverts every
non-service-role write to the `subscription` column, so `feature_usage` is
absent on all 810 rows. Full detail in `docs/subscription-column-writes.md`.

Within one session the limits work, because the counter lives in memory. Reload,
and every count is zero again. So the practical free tier has been:

> one course, five AI actions a month, and unlimited everything else provided
> you reload the page.

The one-course limit **is** enforced, because it counts `plan.courses.length`
from a column the client can write. That is why only 7 accounts hold more than
one course.

## What enforcing it today would do

Almost nothing, immediately:

- **5 free accounts** hold more than one course and would be over the cap. They
  would keep their courses; `canAddCourse` blocks adding, it does not delete.
- **1 account** has more than one saved artifact.
- **27 accounts** are already at or over the AI cap and already feel it, since
  that limit is server-enforced and real.

Nobody else is close to any limit. There is no wall of angry users waiting.

The risk is not the count, it is the surprise: turning on six limits that were
never advertised, for users who have been using the product without them, is a
takeaway. It reads as a downgrade even when the numbers are tiny.

## Recommendation

**Do not switch the existing limits on as they stand.** They were designed for a
product that asked for a card immediately and needed a wall to justify it. The
product now gates on adding a course and only asks for a card after a
demonstrated win, which is a different bargain, and the old caps are calibrated
against the wrong one.

I would set the free tier to this:

| | Free | Why |
|---|---|---|
| Courses | **1** | Already enforced, already advertised, and it is the honest boundary between "trying it on one class" and "running my semester on it" |
| AI actions | **5 / month** | Already true, already server-enforced, already advertised. Leave it |
| Focus mode | **unlimited** | It costs nothing to serve and it is the habit you want. A 30-minute daily cap on the one non-AI feature that builds a return loop is working against the funnel |
| Everything else | **unlimited within the one course** | Blueprints, brain dumps, quiz bursts, exam rescues, flashcard decks. These are the value demonstration. Capping them at one each is what makes the card ask land before the product has proved anything |

The wall becomes the **second course**, not the second brain dump. That is a
boundary a student can feel the shape of, it maps to how they actually grow into
the product, and it needs no new counters: it is the one limit that already
works.

If you want a second lever, make it AI actions rather than feature counts.
It is the only cost that scales with use, it is already enforced correctly, and
it is now visible in the nav so it stops being an ambush.

### What that requires

1. Delete `blueprint`, `coachPlan`, `practiceExam`, `brainDump`, `quizBurst`,
   `examRescue`, `flashcardDecks`, `flashcardCardsPerDeck` from `FREE_LIMITS`,
   or set them to `Infinity`. Do not leave them configured-but-unenforced: that
   is the state that produced this document.
2. Remove the corresponding "1 total" and "1 each" lines from `AccountView`, and
   the "Unlock unlimited X" paywall triggers that reference them.
3. Move `focusMode` to unlimited, or state the cap on the pricing page.
4. Decide `feature_usage` separately. If nothing is counted client-side any
   more, the column and the trigger conflict stops mattering. If anything still
   needs counting, it has to move behind a server endpoint.

### If you disagree and want them enforced

Then they must first be made real, which means moving the counters server-side,
and they must be advertised before they bite. Enforcing a limit a user was never
told about, on an account that predates the limit, is the worst version of this.
In that case grandfather every existing account and apply the caps only to
signups after the change.

## What I could not determine

Whether users ever *tried* to exceed a limit and were stopped mid-session. That
would live in `feature_usage`, which does not exist, or in
`ai_limit_reached` / `paywall_shown` events. The latter are client-side and did
land, so they are worth querying before you decide. I did not, because the
super-property staleness documented elsewhere makes any segmentation of those
events unreliable until the fix ships and a clean series accumulates.
