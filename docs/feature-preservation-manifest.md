# Feature Preservation Manifest

Status: the prior recovery release was deployed; the 2026-10-09 staging/main reconciliation remains an integration candidate and is not yet merged to `main` or fully promoted to production.

Baseline: `origin/main` / `aa1ea63a5372de804b7b1ac37faf74a3803a1b50`

Staging source snapshot: `origin/staging` / `a4e3e42bf10445d5a404c4a229a79129281785fc`

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
| Legacy booking modal | Retired `BookingOverrides.tsx` | Dirty checkout modifications | keep retired; full-page checkout is the only buying flow | No live Framer component references the modal; full-page checkout contract tests pass |
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
| Booking invite / NTC | `record-lead` routes `booking_invite` to `NTC - Invites` or `Abandoned Leads`; the workbook is named `NTC Invites` | prior lead routing work | preserve and restore the visible reason field | Exact existing tab, normalized row, invite reason, partial event behavior |
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
| `Bookings` | One current row by hidden `Booking Key`; visible row is the human-readable current booking register | Keep current provider-neutral contract; never restore blind append or `callback_orphan` |
| `Payment History` (when present) | Append once per verified provider event | Keep distinct success/failure/retry events; old `Bookings_Success` / `Bookings_Failed` remain supported only where those are the existing tabs |
| `Leads` | One current normalized contact per existing routed destination | Upsert by normalized email; preserve non-empty fields |
| `Abandoned Leads` | Event row keyed by `submission_id` | Append once per partial submission |
| `NTC - Invites` | Existing invite-specific route with visible `Why They Want To Travel` reason | Preserve tab, workbook name `NTC Invites`, and existing reason values |
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

- [x] The reconciliation branch preserves both protected branch histories; its source tree includes the staging integration snapshot and no files are deleted.
- [x] Local contract suites pass: 103 Framer/function tests, 8 migration-contract tests, and 12 managed-Sheets/worktree tests.
- [x] Live staging checkout displays the refreshed accessible toast and a valid future trip price; production still displays the older toast design.
- [x] The prior dirty checkout remains available and untouched; its recovery snapshot is recorded separately.
- [ ] Complete remaining staging retry, webhook-ordering, Sheet-replay, and email-retry scenarios against the current deployment.
- [ ] Apply the two staging-verified Sheet-projection migrations to production; production currently lacks both tables and their lock RPCs.
- [ ] Deploy and verify production Edge Functions against the aligned schema, then run the production read-only checks.
- [ ] Promote the refreshed Framer version to production and verify the toast visually on the production route.
- [ ] Complete the reviewed PR-to-`main` release and final production sign-off.
- [x] No new Google Sheets workbook or tab was created by this reconciliation.
