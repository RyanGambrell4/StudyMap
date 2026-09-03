/**
 * The billing record, and the one place that knows it lives in two tables.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 * public.user_data.subscription is writable by the user it belongs to
 * (RLS: auth.uid() = user_id FOR ALL) and the browser writes it wholesale.
 * reserveAiUsage() used to read plan and aiQueriesUsed straight out of it,
 * which made every quota in the product self-serve bypassable.
 *
 * public.user_billing holds the same facts in a table with no INSERT, UPDATE or
 * DELETE policy. The service role bypasses RLS; nobody else can write a byte.
 * Enforcement reads from there.
 *
 * ── phase 1 dual-writes, deliberately ───────────────────────────────────────
 * Twenty-eight endpoints and the entire client read the legacy blob. Swapping
 * all of them at once is a large untested diff through billing, the paywall and
 * the trial. So every write here lands in user_billing FIRST — that is the copy
 * that decides anything — and is then mirrored into user_data.subscription so
 * the existing readers keep working untouched.
 *
 * The mirror is best-effort by design. If user_billing is written and the
 * mirror fails, the user is correctly charged and the client shows a slightly
 * stale number until its next refresh. If it were the other way round a failed
 * write would hand out free actions. The important copy goes first and its
 * error is returned; the mirror's error is logged.
 *
 * The window this opens: between the two writes, and for a user who has edited
 * their own blob, the legacy copy can claim a plan the server will not honour.
 * The client resolves that by taking the more restrictive of the two
 * (src/lib/subscription.js), because a UI saying "Unlimited" while every action
 * is refused is worse than no UI at all.
 *
 * Phase 2 removes the mirror and points the client here. Phase 3 narrows
 * user_data's own policy. Neither is in this change.
 */

import { reportQueryError, isMissingRelation } from './supabaseErrors.js'

export const BILLING_TABLE = 'user_billing'

/** Shape returned to callers. Snake_case columns, camelCase in memory. */
function rowToBilling(row) {
  return {
    userId:             row.user_id,
    plan:               row.plan ?? 'free',
    status:             row.status ?? 'active',
    stripeCustomerId:   row.stripe_customer_id ?? null,
    stripeSubId:        row.stripe_subscription_id ?? null,
    billingPeriod:      row.billing_period ?? null,
    currentPeriodEnd:   row.current_period_end ?? null,
    trialUsedAt:        row.trial_used_at ?? null,
    aiQueriesUsed:      row.ai_queries_used ?? 0,
    aiQueriesResetAt:   row.ai_queries_reset_at ?? null,
    bonusAiActions:     row.bonus_ai_actions ?? 0,
    firstGenerationAt:  row.first_generation_at ?? null,
    featureUsage:       row.feature_usage ?? {},
    grantedBy:          row.granted_by ?? null,
    grantedAt:          row.granted_at ?? null,
  }
}

/** Project a legacy subscription blob into user_billing columns. */
function legacyToColumns(sub = {}) {
  const plan = ['free', 'pro', 'unlimited'].includes(sub.plan) ? sub.plan : 'free'
  const toInt = v => Math.max(0, Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0)
  return {
    plan,
    status:                 sub.status || 'active',
    stripe_customer_id:     sub.stripeCustomerId ?? null,
    stripe_subscription_id: sub.stripeSubId ?? null,
    billing_period:         sub.billingPeriod ?? null,
    current_period_end:     sub.currentPeriodEnd ?? null,
    trial_used_at:          sub.trialUsedAt ?? null,
    ai_queries_used:        toInt(sub.aiQueriesUsed),
    ai_queries_reset_at:    sub.aiQueriesResetAt ?? null,
    bonus_ai_actions:       toInt(sub.bonusAiActions),
    first_generation_at:    sub.firstGenerationAt ?? null,
    feature_usage:          sub.feature_usage ?? {},
    granted_by:             sub.grantedBy ?? null,
  }
}

/**
 * Pre-migration fallback: present the legacy blob in the billing shape.
 *
 * Only reached while public.user_billing does not exist. Deleted at Phase 2.
 */
async function readLegacyAsBilling(supabase, userId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    reportQueryError(error, { table: 'user_data', context: 'readBilling legacy fallback' })
    return { ok: false, error }
  }

  const cols = legacyToColumns(data?.subscription ?? {})
  return {
    ok: true,
    legacy: true,
    billing: rowToBilling({ user_id: userId, ...cols }),
  }
}

/**
 * Read the authoritative billing record.
 *
 * Self-healing on a miss: accounts created after the migration have no row
 * yet, and nothing in the signup path creates one. Rather than make every
 * caller reason about that, seed the row here from whatever the legacy blob
 * says (or the defaults) and carry on. Service key, so RLS does not apply.
 *
 * Returns { ok: true, billing } or { ok: false, error } — never a silent null,
 * because "no row" and "the read failed" must not look the same to a quota
 * check. A failed read has to fail the request, not hand out a free action.
 */
export async function readBilling(supabase, userId) {
  const { data, error } = await supabase
    .from(BILLING_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    // The table not existing yet is NOT a read failure, and conflating the two
    // would take the entire AI surface down on any deploy that lands before the
    // migration. This is a three-phase migration; the code and the schema will
    // not arrive in the same instant, and the ordering must not matter.
    //
    // So: table missing -> fall back to the legacy blob, which is exactly the
    // behaviour that shipped before this change. No worse than yesterday, and
    // it starts enforcing properly the moment the migration lands, with no
    // second deploy.
    //
    // Any OTHER error still fails closed. "The database is unreachable" must
    // never look like "this user has plenty of quota left".
    if (isMissingRelation(error)) {
      console.warn(
        `[billing] ${BILLING_TABLE} does not exist yet — falling back to user_data.subscription. ` +
        'Apply migrations/20260903_user_billing.sql. Until then the AI quota is readable by the user it limits.'
      )
      return readLegacyAsBilling(supabase, userId)
    }
    reportQueryError(error, { table: BILLING_TABLE, context: 'readBilling' })
    return { ok: false, error }
  }

  if (data) return { ok: true, billing: rowToBilling(data) }

  // No row. Seed one from the legacy blob so an account that predates or
  // postdates the backfill is not silently treated as brand new.
  const { data: legacyRow, error: legacyErr } = await supabase
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  if (legacyErr) {
    reportQueryError(legacyErr, { table: 'user_data', context: 'readBilling seed' })
    return { ok: false, error: legacyErr }
  }

  const seed = { user_id: userId, ...legacyToColumns(legacyRow?.subscription ?? {}) }
  const { data: inserted, error: insertErr } = await supabase
    .from(BILLING_TABLE)
    .upsert(seed, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle()

  if (insertErr) {
    reportQueryError(insertErr, { table: BILLING_TABLE, context: 'readBilling seed insert' })
    return { ok: false, error: insertErr }
  }

  return { ok: true, billing: rowToBilling(inserted ?? seed), seeded: true }
}

/**
 * Mirror a partial update into the legacy user_data.subscription blob.
 *
 * Best-effort. Never throws, never fails the caller. Phase 2 deletes this.
 */
async function mirrorToLegacy(supabase, userId, patch, context) {
  try {
    const { data, error: readErr } = await supabase
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    if (readErr) {
      reportQueryError(readErr, { table: 'user_data', context: `${context} mirror read` })
      return
    }

    const merged = { ...(data?.subscription ?? {}), ...patch }
    const { error: writeErr } = await supabase
      .from('user_data')
      .upsert(
        { user_id: userId, subscription: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (writeErr) {
      reportQueryError(writeErr, { table: 'user_data', context: `${context} mirror write` })
    }
  } catch (err) {
    console.error(`[billing] ${context} mirror threw:`, err?.message ?? err)
  }
}

/**
 * Write the AI usage counters. Authoritative copy first, mirror second.
 */
export async function commitUsage(supabase, userId, { aiQueriesUsed, aiQueriesResetAt, firstGenerationAt }) {
  const patch = {
    ai_queries_used:     aiQueriesUsed,
    ai_queries_reset_at: aiQueriesResetAt,
    first_generation_at: firstGenerationAt,
    updated_at:          new Date().toISOString(),
  }

  const { error } = await supabase
    .from(BILLING_TABLE)
    .update(patch)
    .eq('user_id', userId)

  // Before the migration the mirror IS the record, so a missing table must not
  // stop the write — skipping both would mean the counter never increments and
  // every account silently gets unlimited AI.
  if (error && !isMissingRelation(error)) {
    reportQueryError(error, { table: BILLING_TABLE, context: 'commitUsage' })
    return { ok: false, error: error.message }
  }

  await mirrorToLegacy(supabase, userId, {
    aiQueriesUsed:     aiQueriesUsed,
    aiQueriesResetAt:  aiQueriesResetAt,
    firstGenerationAt: firstGenerationAt,
    lastAiCallAt:      new Date().toISOString(),
  }, 'commitUsage')

  return { ok: true }
}

/**
 * Write a per-feature usage counter (the podcast's one-a-week, today).
 */
export async function commitFeatureUsage(supabase, userId, featureUsage) {
  const { error } = await supabase
    .from(BILLING_TABLE)
    .update({ feature_usage: featureUsage, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error && !isMissingRelation(error)) {
    reportQueryError(error, { table: BILLING_TABLE, context: 'commitFeatureUsage' })
    return { ok: false, error: error.message }
  }

  await mirrorToLegacy(supabase, userId, { feature_usage: featureUsage }, 'commitFeatureUsage')
  return { ok: true }
}

/**
 * Write plan and status from a Stripe webhook. This is the ONLY function that
 * may change plan or status — that is the entire point of the table.
 *
 * granted_by is deliberately cleared when Stripe reports a paid plan: an
 * account that starts actually paying is no longer a comp, and leaving the
 * marker would exclude a real customer from every funnel.
 */
export async function commitStripeBilling(supabase, userId, fields) {
  const patch = {
    plan:                   fields.plan,
    status:                 fields.status,
    stripe_customer_id:     fields.stripeCustomerId ?? null,
    stripe_subscription_id: fields.stripeSubId ?? null,
    billing_period:         fields.billingPeriod ?? null,
    current_period_end:     fields.currentPeriodEnd ?? null,
    updated_at:             new Date().toISOString(),
  }
  if (fields.trialUsedAt !== undefined) patch.trial_used_at = fields.trialUsedAt
  if (fields.plan === 'pro' || fields.plan === 'unlimited') {
    patch.granted_by = null
    patch.granted_at = null
  }

  // upsert rather than update: a brand-new customer may have no row yet if they
  // paid before any AI call created one.
  const { error } = await supabase
    .from(BILLING_TABLE)
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })

  // Pre-migration this is a no-op and the legacy write in api/stripe.js right
  // after it is what records the plan. A missing table must not fail the
  // webhook: Stripe retries, and a retry storm on a paid upgrade is a worse
  // outcome than a plan that lands in one place instead of two.
  if (error && !isMissingRelation(error)) {
    reportQueryError(error, { table: BILLING_TABLE, context: 'commitStripeBilling' })
    return { ok: false, error: error.message }
  }
  if (error) {
    console.warn(`[billing] ${BILLING_TABLE} missing — Stripe plan written to user_data only. Apply migrations/20260903_user_billing.sql.`)
  }

  return { ok: true }
}
