# Human-readable Sheets and reliable lead capture

## Goal

Keep the existing workbooks and tabs, make visible Sheets simple for sales, preserve all meaningful captured fields, repair lead projection reliability, and capture itinerary downloads in the Trip Page Leads route. No new Google Sheets workbooks or tabs.

## Task 1: Human-readable Sheet contracts

Replace visible lead, booking, payment-history, and abandoned-event headers with the approved human-readable contracts. Keep technical identifiers in Supabase/internal repair state only; use India-time sortable dates, numeric INR values, and readable formatting.

## Task 2: Durable lead projection and repair

Make Supabase the durable source of truth for lead events and Sheet projection state. Fail explicitly on missing configuration, retry pending/failed projections idempotently, and deduplicate current rows by normalized email and history by stable submission/event identity.

## Task 3: Itinerary download capture

Add `trip_itinerary_download` lead activity capture through the existing trip-page experience. Preserve one current lead row while aggregating unique downloaded itinerary names and retaining the individual event internally.

## Task 4: Route and regression preservation

Preserve routing for waitlist, general, trip page, NTC, custom, corporate, checkout abandonment, bookings, payment history, and Master Leads. Do not restore the legacy purchase popup.

## Task 5: Safe migration and rollout

Back up and dry-run existing managed tabs, migrate only meaningful values, repair duplicates safely, and verify staging before production.

## Verification

- Deno/frontend contract tests cover headers, formatting, routing, idempotency, retries, itinerary activity, duplicate prevention, and payment/lead regressions.
- Staging Framer tests cover every lead route, itinerary download, checkout abandonment, Razorpay success/failure, status pages, payment email, refresh/back navigation, and repeated submission.
- Production migration occurs only after staging evidence, with no new tabs/workbooks and a post-deployment routing audit.
