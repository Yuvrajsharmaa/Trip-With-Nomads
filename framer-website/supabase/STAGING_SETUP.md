# Staging Supabase Setup

This document sets up a separate `development` environment for:

- site: `https://maroon-aside-814100.framer.app`
- database: dedicated staging Supabase project
- payments: PayU test mode

## 1) Create and link the staging project

1. Create a new Supabase project in the dashboard (same region as production).
2. Save:
   - project ref
   - anon key
   - service role key
3. Link CLI to staging:

```bash
cd /Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website
supabase link --project-ref <STAGING_PROJECT_REF>
```

## 2) Apply schema migrations

```bash
cd /Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website
supabase db push
```

## 3) Deploy edge functions to staging

```bash
cd /Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website
supabase functions deploy create-booking
supabase functions deploy handle-payment
supabase functions deploy retry-payment
supabase functions deploy validate-coupon
supabase functions deploy get-trip-display-price
```

## 4) Set staging secrets

Set these in staging function secrets:

- `FRAMER_BASE_URL=https://maroon-aside-814100.framer.app`
- `PAYMENT_CALLBACK_URL=https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/handle-payment`
- `PAYU_TEST_MODE=true`
- `PAYU_TEST_KEY=<PAYU_TEST_KEY>`
- `PAYU_TEST_SALT=<PAYU_TEST_SALT>`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (managed by Supabase runtime)

## 5) Seed catalog data only (no bookings/payment history)

```bash
cd /Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website
SOURCE_SUPABASE_URL=https://jxozzvwvprmnhvafmpsa.supabase.co \
SOURCE_SUPABASE_SERVICE_ROLE_KEY=<PROD_SERVICE_ROLE_KEY> \
TARGET_SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co \
TARGET_SUPABASE_SERVICE_ROLE_KEY=<STAGING_SERVICE_ROLE_KEY> \
node scripts/seed_catalog_to_staging.mjs
```

`seed_catalog_to_staging.mjs` copies only:

- `trips`
- `trip_pricing`
- `coupons`

It intentionally skips `bookings` and payment-attempt style history tables.

## 6) Verify env split

1. On staging (`maroon-aside-814100.framer.app`), booking writes must land in staging DB.
2. On production (`tripwithnomads.com`), booking writes must land in production DB.
3. Staging should use PayU test gateway.
4. Production should use PayU live gateway.
