# Security Change Log

## 2026-03-19

- Completed security hardening rollout for checkout/payment status on both Supabase projects:
  - production: `jxozzvwvprmnhvafmpsa`
  - staging: `ieuwiinbvbdvjrdqqzlb`
- Deployed updated edge functions:
  - `create-booking`
  - `handle-payment`
  - `retry-payment`
  - `get-booking-status` (new)
- Applied migration `20260318121000_secure_bookings_status_access.sql` on both environments.
- Re-enabled RLS for `public.bookings` and removed legacy anonymous read policies.
- Added signed booking status token flow:
  - `create-booking` now returns `status_token`
  - `handle-payment` now redirects with `status_token`
  - `get-booking-status` now requires valid `booking_id + status_token`
- Hardened payment callback and retry paths:
  - PayU callback authenticity now validates key + hash before booking mutation.
  - Retry now requires `booking_id` (UUID) and matching booking email.
- Fixed Google Sheets booking append range from `A:Z` to `A:ZZ` to avoid truncating booking rows.
- Verified behavior with live smoke tests:
  - direct anon bookings reads now return no rows
  - missing/invalid status token is rejected (`401`/`403`)
  - retry endpoint rejects requests without email
  - staging end-to-end flow confirms redirect URLs include `status_token`

## Follow-up

- Publish latest Framer project build so production site bundle definitely reflects the updated `BookingStatusOverride.tsx`.
