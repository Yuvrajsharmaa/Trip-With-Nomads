BEGIN;

ALTER TABLE public.trip_pricing
    ADD COLUMN IF NOT EXISTS sharing TEXT,
    ADD COLUMN IF NOT EXISTS vehicle TEXT;

UPDATE public.trip_pricing
SET
    sharing = NULLIF(TRIM(sharing), ''),
    vehicle = NULLIF(TRIM(REGEXP_REPLACE(COALESCE(vehicle, ''), '\s+', ' ', 'g')), '');

UPDATE public.trip_pricing
SET sharing = CASE
    WHEN sharing IS NULL THEN NULL
    WHEN LOWER(sharing) LIKE '%quad%' THEN 'Quad'
    WHEN LOWER(sharing) LIKE '%triple%' THEN 'Triple'
    WHEN LOWER(sharing) LIKE '%double%' THEN 'Double'
    ELSE NULL
END;

UPDATE public.trip_pricing
SET vehicle = NULL
WHERE vehicle IS NOT NULL
  AND LOWER(vehicle) IN ('quad', 'triple', 'double', 'quad sharing', 'triple sharing', 'double sharing');

UPDATE public.trip_pricing
SET vehicle = NULLIF(
    TRIM(REGEXP_REPLACE(vehicle, '\s*-\s*(quad|triple|double)(\s+sharing)?\s*$', '', 'i')),
    ''
)
WHERE vehicle IS NOT NULL;

ALTER TABLE public.trip_pricing
    DROP CONSTRAINT IF EXISTS trip_pricing_sharing_values_check,
    DROP CONSTRAINT IF EXISTS trip_pricing_price_positive_check;

ALTER TABLE public.trip_pricing
    ADD CONSTRAINT trip_pricing_sharing_values_check
        CHECK (sharing IS NULL OR sharing IN ('Quad', 'Triple', 'Double')),
    ADD CONSTRAINT trip_pricing_price_positive_check
        CHECK (price IS NOT NULL AND price > 0);

DROP INDEX IF EXISTS idx_trip_pricing_dates;
DROP INDEX IF EXISTS trip_pricing_trip_vehicle_sharing_null_date_uidx;
DROP INDEX IF EXISTS trip_pricing_trip_date_vehicle_sharing_uidx;

CREATE UNIQUE INDEX trip_pricing_trip_vehicle_sharing_null_date_uidx
    ON public.trip_pricing (
        trip_id,
        COALESCE(vehicle, ''),
        COALESCE(sharing, '')
    )
    WHERE start_date IS NULL;

CREATE UNIQUE INDEX trip_pricing_trip_date_vehicle_sharing_uidx
    ON public.trip_pricing (
        trip_id,
        start_date,
        COALESCE(vehicle, ''),
        COALESCE(sharing, '')
    )
    WHERE start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_pricing_lookup
    ON public.trip_pricing (trip_id, start_date, sharing, vehicle);

COMMIT;
