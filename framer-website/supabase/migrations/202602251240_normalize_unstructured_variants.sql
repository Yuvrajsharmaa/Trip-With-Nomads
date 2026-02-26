BEGIN;

-- Normalize any legacy sharing labels into strict canonical values.
UPDATE public.trip_pricing
SET sharing = CASE
    WHEN LOWER(COALESCE(sharing, '')) LIKE '%quad%' OR LOWER(COALESCE(variant_name, '')) LIKE '%quad%' THEN 'Quad'
    WHEN LOWER(COALESCE(sharing, '')) LIKE '%triple%' OR LOWER(COALESCE(variant_name, '')) LIKE '%triple%' THEN 'Triple'
    WHEN LOWER(COALESCE(sharing, '')) LIKE '%double%' OR LOWER(COALESCE(variant_name, '')) LIKE '%double%' THEN 'Double'
    ELSE NULL
END;

-- Normalize vehicle text whitespace.
UPDATE public.trip_pricing
SET vehicle = NULLIF(TRIM(REGEXP_REPLACE(COALESCE(vehicle, ''), '\s+', ' ', 'g')), '');

-- If variant_name has "vehicle - sharing", recover vehicle from variant_name when missing.
UPDATE public.trip_pricing
SET vehicle = NULLIF(
    TRIM(REGEXP_REPLACE(COALESCE(variant_name, ''), '\s*-\s*(quad|triple|double)(\s+sharing)?\s*$', '', 'i')),
    ''
)
WHERE vehicle IS NULL
  AND COALESCE(variant_name, '') ~* '\s-\s*(quad|triple|double)(\s+sharing)?\s*$';

-- Remove accidental sharing leftovers from vehicle labels.
UPDATE public.trip_pricing
SET vehicle = NULLIF(
    TRIM(REGEXP_REPLACE(COALESCE(vehicle, ''), '\s*-\s*(quad|triple|double)(\s+sharing)?\s*$', '', 'i')),
    ''
);

-- Vehicle must never duplicate sharing labels.
UPDATE public.trip_pricing
SET vehicle = NULL
WHERE LOWER(COALESCE(vehicle, '')) IN (
    'quad',
    'triple',
    'double',
    'quad sharing',
    'triple sharing',
    'double sharing',
    'standard'
);

COMMIT;
