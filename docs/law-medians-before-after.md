# Law school GPA medians: before and after (2026-10-31)

Source of every figure now: `content/law-school-medians.json`, copied from the ABA Standard 509
Required Disclosures, 2025 report (Fall 2025 entering class, all first-year students):
https://www.abarequireddisclosures.org/requiredDisclosure/

Pages show figures through `<span data-law="key">` spans. `node scripts/sync-law-medians.mjs`
refreshes them; `src/lib/lawSchoolMedians.test.js` fails if a page drifts or states a law GPA the data
does not contain. JS data rows on grad-school-gpa-requirements hold static values and must be edited
by hand when the data changes.

## Key figures

| Figure | Value |
|---|---|
| Lowest T14 median | 3.88 (Michigan Law) |
| Highest T14 median | 3.99 (UVA Law) |
| Harvard / Yale / Stanford medians | 3.96 / 3.96 / 3.96 |
| T14 LSAT medians | 170 to 174 |
| Median of all 196 school medians | 3.67 |
| Middle half of school medians | 3.50 to 3.81 |

## What changed

| Page | Before | After |
|---|---|---|
| grad-school-gpa-requirements | T14 medians "3.7 to 3.95", Yale highest at 3.93, stat card "3.80 Avg T14", JS rows Yale 3.93, Harvard 3.92, Stanford 3.90, Columbia 3.88, NYU 3.85, "ABA overall avg 3.40" | T14 3.88 to 3.99; HYS 3.96 each; Columbia 3.92, NYU 3.92; new UVA (3.99) and Michigan (3.88) rows; median of medians 3.67 (3.50 to 3.81) |
| gpa-requirements | "Law School (Top 14) 3.7+ / 3.8+ for T14" | T14 medians 3.88 to 3.99; all 196 schools median of medians 3.67 |
| what-gpa-do-you-need-for-law-school-admissions | "T-14 medians cluster 3.85 to 3.95; national average median closer to 3.5"; "Middle 50% GPA 3.5 to 3.95"; "Top 14 admit in single digits" | T14 3.88 to 3.99; median of medians 3.67, middle half 3.50 to 3.81; admit-rate claim removed (not in the data) |
| is-a-2-0 | JSON-LD: "3.7 or higher competitive for T14 law" | Removed (false) |
| is-a-2-5 | Medians "3.6 to 3.9" incl. T14 law | T14 law medians 3.88 to 3.99 |
| is-a-3-0 | "T14 median GPAs of 3.7-3.9" | 3.88 to 3.99; half of 196 schools between 3.50 and 3.81 |
| is-a-3-2 | "T14 medians 3.7-3.9; can access lower-ranked T14" | 3.88 to 3.99; below the 25th percentile at all 14 (lowest 3.74) |
| is-a-3-3 | "T14 3.7-3.9", "ranked 15-50: 3.4-3.6, LSAT 165+" | 3.88 to 3.99; national median 3.67; ranking tiers removed |
| is-a-3-4 | "T14 3.7-3.9; LSAT 172+; competitive at T25-T50"; title "The 3.5 Cutoff, Law and Med School" | 3.88 to 3.99; LSAT medians 170 to 174; below the median at more than three quarters of schools; title "Is a 3.4 GPA Good? Law, Med School and Employers" |
| is-a-3-5 | "T14 typically above 3.7; competitive at T20-T50" | 3.88 to 3.99; below the 25th percentile at all 14 |
| is-a-3-6 | "T14 law median ~3.8", "3.7-3.9", "LSAT 170+" | 3.88 to 3.99; below the 25th percentile everywhere in the T14 |
| is-a-3-7 | "3.7 sits at the median for the lower T14", "T14 3.7 to 3.93" | Below the median at all 14; above the median at about half of all schools (110 of 196) |
| is-a-3-8 | "HYS medians 3.9 to 3.95"; "at or above the median at Columbia, NYU, Chicago, Penn, UVA" | HYS 3.96 each; below the median at all 14; above the 25th percentile at Michigan, Cornell, Georgetown, Northwestern, Penn |
| best-study-app-for-university-of-arizona-students | "Law School (Top 50): 3.5+ GPA, 165+ LSAT" | Half of 196 schools between 3.50 and 3.81; UArizona Law median 3.78, LSAT median 163 |
| best-study-app-for-university-of-rochester-students | "Top-50 Law School: 3.5+ GPA, 165+ LSAT" | Half of 196 schools between 3.50 and 3.81; median of medians 3.67 |

Removed rather than replaced: every ranking-tier cutoff ("top 50", "T25-T50", "ranked 15-50"), invented
LSAT thresholds (165+, 170+, 172+, 175+), and the claim that T14 schools admit in single digits. The ABA
data has no rankings or admit rates.
