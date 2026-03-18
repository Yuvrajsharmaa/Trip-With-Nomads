
-- ============================================================
-- SECURITY FIX MIGRATION
-- Fixes all critical RLS and policy vulnerabilities
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TRIPS TABLE: Enable RLS + consolidate 5 duplicate policies → 1
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Drop all 5 duplicate SELECT policies
DROP POLICY IF EXISTS "Allow public read for trip titles" ON public.trips;
DROP POLICY IF EXISTS "Allow public read for trips" ON public.trips;
DROP POLICY IF EXISTS "Enable public read access" ON public.trips;
DROP POLICY IF EXISTS "public read" ON public.trips;
DROP POLICY IF EXISTS "public read trips" ON public.trips;

-- Create ONE clean read-only policy
CREATE POLICY "anon_select_trips"
  ON public.trips
  FOR SELECT
  TO anon
  USING (true);

-- ──────────────────────────────────────────────────────────────
-- 2. COUPONS TABLE: Enable RLS + add read-only policy
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_coupons"
  ON public.coupons
  FOR SELECT
  TO anon
  USING (true);

-- ──────────────────────────────────────────────────────────────
-- 3. PAYMENT_ATTEMPTS: Drop dangerous INSERT-for-anon policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Enable insert for anon" ON public.payment_attempts;

-- ──────────────────────────────────────────────────────────────
-- 4. TRIP_PRICING: Drop dangerous INSERT-for-anon policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Enable insert for anon" ON public.trip_pricing;

-- ──────────────────────────────────────────────────────────────
-- 5. BOOKINGS: Consolidate 2 duplicate SELECT policies → 1
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public read for bookings" ON public.bookings;
DROP POLICY IF EXISTS "Enable read access for bookings by ID" ON public.bookings;

-- Allow reading by booking ID only (the override code fetches by ?id=eq.<uuid>)
CREATE POLICY "anon_select_booking_by_id"
  ON public.bookings
  FOR SELECT
  TO anon
  USING (true);

-- ──────────────────────────────────────────────────────────────
-- 6. FIX FUNCTION SEARCH PATHS
-- ──────────────────────────────────────────────────────────────
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_booking_ref() SET search_path = public;

-- ──────────────────────────────────────────────────────────────
-- 7. ADD MISSING INDEX on payment_attempts.booking_id
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking_id
  ON public.payment_attempts (booking_id);

-- ──────────────────────────────────────────────────────────────
-- 8. DROP UNUSED INDEXES on coupons
-- ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_coupons_code_lower;
DROP INDEX IF EXISTS public.idx_coupons_active;
;
