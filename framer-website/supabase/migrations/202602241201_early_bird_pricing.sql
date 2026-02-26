BEGIN;

ALTER TABLE public.trip_pricing
    ADD COLUMN IF NOT EXISTS early_bird_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS early_bird_discount_type TEXT CHECK (early_bird_discount_type IN ('flat', 'fixed', 'percent')),
    ADD COLUMN IF NOT EXISTS early_bird_discount_value NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS early_bird_max_discount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS early_bird_starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS early_bird_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS early_bird_label TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_pricing_early_bird_enabled
    ON public.trip_pricing (early_bird_enabled);

CREATE INDEX IF NOT EXISTS idx_trip_pricing_dates
    ON public.trip_pricing (trip_id, start_date, variant_name);

COMMIT;
