-- Migration: user_billing.apple_original_transaction_id
-- ============================================================================
-- Records which App Store subscription set a billing row, so that
-- /api/apple-subscription can clear a plan it granted (an expired or
-- refunded iOS subscription) without ever touching a row that Stripe owns.
--
-- Safe to re-run. Applied 2026-10-23 via the Supabase MCP.

ALTER TABLE public.user_billing
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text;

COMMENT ON COLUMN public.user_billing.apple_original_transaction_id IS
  'originalTransactionId of the StoreKit 2 subscription that last set plan/status on this row. Null when Stripe (or nothing) set it. See lib/server/appleSubscription.js.';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_billing' AND column_name = 'apple_original_transaction_id';
