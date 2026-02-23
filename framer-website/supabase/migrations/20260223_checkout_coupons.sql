BEGIN;

CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
    min_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
    max_discount NUMERIC(12, 2) CHECK (max_discount > 0),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    applicable_trip_ids TEXT[] NOT NULL DEFAULT '{}',
    usage_limit_total INTEGER CHECK (usage_limit_total > 0),
    usage_limit_per_email INTEGER CHECK (usage_limit_per_email > 0),
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'coupons_set_updated_at'
    ) THEN
        CREATE TRIGGER coupons_set_updated_at
        BEFORE UPDATE ON public.coupons
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS coupon_code TEXT,
    ADD COLUMN IF NOT EXISTS coupon_snapshot JSONB;

UPDATE public.bookings
SET subtotal_amount = GREATEST(COALESCE(total_amount, 0) - COALESCE(tax_amount, 0), 0)
WHERE subtotal_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_code_lower ON public.coupons (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons (is_active);
CREATE INDEX IF NOT EXISTS idx_bookings_coupon_code ON public.bookings (coupon_code);

COMMIT;
