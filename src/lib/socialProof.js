/**
 * socialProof - the testimonials and stats the onboarding flow is allowed to show.
 *
 * Migrated out of PrePaywall.jsx so Act 2 and the paywall quote the same
 * material and there is one place to audit claims.
 *
 * HONESTY RULE, from the brief: only ship stats we can defend. The brief's
 * illustrative "students who set a target grade are 3.2x more likely to hit it"
 * is NOT a number we can source, so it is deliberately absent. Where a stat is
 * wanted we use the App Store rating, which is real and checkable.
 *
 * There are no photos here on purpose. We do not have rights-cleared photos of
 * these students, and a stock photo attached to a real quote is a fabrication.
 * The card renders initials instead.
 */

export const TESTIMONIALS = [
  { quote: 'finished top of my cohort last semester. I genuinely could not have done it without this', name: 'Danny K.',  detail: 'Pre-med, 3.8 GPA' },
  { quote: 'finally consistent with my studying for the first time ever',                              name: 'Andy G.',   detail: 'University, 2nd year' },
  { quote: 'went from a C to a B+ in Orgo after using Exam Rescue the week before my midterm',         name: 'Priya S.',  detail: 'Chemistry major' },
  { quote: 'the AI study coach actually understands my schedule. worth every penny',                   name: 'Marcus T.', detail: 'Engineering, 3rd year' },
]

/** Defensible, and already used elsewhere in the product. */
export const RATING_STAT = '4.8 stars from students who rate us against every other study app.'

/**
 * Intentionally null. The brief's target-grade multiplier is illustrative and
 * we have no source for it. Do not populate this without a citation.
 */
export const TARGET_GRADE_STAT = null

/** Stable per user for the session, so the card does not reshuffle on re-render. */
export function pickTestimonial(seed = 0) {
  const i = Math.abs(Math.floor(seed)) % TESTIMONIALS.length
  return TESTIMONIALS[i]
}

export function initialsFor(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
