BEGIN;

INSERT INTO public.coupons (
    code,
    is_active,
    discount_type,
    discount_value,
    min_subtotal,
    max_discount,
    starts_at,
    ends_at,
    applicable_trip_ids,
    usage_limit_total,
    usage_limit_per_email
)
VALUES (
    'NOMADS',
    TRUE,
    'fixed',
    1500,
    0,
    NULL,
    NOW(),
    NULL,
    '{}',
    NULL,
    1
)
ON CONFLICT (code) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    min_subtotal = EXCLUDED.min_subtotal,
    max_discount = EXCLUDED.max_discount,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    applicable_trip_ids = EXCLUDED.applicable_trip_ids,
    usage_limit_total = EXCLUDED.usage_limit_total,
    usage_limit_per_email = EXCLUDED.usage_limit_per_email,
    updated_at = NOW();

COMMIT;
