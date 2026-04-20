/**
 * Sanitize user-stored strings that may contain em dashes (e.g. course names
 * like "PSYC 101 — Introduction to Psychology"). Replaces em dash (and any
 * surrounding whitespace) with " - ".
 */
export const clean = (str) => (str ?? '').replace(/\s*—\s*/g, ' - ')
