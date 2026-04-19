-- ============================================================================
-- StudyEdge Row-Level Security lockdown
-- ============================================================================
-- Purpose: prevent users from editing their own subscription (plan / quota)
-- from the browser. Only the Stripe webhook (service role) and the AI usage
-- enforcement helper (service role) should ever write to the `subscription`
-- and `lastAiCallAt` / `aiQueriesUsed` fields.
--
-- HOW TO APPLY
-- 1. Go to Supabase dashboard -> SQL Editor
-- 2. Paste this whole file and click Run
-- 3. Test that the app still works end-to-end
--
-- HOW TO ROLL BACK
-- Run the commands under "-- ROLLBACK" at the bottom.
-- ============================================================================

-- Make sure RLS is ON for user_data (it should be already)
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Drop any permissive policies we're about to replace. Safe if they don't exist.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS user_data_select_own    ON public.user_data;
DROP POLICY IF EXISTS user_data_insert_own    ON public.user_data;
DROP POLICY IF EXISTS user_data_update_own    ON public.user_data;
DROP POLICY IF EXISTS user_data_delete_own    ON public.user_data;

-- ----------------------------------------------------------------------------
-- SELECT: users can read their own row.
-- ----------------------------------------------------------------------------
CREATE POLICY user_data_select_own
  ON public.user_data FOR SELECT
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- INSERT: users can create their own row. The trigger below forces
-- `subscription` to a safe default regardless of what they submit.
-- ----------------------------------------------------------------------------
CREATE POLICY user_data_insert_own
  ON public.user_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- UPDATE: users can update their own row. The trigger below forces the
-- `subscription` column to retain its previous value on every user-initiated
-- update — so even a malicious browser call cannot flip plan = 'unlimited'.
-- ----------------------------------------------------------------------------
CREATE POLICY user_data_update_own
  ON public.user_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- DELETE: users can delete their own row (account deletion).
-- ----------------------------------------------------------------------------
CREATE POLICY user_data_delete_own
  ON public.user_data FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Trigger: block user-initiated writes to `subscription`.
--
-- auth.role() returns 'authenticated' for users using the anon key, and
-- 'service_role' for server code using the service key. Only the service
-- role should ever change the subscription column.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_data_guard_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      -- Force a safe default on insert, no matter what the client sent.
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
      -- Preserve whatever the server last wrote. Client cannot modify it.
      NEW.subscription := OLD.subscription;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_data_guard_subscription_trg ON public.user_data;
CREATE TRIGGER user_data_guard_subscription_trg
  BEFORE INSERT OR UPDATE ON public.user_data
  FOR EACH ROW
  EXECUTE FUNCTION public.user_data_guard_subscription();

-- ============================================================================
-- ROLLBACK (run manually if you need to revert)
-- ============================================================================
-- DROP TRIGGER IF EXISTS user_data_guard_subscription_trg ON public.user_data;
-- DROP FUNCTION IF EXISTS public.user_data_guard_subscription();
-- (and recreate your previous policies)
