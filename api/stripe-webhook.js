/**
 * stripe-webhook.js — Stripe webhook endpoint
 *
 * Stripe is configured to POST to /api/stripe-webhook.
 * The full webhook + checkout session handler lives in stripe.js —
 * this file re-exports it so both URLs work.
 */
export { default, config } from './stripe.js'
