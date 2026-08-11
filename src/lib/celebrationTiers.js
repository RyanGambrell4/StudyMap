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
