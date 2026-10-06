# Booking, Checkout, Webhook, and Existing-Sheet Hardening

## Summary

Use Supabase as the source of truth. Payment webhooks are authoritative for payment state and payment-sheet updates. Browser gateway returns only redirect users to the status page and must not mark payments successful or append payment history.

No new Google Sheets workbooks or tabs will be created. Existing tabs remain:

- `Bookings`: one current row per booking.
- `Bookings_Success` and `Bookings_Failed`: append-only verified payment history.
- `Leads`: one current row per normalized contact.
- `Abandoned Leads`: partial lead submissions.
- Preserve the existing `NTC - Invites` route if it already exists.

## Implementation sequence

## Task 1: Establish staging truth

1. Map the deployed staging checkout, active gateway, webhook URL, Supabase functions, Sheet IDs, existing headers, duplicate booking IDs, duplicate lead emails, orphan rows, and gateway-specific columns. Keep this audit read-only.

## Task 2: Add durable idempotency and payment attempts

2. Add internal Supabase idempotency state without adding any Google Sheet tabs:

   - `bookings.checkout_request_id`, unique for a checkout session.
   - `payment_attempts`, one row per initial payment or retry.
   - `payment_events`, unique provider event ID with verification, processing, and Sheet projection status.

   `create-booking` requires `checkout_request_id` and returns the original booking on replay. `retry-payment` accepts `retry_request_id`, keeps the booking ID, and creates a new attempt only after failure or expiry. A reused key with different data is a conflict.

## Task 3: Make webhooks authoritative

3. Implement a provider-specific signed webhook adapter backed by shared reconciliation. Verify raw signatures, event IDs, booking ownership, provider references, currency, amount, and server-side gateway state. Deduplicate events, enforce monotonic payment transitions, and retry unfinished Sheet projections without applying payment twice. Invalid or unknown events never create Sheet rows.

   Make `handle-payment` redirect/status-only. Remove database and Sheet mutation from the browser callback. Remove `callback_orphan` behavior; missing current rows are repaired by canonical upsert, while multiple matches fail closed.

## Task 4: Consolidate checkout behavior

4. Make the full-page checkout canonical and the legacy booking modal a compatibility adapter. Share server pricing and GST calculations, remove the independent 2% tax path, filter unavailable/past departure dates before options/defaults, add stable client request IDs and submission locks, and make the status page trust only signed server status.

## Task 5: Simplify existing Sheet contracts

5. Replace confusing gateway-specific Sheet headers with stable contracts.

   `Bookings` uses current-state fields such as `Last Updated (IST)`, `Booking Ref`, `Booking ID`, `Trip Name`, `Trip ID`, `Departure Date`, guest/contact fields, traveller fields, `Coupon Code`, `Payment Plan`, `Subtotal`, `Discount`, `GST`, `Trip Total`, `Payable Now`, `Paid Amount`, `Balance Due`, `Payment Status`, `Settlement Status`, provider/attempt fields, `Last Payment Event`, and `Notes`.

   `Bookings_Success` and `Bookings_Failed` share event fields: `Event ID`, received/processed timestamps, booking and attempt identifiers, provider, event type/result, settlement status, trip/guest fields, provider references, received/expected amounts, reconciliation result, and notes.

   `Leads` uses current-contact fields: `Lead ID`, first/last seen timestamps, contact fields, latest source/page/trip/UTM fields, submission count, current status, latest submission ID, and notes. `Abandoned Leads` stores partial-fill events keyed by `Submission ID`.

   Current-state rows use zero/one/multiple-match upsert behavior. History rows append once per event/submission ID. Complete header validation replaces the current A1-only check. Managed tabs must already exist. Monetary values are numeric with INR formatting; dates remain sortable. Freeze headers, add filters, use readable widths, and wrap long summaries/notes.

## Task 6: Harden every lead entry path

6. Harden all lead paths. Require `submission_id`, normalize email, allow missing email only for explicit partial fills, reject conflicting lead IDs, preserve non-empty contact data, never downgrade terminal CRM statuses, preserve source routing, and eliminate `onClick` plus `onSubmit` double sends. Record the lead event in Supabase before Sheet projection so Sheet failures are retryable without duplicate contacts.

## Task 7: Repair existing rows safely

7. Add a read-only audit and dry-run repair workflow. Back up current tab values, merge duplicate current booking rows by `Booking ID`, merge current lead rows by normalized email, remove only exact duplicate history events, preserve legitimate failed-then-successful attempts, map PayU columns to provider-neutral fields, and require staging validation before any production cleanup or deployment.

## Tests and acceptance

Add Deno and frontend contract tests for duplicate checkout requests, changed idempotency payloads, network timeouts, legacy/full-page parity, date filtering, pricing/coupon/GST/rounding, webhook replay and reordering, signature/amount/currency failures, late attempts, paid-state protection, Sheet failure/retry, header drift, missing/multiple rows, lead duplicate submissions, normalized-email identity, partial fills, conflicting IDs, terminal status preservation, parallel submissions, and all staging full/partial payment journeys.

Acceptance requires one current `Bookings` row per booking, one current `Leads` row per normalized contact per existing routed destination, one history row per verified event, no retry-created duplicates, and no automatic creation of new Google Sheets tabs. Verify staging before production; keep production payment, deployment, and Sheet checks read-only until explicitly authorized.

## Defaults

- Webhooks are the payment authority; browser callbacks are redirect-only.
- Full-page checkout is canonical.
- Retries reuse the booking ID but create a new payment attempt.
- Normalized email is the lead identity key.
- Internal Supabase idempotency/event tables are allowed; no new Google Sheets tabs or workbooks are introduced.
