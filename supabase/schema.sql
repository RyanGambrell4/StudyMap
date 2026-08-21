-- ============================================================================
-- StudyEdge AI — canonical database schema
-- ============================================================================
-- Dumped from LIVE PRODUCTION (project vpmgamaspefwqywttdtj) on 2026-08-21.
-- This is the source of truth an agent should read before writing any query.
--
-- Applying this file to an empty project reproduces production's shape exactly.
-- It is also what scripts/seed-students.mjs and the staging environment expect.
--
-- ----------------------------------------------------------------------------
-- DRIFT FOUND WHEN THIS FILE WAS CREATED. Read this before trusting the repo.
-- ----------------------------------------------------------------------------
--
-- 1. migrations/20260727_email_suppression_and_queue.sql WAS NEVER APPLIED.
--    Production has no `email_suppression`, no `email_queue`, and no
--    `app_config`. Eight code sites query them:
--
--      lib/server/emailGuard.js   :33 :47   email_suppression
--      lib/server/emailQueue.js   :27 :41 :64 :72   email_queue
--      lib/server/featureFlags.js :23        app_config
--      lib/server/courseContext.js:78        app_config
--
--    supabase-js does NOT throw on a missing relation, it returns
--    { data: null, error }. Every one of those call sites destructures only
--    `data` and ignores `error`, so the try/catch never fires. Consequences,
--    all silent:
--      - canSendUserEmail() cannot see the suppression list, so a bounced or
--        complained address keeps receiving lifecycle email
--      - every email_queue enqueue and read is a no-op
--      - getGlobalFlags() always returns {}, so lifecycle_v2 can never be on
--
--    This file documents production as it IS. The three tables are included
--    at the bottom, commented out, so applying this file does not silently
--    "fix" production drift by creating them on staging and hiding the bug.
--    Uncomment deliberately if you want staging to model the intended state.
--
-- 2. supabase/rls-lockdown.sql does NOT match live state.
--    It drops and recreates the four named user_data policies, but it never
--    drops the older permissive policy "Users can manage their own data"
--    (FOR ALL USING auth.uid() = user_id). That policy is STILL LIVE and sits
--    alongside the four. Postgres ORs permissive policies, so it grants at
--    least as much as the specific ones do. It is not a privilege escalation
--    for `subscription`, because the trigger below is what actually protects
--    that column, but the lockdown file's stated intent was not fully achieved.
--    Both are reproduced below exactly as they exist in production.
--
-- 3. The `subscription` guard trigger has a consequence the app code does not
--    account for. See the comment on user_data_guard_subscription() below. It
--    is the most important thing in this file.
-- ============================================================================


-- ── Extensions ──────────────────────────────────────────────────────────────
-- Supabase provisions these into the `extensions` schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


-- ============================================================================
-- user_data — one row per user. Almost all app state lives here as JSONB.
-- ============================================================================
-- The quota columns are NOT columns. They are keys inside `subscription`:
--
--   subscription.plan               'free' | 'pro' | 'unlimited'
--   subscription.status             'active' | 'trialing' | 'past_due' | 'cancelled'
--   subscription.aiQueriesUsed      int, the AI action counter
--   subscription.aiQueriesResetAt   ISO ts, monthly boundary (see isNewMonth)
--   subscription.lastAiCallAt       ISO ts
--   subscription.bonusAiActions     int, granted by the paywall exit gift
--   subscription.stripeSubId        stripe subscription id
--   subscription.stripeCustomerId   stripe customer id
--   subscription.billingPeriod      'weekly' | 'monthly' | 'yearly' | 'semester'
--   subscription.currentPeriodEnd   ISO ts, also the trial_end while trialing
--   subscription.trialUsedAt        ISO ts, stamped by the webhook
--   subscription.trial_activated    legacy no-card trial flag
--   subscription.trial_start_date   legacy no-card trial start
--   subscription.feature_usage      { [feature]: { count, resetAt } }
--   subscription.firstGenerationAt  ISO ts, first AI generation that SUCCEEDED
--   subscription.quotaRestoredAt    ISO ts, stamped by the quota repair script
--
-- `plan` (the column, not subscription.plan) is the study plan JSON and holds
-- `plan.courses`, which is the array the first-course gate keys off.
CREATE TABLE IF NOT EXISTS public.user_data (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan               jsonb,
  syllabus_events    jsonb DEFAULT '[]'::jsonb,
  manual_sessions    jsonb DEFAULT '[]'::jsonb,
  coach_plans        jsonb DEFAULT '{}'::jsonb,
  study_tools        jsonb,
  session_notes      jsonb DEFAULT '{}'::jsonb,
  session_recalls    jsonb DEFAULT '[]'::jsonb,
  updated_at         timestamptz DEFAULT now(),
  subscription       jsonb,
  completed_sessions jsonb DEFAULT '[]'::jsonb,
  sms_phone          text,
  sms_enabled        boolean DEFAULT false,
  push_subscription  jsonb,
  last_emailed_at    timestamptz,
  trial_email_flags  jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS user_data_last_emailed_at_idx ON public.user_data (last_emailed_at);


-- ============================================================================
-- topic_signals — per-topic evidence of what a student does and does not know.
-- ============================================================================
-- Written by recordTopicSignal() in lib/server/topicSignals.js. This is one of
-- the three tables a SUCCESSFUL generation leaves a trace in, and is therefore
-- part of how scripts/restoreQuotaForFailedRequests.mjs decides who was charged
-- for work that never happened.
--
-- score is normalised 0..1 and CHECK-constrained. signal_type and source are
-- both CHECK-constrained to closed sets, so an unrecognised value is rejected
-- at write time rather than silently stored.
CREATE TABLE IF NOT EXISTS public.topic_signals (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id   text NOT NULL,
  course_name text NOT NULL,
  topic       text NOT NULL,
  -- A STORED GENERATED column, not a default. Postgres records generated
  -- expressions in pg_attrdef, so a naive dump that reads pg_get_expr without
  -- also checking pg_attribute.attgenerated reproduces it as
  -- `DEFAULT lower(btrim(topic))`, which Postgres rejects outright with
  -- "cannot use column reference in DEFAULT expression". Applying this file to
  -- staging is what caught it.
  topic_key   text GENERATED ALWAYS AS (lower(btrim(topic))) STORED,
  signal_type text NOT NULL CHECK (signal_type = ANY (ARRAY[
                'brain_dump_gap','teach_it_back','repair_misconception',
                'quiz_answer','practice_exam_answer'])),
  source      text NOT NULL CHECK (source = ANY (ARRAY[
                'server_graded','client_graded_server_generated'])),
  score       real NOT NULL CHECK (score >= 0 AND score <= 1),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topic_signals_user_course_recent_idx
  ON public.topic_signals (user_id, course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS topic_signals_user_course_topic_key_idx
  ON public.topic_signals (user_id, course_id, topic_key);


-- ============================================================================
-- generated_artifacts — saved output of a successful generation.
-- ============================================================================
-- Second of the three success-trace tables.
CREATE TABLE IF NOT EXISTS public.generated_artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id     text NOT NULL,
  course_name   text NOT NULL,
  artifact_type text NOT NULL,
  title         text NOT NULL,
  topic         text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generated_artifacts_user_course_recent_idx
  ON public.generated_artifacts (user_id, course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_artifacts_user_type_idx
  ON public.generated_artifacts (user_id, artifact_type);


-- ============================================================================
-- course_uploads — syllabi and course material, with extracted text.
-- ============================================================================
-- Third of the three success-trace tables. `kind = 'syllabus'` is what the
-- first-course gate's upload path writes.
CREATE TABLE IF NOT EXISTS public.course_uploads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  course_id      text NOT NULL,
  filename       text NOT NULL,
  file_type      text NOT NULL,
  kind           text NOT NULL DEFAULT 'material',
  char_count     integer NOT NULL DEFAULT 0,
  extracted_text text,
  status         text NOT NULL DEFAULT 'processed',
  error_message  text,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_uploads_user_course
  ON public.course_uploads (user_id, course_id);


-- ============================================================================
-- Remaining tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.struggle_topics (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  topic       text NOT NULL,
  flagged_at  timestamptz NOT NULL DEFAULT now(),
  course_id   text,
  PRIMARY KEY (user_id, course_name, topic)
);
CREATE INDEX IF NOT EXISTS struggle_topics_user_course_id_idx
  ON public.struggle_topics (user_id, course_id) WHERE course_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.course_grade_baselines (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id      text NOT NULL,
  baseline_grade real NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.ios_state (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot   jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.one_time_offers (
  code           text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_coupon  text NOT NULL,
  discount_pct   integer NOT NULL,
  reason         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  redeemed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS one_time_offers_user_id_idx ON public.one_time_offers (user_id);
CREATE INDEX IF NOT EXISTS one_time_offers_expires_idx ON public.one_time_offers (expires_at);

CREATE TABLE IF NOT EXISTS public.feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email      text,
  message    text NOT NULL,
  route      text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_user_id_idx    ON public.feedback (user_id);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);

-- Service-role only. RLS is ON with NO policies, which denies every
-- non-service role by default. That is deliberate, not an oversight.
CREATE TABLE IF NOT EXISTS public.cron_locks (
  cron_name  text NOT NULL,
  run_date   date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cron_name, run_date)
);
CREATE INDEX IF NOT EXISTS idx_cron_locks_created_at ON public.cron_locks (created_at);

-- Service-role only, same as cron_locks.
CREATE TABLE IF NOT EXISTS public.stripe_idempotency (
  event_id     text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_idempotency_processed_at
  ON public.stripe_idempotency (processed_at);

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);


-- ============================================================================
-- Functions
-- ============================================================================

-- Works around a GoTrue bug: auth.admin.listUsers() 500s when any row has a
-- NULL confirmation_token. Every drip-email cron reads users through this.
CREATE OR REPLACE FUNCTION public.list_users_by_signup_window(
  start_ts timestamptz, end_ts timestamptz)
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, raw_user_meta_data jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select id, email, created_at, raw_user_meta_data
  from auth.users
  where created_at >= start_ts
    and created_at <  end_ts
    and email is not null
    and email != ''
  order by created_at asc
  limit 2000;
$function$;

CREATE OR REPLACE FUNCTION public.touch_ios_state_updated_at()
RETURNS trigger LANGUAGE plpgsql
AS $function$ begin new.updated_at := now(); return new; end; $function$;

-- ----------------------------------------------------------------------------
-- THE MOST IMPORTANT THING IN THIS FILE.
--
-- This trigger makes `subscription` WRITE-ONLY TO THE SERVICE ROLE. Any write
-- from the browser, using the user's own JWT, has its `subscription` value
-- silently replaced: reset to a default on INSERT, reverted to OLD on UPDATE.
-- No error is raised. The client's upsert appears to succeed.
--
-- Consequences the application code does not account for:
--
--   * src/lib/subscription.js incrementFeatureUsage() writes
--     subscription.feature_usage from the browser. It is DISCARDED, every
--     time. This is why `feature_usage` had never been written on any of 777
--     production rows. It was attributed to two server writers clobbering each
--     other; this trigger is at minimum a co-cause and more likely the primary
--     one, because a clobber would still leave the key present sometimes.
--
--   * src/lib/subscription.js markSuccessfulGeneration() writes
--     subscription.firstGenerationAt from the browser. Also DISCARDED. The
--     value survives only because lib/server/usage.js commitReservation()
--     writes it with the service role on the success path of every AI call.
--     The client write is dead code that looks live.
--
-- Anything that must persist into `subscription` has to go through a server
-- endpoint holding SUPABASE_SERVICE_KEY. There is no exception.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_data_guard_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.subscription := jsonb_build_object(
        'plan', 'free',
        'status', 'active',
        'aiQueriesUsed', 0,
        'aiQueriesResetAt', null,
        'stripeSubId', null,
        'stripeCustomerId', null,
        'billingPeriod', null,
        'currentPeriodEnd', null,
        'lastAiCallAt', null
      );
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.subscription := OLD.subscription;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- Triggers
-- ============================================================================
DROP TRIGGER IF EXISTS ios_state_set_updated_at ON public.ios_state;
CREATE TRIGGER ios_state_set_updated_at
  BEFORE INSERT OR UPDATE ON public.ios_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_ios_state_updated_at();

DROP TRIGGER IF EXISTS user_data_guard_subscription_trg ON public.user_data;
CREATE TRIGGER user_data_guard_subscription_trg
  BEFORE INSERT OR UPDATE ON public.user_data
  FOR EACH ROW EXECUTE FUNCTION public.user_data_guard_subscription();


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Reproduced exactly as live, including the drift noted in the header.
-- cron_locks and stripe_idempotency have RLS ON and no policies on purpose.

ALTER TABLE public.user_data              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_signals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_artifacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_uploads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.struggle_topics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_grade_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ios_state              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_offers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_locks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_idempotency     ENABLE ROW LEVEL SECURITY;

-- user_data. NOTE the first policy is the legacy permissive one that
-- rls-lockdown.sql intended to replace but never dropped. It is live.
CREATE POLICY "Users can manage their own data" ON public.user_data
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_data_select_own ON public.user_data
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_data_insert_own ON public.user_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_data_update_own ON public.user_data
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_data_delete_own ON public.user_data
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "owner all" ON public.topic_signals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.generated_artifacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.struggle_topics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.course_grade_baselines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Note: no WITH CHECK live, so the insert side is unconstrained by policy.
CREATE POLICY "users own their uploads" ON public.course_uploads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "owner reads ios_state"   ON public.ios_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner writes ios_state"  ON public.ios_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates ios_state" ON public.ios_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner reads offers" ON public.one_time_offers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "authenticated inserts feedback" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner reads feedback" ON public.feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY waitlist_insert ON public.waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);


-- ============================================================================
-- NOT IN PRODUCTION. See drift note 1 in the header.
-- ============================================================================
-- migrations/20260727_email_suppression_and_queue.sql defines these three and
-- was never applied. Eight code sites read them and silently get null. They are
-- left commented so that applying this file reproduces production as it really
-- is, rather than masking a live defect.
--
-- CREATE TABLE IF NOT EXISTS public.email_suppression (
--   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   email         text NOT NULL UNIQUE,
--   reason        text NOT NULL CHECK (reason IN ('bounced','complained','manual')),
--   suppressed_at timestamptz DEFAULT now()
-- );
--
-- CREATE TABLE IF NOT EXISTS public.app_config (
--   id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
--   feature_flags jsonb NOT NULL DEFAULT '{}',
--   updated_at    timestamptz DEFAULT now()
-- );
--
-- email_queue: see the migration for the full definition.
