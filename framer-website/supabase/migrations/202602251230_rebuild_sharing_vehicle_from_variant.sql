BEGIN;

DO $$
DECLARE
    has_transport BOOLEAN := EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'trip_pricing'
          AND column_name = 'transport'
    );
    fix_sql TEXT;
BEGIN
    fix_sql := $q$
        WITH parsed AS (
            SELECT
                id,
                CASE
                    WHEN POSITION(' - ' IN COALESCE(variant_name, '')) > 0
                        THEN TRIM(REGEXP_REPLACE(COALESCE(variant_name, ''), '^.*\\s-\\s', ''))
                    ELSE COALESCE(NULLIF(TRIM(sharing), ''), TRIM(COALESCE(variant_name, '')))
                END AS sharing_raw,
                CASE
                    WHEN POSITION(' - ' IN COALESCE(variant_name, '')) > 0
                        THEN NULLIF(TRIM(REGEXP_REPLACE(COALESCE(variant_name, ''), '\\s-\\s[^-]+$', '')), '')
                    ELSE COALESCE(NULLIF(TRIM(vehicle), ''), 
    $q$;

    IF has_transport THEN
        fix_sql := fix_sql || 'NULLIF(TRIM(transport), '''')';
    ELSE
        fix_sql := fix_sql || 'NULL';
    END IF;

    fix_sql := fix_sql || $q$
                    )
                END AS vehicle_raw
            FROM public.trip_pricing
        )
        UPDATE public.trip_pricing tp
        SET
            sharing = CASE
                WHEN parsed.sharing_raw IS NULL OR TRIM(parsed.sharing_raw) = '' THEN NULL
                WHEN LOWER(parsed.sharing_raw) LIKE '%quad%' THEN 'Quad Sharing'
                WHEN LOWER(parsed.sharing_raw) LIKE '%triple%' THEN 'Triple Sharing'
                WHEN LOWER(parsed.sharing_raw) LIKE '%double%' THEN 'Double Sharing'
                ELSE TRIM(parsed.sharing_raw)
            END,
            vehicle = CASE
                WHEN parsed.vehicle_raw IS NULL OR TRIM(parsed.vehicle_raw) = '' THEN NULL
                WHEN LOWER(TRIM(parsed.vehicle_raw)) IN ('double', 'triple', 'quad', 'double sharing', 'triple sharing', 'quad sharing') THEN NULL
                ELSE TRIM(parsed.vehicle_raw)
            END
        FROM parsed
        WHERE tp.id = parsed.id;
    $q$;

    EXECUTE fix_sql;
END $$;

COMMIT;
