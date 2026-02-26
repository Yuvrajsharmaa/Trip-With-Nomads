BEGIN;

-- Derive sharing + vehicle from variant_name when missing.
DO $$
DECLARE
    has_transport BOOLEAN := EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'trip_pricing'
          AND column_name = 'transport'
    );
    update_sql TEXT;
BEGIN
    update_sql := $q$
        UPDATE public.trip_pricing
        SET
            sharing = COALESCE(
                NULLIF(TRIM(sharing), ''),
                CASE
                    WHEN POSITION(' - ' IN COALESCE(variant_name, '')) > 0
                        THEN NULLIF(TRIM(REGEXP_REPLACE(variant_name, '^.*\\s-\\s', '')), '')
                    ELSE NULLIF(TRIM(COALESCE(variant_name, '')), '')
                END
            ),
            vehicle = COALESCE(
                NULLIF(TRIM(vehicle), ''),
    $q$;

    IF has_transport THEN
        update_sql := update_sql || 'NULLIF(TRIM(transport), ''''),';
    ELSE
        update_sql := update_sql || 'NULL,';
    END IF;

    update_sql := update_sql || $q$
                CASE
                    WHEN POSITION(' - ' IN COALESCE(variant_name, '')) > 0
                        THEN NULLIF(TRIM(REGEXP_REPLACE(variant_name, '\\s-\\s[^-]+$', '')), '')
                    ELSE NULL
                END
            )
        WHERE
            sharing IS NULL OR TRIM(sharing) = '' OR vehicle IS NULL OR TRIM(COALESCE(vehicle, '')) = '';
    $q$;

    EXECUTE update_sql;
END $$;

-- Normalize sharing labels and remove accidental duplicate suffixes.
UPDATE public.trip_pricing
SET sharing = CASE
    WHEN sharing IS NULL OR TRIM(sharing) = '' THEN NULL
    WHEN LOWER(TRIM(sharing)) IN ('double', 'double sharing') THEN 'Double Sharing'
    WHEN LOWER(TRIM(sharing)) IN ('triple', 'triple sharing') THEN 'Triple Sharing'
    WHEN LOWER(TRIM(sharing)) IN ('quad', 'quad sharing') THEN 'Quad Sharing'
    ELSE TRIM(
        REGEXP_REPLACE(
            REGEXP_REPLACE(TRIM(sharing), '(?i)\\s+sharing\\s+sharing\\s*$', ' Sharing'),
            '(?i)\\s{2,}',
            ' ',
            'g'
        )
    )
END;

COMMIT;
