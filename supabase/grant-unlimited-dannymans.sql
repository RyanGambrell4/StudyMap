-- ============================================================================
-- Grant unlimited StudyEdge access to dannymans.2002@gmail.com
-- ============================================================================
-- HOW TO APPLY
-- 1. Go to Supabase dashboard -> SQL Editor
-- 2. Paste this file and click Run (runs as service_role, bypasses RLS guard)
-- 3. Verify with the SELECT at the bottom
-- ============================================================================

WITH target AS (
  SELECT id AS user_id
  FROM auth.users
  WHERE lower(email) = lower('dannymans.2002@gmail.com')
  LIMIT 1
)
INSERT INTO public.user_data (user_id, subscription, updated_at)
SELECT
  target.user_id,
  jsonb_build_object(
    'plan', 'unlimited',
    'status', 'active',
    'aiQueriesUsed', 0,
    'aiQueriesResetAt', now()::text,
    'stripeSubId', null,
    'stripeCustomerId', null,
    'billingPeriod', null,
    'currentPeriodEnd', null,
    'lastAiCallAt', null,
    'grantedManually', true,
    'grantedAt', now()::text
  ),
  now()
FROM target
ON CONFLICT (user_id) DO UPDATE
SET
  subscription = COALESCE(public.user_data.subscription, '{}'::jsonb)
    || jsonb_build_object(
         'plan', 'unlimited',
         'status', 'active',
         'grantedManually', true,
         'grantedAt', now()::text
       ),
  updated_at = now();

-- Verify
SELECT u.email, d.subscription
FROM auth.users u
JOIN public.user_data d ON d.user_id = u.id
WHERE lower(u.email) = lower('dannymans.2002@gmail.com');
