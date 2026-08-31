# Pricing source of truth + stale client — session state

Branch: `pricing-source-of-truth` (worktree `.claude/worktrees/pricing-sot`)
Started: 2026-08-31, from `main` at `cfba4f5`.

This file exists because the previous session ended mid-Stripe-write with no record of
what had completed. Anything below marked DONE is committed on this branch. Anything
marked TODO is not.

---

## What was already true when this session started (verified, not assumed)

Local `main` was 4 commits behind `origin/main`. Branch 3 (`6966a5c`, "retire weekly
billing, and one paywall screen") merged on 2026-08-30 13:46 and is deployed.

- `PrePaywall.jsx` and `PaywallExitGift.jsx` are deleted from the repo.
- The live production bundle (`assets/app-Cd4JyRxd.js`) contains **zero** occurrences of
  `skip the gift` / `Here are 5 free AI actions`, and **does** contain `What stopped you?`.
- The exit-gift modal reported as live was a **stale cached client**, not production.
- The only `2.99` in that bundle is a path coordinate inside the inlined Google logo SVG.

So HARD_PAYWALL_SPEC.md section 3 (the one paywall screen) was already built and shipped.
The real live defect was on the marketing site, which branch 3 did not touch.

## Stripe — state as of 2026-08-31 08:1x ET

Read via the Stripe MCP against `acct_1TME18KCY4pCgrHv`, livemode.

| Price ID | Amount | Interval | State when read |
|---|---|---|---|
| `price_1TbnTNKCY4pCgrHvQP07wLN8` | $2.99 | week | **ACTIVE** (needs archiving) |
| `price_1TbnXfKCY4pCgrHvIU2Wv6LY` | $4.99 | week | **ACTIVE** (needs archiving) |
| `price_1TbnTjKCY4pCgrHvqTZgXPAA` | $9.99 | month | active, correct |
| `price_1TbnU2KCY4pCgrHvPQWa7sTU` | $69.99 | year | active, correct |
| `price_1TbnYSKCY4pCgrHv3oZPSDpu` | $14.99 | month | active, correct |
| `price_1TbnZ0KCY4pCgrHvmcPQiD4U` | $119.99 | year | active, correct |

**The archive did not happen last session.** It was not a context problem: the Stripe MCP
key is read-only for price writes and returns "Your API key does not have the required
permissions for 'PostPricesPrice'". No Stripe CLI installed, no local `.env`.

Ryan said on 2026-08-31 he is archiving both weekly prices in the dashboard himself.
**TODO: re-read the two weekly prices and confirm `active: false`.**

Subscriber exposure, checked before recommending the archive: 25 subscriptions total,
24 canceled or past_due, exactly **1 active** — and it is on Unlimited $14.99/month, not
weekly. Archiving the weekly prices affects nobody.

Note: that active Unlimited monthly subscription contradicts the "zero active subs ever"
note in the assistant's memory. Worth reconciling separately.

No checkout could reach a weekly price regardless: `PRICE_IDS` in `api/stripe.js` omits
them and `resolveCheckoutPlan()` (`lib/server/trialPlan.js:47`) coerces any weekly request
to monthly and flags it `coerced`.

---

## DONE on this branch

### 1. Adopted the existing facts guard rather than building a second one
`8bb5e61` from the unmerged `worktree-facts-source-guard` branch (2026-08-16) already had
the right architecture: `content/facts.json` as source, `scripts/check-facts.mjs` failing
the build on drift, `scripts/sync-facts.mjs` repairing what is unambiguous. It was 38
commits stale and its data still described weekly billing. Cherry-picked as `b509e45`
(one `package.json` conflict, resolved as a union of both script lists).

### 2. Updated `content/facts.json` to the current product
- `trial.billingPeriod`: `weekly` -> `monthly`
- dropped `week` from every plan
- added `retiredPrices: [2.99, 4.99]` and `retiredPeriods: ["week","weekly","semester"]`

### 3. Three new rules in `scripts/facts.mjs`
- **`jsonld-offer-price`** — an Offer named after a plan must carry that plan's monthly
  price. This is the rule that would have caught the whole bug: JSON-LD keeps the amount
  and the interval in separate fields, so the pre-existing prose rule
  (`price-interval-pairing`, which looks for `"$2.99/month"`) could never see it.
  Auto-repaired by sync, because the `"name"` field makes the correct value unambiguous.
- **`retired-price`** — any `$2.99` / `$4.99` anywhere customer-facing. Necessary because
  dropping `week` from the plans would otherwise make the checker *blind*:
  `allowedPriceIntervals()` only inspects amounts it recognises as ours, so a retired 2.99
  would have been silently reclassified as a competitor quote and skipped.
- **`landing-price-table`** — `index.html` PRICE_TABLE must equal the literal generated
  from facts.json, between `/* facts:price-table */` markers.
- **`retired-period-offer`** — a whole Offer named `"<Plan> <RetiredPeriod>"`, e.g.
  "Pro Weekly". Reported, not auto-fixed: the offer has to be deleted, not repriced.

Two false-positive classes were found and fixed during development:
- a bare search for `weekly|semester` in JSON-LD `"name"` matched **97** study-schedule
  steps ("Week 8: Sharpen and rest") and FAQ entries ("What is semester GPA?"). The rule
  is now anchored to one of our plan names.
- a bare `2.99` matched **SVG path coordinates** in the inlined Google logo
  (`...-.76-2.99-.76-4.59...`). `retired-price` now requires a literal `$`.

### 4. Fixed every live pricing surface
- **120 JSON-LD offer prices** across 119 files: `2.99 -> 9.99`, `4.99 -> 14.99`,
  via `npm run facts:sync`.
- **`public/pricing.html`** — deleted the `Pro Weekly` and `Unlimited Weekly` Offer blocks
  outright. Both were self-contradictory: name "Pro Weekly", price "2.99", description
  "$9.99 per month". `Pro Monthly` / `Unlimited Monthly` already existed, so nothing lost.
  Verified both remaining JSON-LD blocks still `JSON.parse` cleanly.
- **`public/llms.txt`** — dropped the `$2.99/week or` and `$4.99/week or` options.
- **`index.html`** (the actual landing page, the worst offender):
  - default billing tab `weekly` -> `monthly`
  - weekly removed from PRICE_TABLE entirely, so it cannot be selected
  - the Weekly toggle button is gone
  - `billedSub()` weekly branches removed, `unitLabel` no longer yields `/wk`
  - annual badge `Save 55%` -> `Save up to 42%`, and the monthly `Save 17%` badge removed.
    Both old numbers were computed against the retired weekly price. Real savings are
    Pro 41.6% (119.88 -> 69.99) and Unlimited 33.3% (179.88 -> 119.99), so a single
    toggle badge has to say "up to".

`npm run facts:check`: **247 files clean.**

Guard proven by reintroducing all three regressions at once (landing table, a JSON-LD
offer price, and a weekly line in llms.txt). The checker reported all three with
file:line and exited 1. Restored, clean again.

### Deliberately left alone (Ryan confirmed)
- `src/components/LandingPage.jsx` — dead code, never imported.
- `api/stripe.js:64`, `lib/server/trialPlan.js:8,13` — deliberate incident comments.
- `src/lib/trialPlan.test.js`, `lib/server/trialPlan.test.js` — tests asserting weekly is
  retired. These *should* still say 2.99.

None of these are in `TARGET_GLOBS`, so the guard does not touch them.

---

## TODO

- Stale-client version check (in progress this session).
- Re-verify the two weekly Stripe prices are archived.
- Full `npm test` + `npm run build`, then merge to main and deploy.
