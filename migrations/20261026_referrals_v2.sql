-- Migration: referrals v2 (codes, server-recorded referrals, banked rewards)
-- ============================================================================
-- Replaces the client-written user_data.subscription.referredBy (writable by
-- the user it describes) with service-role-only tables. Users may read their
-- own rows; only the API (service role) writes.
--
-- Additive only. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One referral per account, ever: this is the duplicate guard.
  referred_id  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code         text NOT NULL,
  source       text NOT NULL DEFAULT 'code',          -- 'code' | 'link' | 'legacy_link'
  status       text NOT NULL DEFAULT 'joined',        -- 'joined' | 'paid' | 'rewarded'
  joined_at    timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  paid_via     text,                                  -- 'stripe' | 'apple'
  rewarded_at  timestamptz,
  reward       jsonb,                                 -- { kind, days|amount, currency, ... }
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_id),
  CONSTRAINT referrals_status_check CHECK (status IN ('joined', 'paid', 'rewarded'))
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);

-- Free months a paying-through-Apple referrer has earned but cannot use yet
-- (Apple bills them; we cannot discount an Apple renewal). Applied as 30-day
-- grants when their Apple subscription lapses.
ALTER TABLE public.user_billing
  ADD COLUMN IF NOT EXISTS referral_months_banked integer NOT NULL DEFAULT 0;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Verify:
--   select count(*) from public.referral_codes;  -- 0
--   select count(*) from public.referrals;       -- 0
--   select column_name from information_schema.columns
--    where table_name='user_billing' and column_name='referral_months_banked';
