# Feature Preservation Manifest

Status: recovery in progress

Baseline: `origin/main` / `59f8cab2d29b039d2bc59b8965bb45c6ea3b7b35`

Recovery source: `/Users/yuvrajsharma/Downloads/Trip-With-Nomads` on `codex/resend-payment-notifications`, intentionally left untouched.

External snapshot: `/Users/yuvrajsharma/.codex/recovery-snapshots/20261006-feature-recovery`

This manifest is the release gate for recovery. A behavior may be changed only when this file records its current implementation, the selected replacement, and passing evidence.

## Preservation rules

- The current main hardening remains the source of truth for payment authority, idempotency, signed status tokens, lead identity, and fail-closed Sheet behavior.
- Historical code is a behavior reference, not a drop-in replacement. It may contain stale gateway assumptions, callback mutation, tab creation, fixture data, or generated files.
- The dirty checkout is never reset, cleaned, or used as the destination for recovery work.
- Features marked `present` still require regression tests after recovery work changes adjacent files.
- Features marked `recover selectively` require a focused test before they can be called restored.

## Checkout and payment behavior

| Behavior | Current main | Recovery source/reference | Action | Required evidence |
| --- | --- | --- | --- | --- |
| Full-page checkout | `CheckoutPageOverrides.tsx`; canonical flow with `checkout_request_id`, server pricing, Razorpay `key_id`, signed status redirect | Historical checkout edits and `6afce69` | present; regression-test | Full-payment Test Mode success and duplicate-submit test |
| Legacy booking modal | `BookingOverrides.tsx` | Dirty checkout modifications | recover selectively as an adapter only | Modal and full-page produce one booking with the same contract |
| Full payment | `create-booking`, `razorpay-webhook`, checkout UI | `6afce69`, `709630a` | present; verify email and Sheet projections | Paid event, current row, success row, email, replay |
| 25% deposit | `payment_mode=partial_25`, amount/reconciliation helpers, status UI | `6afce69` | present; verify all projections | Payable-now, paid amount, balance, Payment Status, Settlement Status |
| GST-inclusive totals | shared pricing and checkout totals | `6afce69` pricing changes | present; regression-test | Coupons, rounding, GST, full/partial amount assertions |
| Departure date filtering | `checkout_date_rules.ts` and active checkout loader | prior checkout audit | present; test active loader | Mixed past/today/future and unavailable dates |
| Razorpay client configuration | `key_id` contract in checkout/create/retry | screenshot exposed old `key` mismatch | present; protect | Browser creates Test Mode order without “Could not start payment” |
| PayU compatibility | checkout/status fallback markers where configured | old callback/payment helpers | preserve only when environment enables it | Fallback branch remains present; not selected for Razorpay staging |
| Stable retries | `retry-payment`, `retry_request_id`, payment attempts | `6afce69` retry behavior | present; regression-test | Failed attempt can retry; pending attempt cannot |
| Failure metadata | current status/return handling | `bf91967` / `razorpay_callback.ts` | recover selectively if absent | Razorpay failure details survive redirect and status rendering |
| Browser callback authority | `handle-payment` redirect-only | old callback code | preserve current hardening | Callback never mutates booking, payment history, Sheets, or email |
| Status pages | `BookingStatusOverride.tsx`; signed server status response | `48f0427` dynamic pending status | fix bounded loading | Paid/failed response renders immediately; timeout/error is actionable |

## Payment email behavior

| Behavior | Current main | Recovery source/reference | Action | Required evidence |
| --- | --- | --- | --- | --- |
| Branded success/failure content | `_shared/payment_email.ts` and preview assets | `32f0bc7`, `9b92379`, `f7bc650`, `fad1251` | recover missing copy/assets selectively | Preview and staging email contain booking, trip/date, amount, result, balance, and status link |
| Resend transport | `_shared/resend.ts` | `709630a` | harden result reporting | Missing key/provider 4xx/5xx become durable delivery failures |
| Webhook-triggered notification | `razorpay-webhook/index.ts` | `709630a` and current webhook | fix projection lifecycle | Verified event triggers one email; callback never does |
| Email retry after Sheet retry | currently not durable | current webhook retry branch | implement | Duplicate event retries incomplete email after Sheet recovery |
| Email idempotency | Resend request has event-derived idempotency | old email helper | preserve and persist | Duplicate webhook never sends a second email |
| Email observability | no durable email columns today | none | add migration | `payment_events` records pending/sent/failed/not-required, provider ID, attempts, timestamp, safe error |

## Lead and form behavior

| Behavior | Current main | Recovery source/reference | Action | Required evidence |
| --- | --- | --- | --- | --- |
| Waitlist form | `EmailPopupOverride.tsx` waitlist tracking | dirty wrapper edits | preserve and test | One submission event/current contact and expected Sheet route |
| Booking invite / NTC | `record-lead` routes `booking_invite` to `NTC - Invites` or `Abandoned Leads` | prior lead routing work | preserve | Exact existing tab, normalized row, partial event behavior |
| Trip-page lead | `trip_page_lead` to trips Sheet `Leads` or `Abandoned Leads` | prior lead routing work | preserve | Exact trips destination and values |
| General lead | waitlist/general source to general Sheet `Leads` or `Abandoned Leads` | prior lead routing work | preserve | Exact general destination and values |
| Custom-trip lead | verify configured destination before enabling | dirty `lead_routing.ts` candidate | do not guess; recover only if existing tab is confirmed | Metadata and route test |
| Abandonment | `withLeadAbandonTrackingGeneric` and partial-fill contract | dirty wrapper edits | preserve and de-duplicate | One `submission_id` event and no accidental current-row downgrade |
| Instagram/source metadata | current wrapper and lead schema | prior lead work | preserve | Instagram ID, source, page, trip, and UTM fields retained |
| Submission idempotency | `submission_id`, `lead_submissions`, `lead_identities` | current hardening | preserve | Repeat same payload returns same result; changed payload conflicts |
| Email identity | normalized email match with conflicting ID rejection | current hardening | preserve | Case/whitespace convergence; conflicting `lead_id` rejected |
| Terminal status | current `isTerminalStatus` guard | current hardening | preserve | New forms do not downgrade converted/booked/paid/lost statuses |
| Client duplicate guard | wrapper submit paths | dirty wrapper modifications | inspect and fix | `onClick` plus `onSubmit` sends once while accessibility remains intact |

## Sheet behavior

| Destination | Contract to preserve | Recovery decision |
| --- | --- | --- |
| `Bookings` | One current row by `Booking ID`; update one, append zero, fail closed on multiple | Keep current provider-neutral contract; never restore blind append or `callback_orphan` |
| `Bookings_Success` | Append once per verified provider event | Preserve failed-then-success history as separate events |
| `Bookings_Failed` | Append once per verified provider event | Preserve retry/failure history as separate events |
| `Leads` | One current normalized contact per existing routed destination | Upsert by normalized email; preserve non-empty fields |
| `Abandoned Leads` | Event row keyed by `submission_id` | Append once per partial submission |
| `NTC - Invites` | Existing invite-specific columns and route | Preserve tab and existing human-readable contract |
| Candidate custom tabs | Must be discovered in existing metadata | Never create automatically or route by guess |

## Historical commits and disposition

| Commit | Historical behavior | Disposition |
| --- | --- | --- |
| `fad1251` | Payment email field/copy correction | Recover only missing field behavior after current webhook review |
| `9b92379` | Booking confirmation email copy | Recover copy/content tests, not old gateway assumptions |
| `f7bc650` | Simplified email status treatment | Compare with current payment/settlement distinction |
| `32f0bc7` | Branded payment email implementation | Preserve validated copy/assets and tests selectively |
| `709630a` | Resend transport and payment update email | Reimplement through durable webhook projection |
| `48f0427` | Dynamic pending payment status | Preserve dynamic pending wording and add bounded loading |
| `6afce69` | Partial payment, reconciliation, checkout/status, Sheet behavior | Use only as a behavior reference; current hardening wins conflicts |
| `07dec23` | Race-safe tab creation | Do not restore tab creation; preserve only any compatible race handling |
| `bf91967` | Razorpay failure callback parsing | Port parser behavior only if current status flow lacks it |

## Release sign-off

- [ ] Every manifest row has a source review and test evidence.
- [ ] No current hardening migration/function was replaced by historical code.
- [ ] Full, failed/retry, and 25% staging payment journeys pass.
- [ ] Status pages render verified results without indefinite loading.
- [ ] Resend delivery is visible and retryable per payment event.
- [ ] Every lead route and existing Sheet destination passes normalization/idempotency checks.
- [ ] No new Google Sheet tab/workbook was created.
- [ ] The dirty checkout remains available and unchanged.
