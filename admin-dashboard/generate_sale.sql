-- Generated Early Bird Sale Updates

WITH sale_map AS (
    SELECT * FROM (VALUES
        ('summer-spiti', 'Quad Sharing', 16500::numeric),
        ('summer-spiti', 'Triple Sharing', 17500::numeric),
        ('summer-spiti', 'Double Sharing', 19000::numeric),
        ('4x4-summer-spiti', 'Triple Sharing', 30000::numeric),
        ('4x4-summer-spiti', 'Double Sharing', 32000::numeric),
        ('4x4-summer-spiti', 'Triple Sharing', 33000::numeric),
        ('4x4-summer-spiti', 'Double Sharing', 34000::numeric),
        ('spiti-biking', 'SIC (Seat in Couch) - Triple Sharing', 20000::numeric),
        ('spiti-biking', 'Self Bike - Triple', 19000::numeric),
        ('spiti-biking', 'RE Himalayan Dual (Dual) - Triple Sharing', 27000::numeric),
        ('spiti-biking', 'RE HImalayan Solo Rider - Triple', 37000::numeric),
        ('spiti-biking', 'SIC (Seat in Couch) - Double Sharing', 23000::numeric),
        ('spiti-biking', 'Self Bike - Double', 22000::numeric),
        ('spiti-biking', 'RE Himalayan Dual (Dual) - Double Sharing', 30000::numeric),
        ('spiti-biking', 'RE HImalayan Solo Rider - Double', 40000::numeric),
        ('manali-with-chandrataal-2n', 'Triple Sharing', 10000::numeric),
        ('manali-with-chandrataal-2n', 'Double Sharing', 11000::numeric),
        ('teen-taal', 'Triple Sharing', 14000::numeric),
        ('teen-taal', 'Double Sharing', 15000::numeric),
        ('teen-taal-with-gopuranjan-4n', 'Triple Sharing', 15500::numeric),
        ('teen-taal-with-gopuranjan-4n', 'Double Sharing', 16500::numeric),
        ('zanskar-6n', 'Triple Sharing', 24000::numeric),
        ('zanskar-6n', 'Double Sharing', 28000::numeric),
        ('do-dhaam', 'Quad Sharing', 10000::numeric),
        ('do-dhaam', 'Triple Sharing', 11000::numeric),
        ('do-dhaam', 'Double Sharing', 12000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'SIC (Seat in Couch) - Triple', 17000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'RE Himalayan - Dual - Triple Sharing', 20000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'RE Himalayan - Solo - Triple Sharing', 25000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'SIC (Seat in Couch)- Double', 20000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'RE Himalayan - Dual - Double Sharing', 23000::numeric),
        ('leh-to-leh-with-turtuk-5n6d', 'RE Himalayan - Solo - Double Sharing', 28000::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'SIC (Seat in Couch) - Triple', 18999::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'RE Himalayan - Dual - Triple Sharing', 22999::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'RE Himalayan - Solo - Triple Sharing', 27999::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'SIC (Seat in Couch) - Double', 21999::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'RE Himalayan - Dual - Double Sharing', 25999::numeric),
        ('leh-to-leh-with-turtuk-6n7d', 'RE Himalayan - Solo - Double Sharing', 30999::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'SIC (Seat in Couch) - Triple', 27000::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'RE Himalayan - Dual - Triple Sharing', 27000::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'RE Himalayan - Solo - Triple Sharing', 37000::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'SIC (Seat in Couch) - Double', 30000::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'RE Himalayan - Dual - Double Sharing', 30000::numeric),
        ('leh-to-leh-with-umling-la-hanle-tso-moriri', 'RE Himalayan - Solo - Double Sharing', 40000::numeric),
        ('winter-spiti-expedition', 'Quad Sharing', 17000::numeric),
        ('winter-spiti-expedition', 'Triple Sharing', 18000::numeric),
        ('winter-spiti-expedition', 'Double Sharing', 19000::numeric),
        ('spiti-valley-with-sangla-holi', 'Triple Sharing', 18999::numeric),
        ('spiti-valley-with-sangla-holi', 'Double Sharing', 20999::numeric),
        ('sangla-holi-special', 'Quad Sharing', 13000::numeric),
        ('sangla-holi-special', 'Triple Sharing', 14000::numeric),
        ('sangla-holi-special', 'Double Sharing', 15000::numeric),
        ('ladakh-apricot-blossom', 'SIC (Seat in Couch) - Triple Sharing', 20999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 411 (DUAL RIDER)', 24999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 450 (DUAL RIDER)', 29999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 411 (SOLO RIDER)', 30999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 450 (SOLO RIDER)', 34999::numeric),
        ('ladakh-apricot-blossom', 'SIC (Seat in Couch) - Triple Sharing', 23999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 411 (DUAL RIDER)', 27999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 450 (DUAL RIDER)', 32999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 411 (SOLO RIDER)', 33999::numeric),
        ('ladakh-apricot-blossom', 'RE HIMALAYAN 450 (SOLO RIDER)', 37999::numeric)
    ) AS t(slug, variant_name, sale_price)
),
updated AS (
    UPDATE public.trip_pricing tp
    SET
        early_bird_enabled = TRUE,
        early_bird_discount_type = 'flat',
        early_bird_discount_value = GREATEST(COALESCE(tp.price, 0) - sm.sale_price, 0),
        early_bird_starts_at = NOW(),
        early_bird_label = 'Summer Early Bird Sale 2026'
    FROM public.trips tr
    JOIN sale_map sm ON sm.slug = tr.slug
    WHERE tp.trip_id = tr.id
      AND LOWER(TRIM(tp.variant_name)) = LOWER(TRIM(sm.variant_name))
      AND tp.price > 0
    RETURNING tp.id, tr.slug, sm.variant_name as mapped_variant, tp.variant_name as db_variant, COALESCE(tp.price, 0) - sm.sale_price as discount
)
SELECT * FROM updated;
