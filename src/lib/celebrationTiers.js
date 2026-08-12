/**
 * celebrationTiers - just the tier constants.
 *
 * Split out of celebration.js so code that only needs to NAME a tier does not
 * have to import the controller, which pulls in canvas-confetti, PostHog and
 * the DOM. That import chain is why a decision as simple as "which tier does
 * this tool earn" could not be unit tested in plain node.
 *
 * celebration.js re-exports both of these, so every existing import keeps
 * working and there is still one obvious place to look.
 */

export const TIER = { MICRO: 0, SMALL: 1, MEDIUM: 2, MAJOR: 3 }

export const TIER_NAME = ['micro', 'small', 'medium', 'major']

/**
 * The three score thresholds, kept together because they only make sense
 * relative to each other. A scored session falls into exactly one band:
 *
 *   below WEAK_PCT      no celebration at all. The student is handed the one
 *                       concept she lost and a button that drills it. See the
 *                       'repair' branch in toolCelebrations.js.
 *   WEAK_PCT..STRONG    the tool's flat tier. Acknowledged, not celebrated.
 *   STRONG_PCT and up   escalates to MEDIUM, which is the confetti tier.
 *
 * WEAK_PCT is a floor, not a punishment. A student at 41 percent at midnight
 * two days out does not need a quieter trophy, she needs the next move, and a
 * reward of any size at that moment reads as the app not paying attention.
 */
export const WEAK_PCT = 60
export const STRONG_PCT = 90
