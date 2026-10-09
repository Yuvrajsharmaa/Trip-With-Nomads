# Staging Booking, Checkout, Webhook, Email, Lead, and Sheets Runbook

Status: executed against staging on 2026-10-06 IST; keep this as the reproducible verification record.

## 2026-10-07 continuation

The existing-sheet contract and routing hardening were re-verified on staging before the production backend rollout. The current deployed function versions are recorded below; earlier version numbers in the original runbook are historical evidence, not the active versions.

| Environment | `create-booking` | `record-lead` | `get-booking-status` | `razorpay-webhook` |
| --- | ---: | ---: | ---: | ---: |
| Staging | 79 | 88 | 56 | 58 |
| Production | 120 | 71 | 29 | 28 |

### Latest controlled staging cases

- Full-payment failure through Razorpay Test Mode bank simulator: booking `da0b3c63-6cea-4fd4-9b8e-d9735b2a90c6`, ref `TWN-2026-0136`. The verified `payment.failed` event is `applied`, its Sheet projection is `synced`, and its payment email projection is `sent`. The current `Bookings` row and `Bookings_Failed` event row both show the human-readable trip name `Vietnam`, `24 Oct 2026`, numeric INR amounts, and readable IST timestamps.
- The first trip-name projection attempt exposed a missing Supabase client in the Sheet helper. It remained retryable with `sheet_sync_status = failed` and did not apply payment twice. The helper was corrected, redeployed, and the next controlled failure proved the repaired path above.
- Production smoke checks returned HTTP 200 for the home page, full-page checkout, and the live `get-trip-checkout-context` endpoint. No production payment was created.

### Routing correction

The 2026-10-07 observation below is historical: at that point checkout abandonment was only written to `TWN Bookings → Abandoned Bookings`. Current production code also projects the contact into `TWN Master Leads → Master Leads` for follow-up, while preserving any terminal CRM status.

Payment history now prefers the existing combined `Payment History` tab when available. It falls back to the existing `Bookings_Success` / `Bookings_Failed` tabs for older workbooks, and never creates tabs. `Bookings` remains the one current row per booking.

### 2026-10-09 integration and production read-back

- The connected Framer project has only its `main` branch. A fresh preview reports version `8abe561bd`, zero pending edits, and no publish errors or warnings.
- The refreshed dismissible checkout toast and the future `2026-10-24` Vietnam price (₹54,999 + ₹2,749.95 GST = ₹57,748.95) were verified on staging, then re-read on production after Framer version `8abe561bd` was promoted.
- PR #57 squash-merged the staged source tree to `main` under the repository's no-merge-commit policy; the superseded merge-snapshot branch remains preserved.
- The two additive Sheet-projection migrations were applied to production. Read-only SQL confirmed the lock table, event-row table, and lock RPCs. Nine relevant Edge Function bundles now have matching staging/production hashes and JWT settings.
- Staging and production `record-lead` reject an empty request with HTTP 400; both webhook endpoints reject an invalid signature with HTTP 401. These are safe smoke checks, not payment-success tests.
- Read-only seven-day Supabase aggregates report 93 production lead submissions and 52 staging submissions, all marked `synced` in their database projection state. This is database status evidence, not an independent read-back of every Google Sheet row.
- Read-back of the six existing production workbooks found zero duplicate normalized emails in current lead tabs. Recent identifiable abandoned leads were present in Master Leads. The Trip Page tab showed 9 October itinerary-download activity, and the latest NTC invite had a reason. Historical NTC reasons are mostly blank (14 of 85 rows populated); absent old answers cannot be reconstructed. Ten Master Leads rows have no captured date, and one pair shares a phone number but has different names, so it needs human review before merging.
- Local verification: 103 Framer/function contract tests, 8 migration-contract tests, and 12 managed-Sheets/worktree tests pass. This does not replace the remaining live retry/webhook/email cases below.
- No new payment or form submission was created for this read-back, and no Google Sheet rows were edited or deleted. Live full/partial/failure payment, inbox delivery, and retry/replay cases remain unsatisfied release evidence.

### 2026-10-09 integration and staging verification

- Restored the accessible, responsive checkout error toast in the Framer source and added a contract test; staging preview verification is recorded above.
- Added durable per-tab Sheet write locks and Supabase payment-event-to-Sheet-row reservations. This keeps retries idempotent without exposing technical event IDs in the visible workbook.
- Updated the payment-history route to inspect existing tab names before choosing a destination. The current workbook audit found an existing `Payment History` tab, so no new tab is required.
- Checkout-abandoned submissions now also appear in Master Leads as a follow-up activity; terminal CRM status is retained.
- Razorpay browser success and failure callbacks now pass through the public redirect adapter on staging; webhook verification remains authoritative for payment state.
- Local verification and staging deployments are recorded in the PR checks; none of these bullets is proof of a new production payment or an independent Sheet write.

All values recorded here must be staging-only. Never record API keys, service-account JSON, payment credentials, webhook secrets, or complete signed tokens.

## Environment map

| Item | Staging value/status |
| --- | --- |
| Supabase project | `ieuwiinbvbdvjrdqqzlb` |
| Framer staging host | `https://maroon-aside-814100.framer.app` |
| Checkout gateway | `https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev` |
| Active payment provider | Razorpay Test Mode |
| Razorpay mode | Test Mode only |
| Webhook function | `https://ieuwiinbvbdvjrdqqzlb.supabase.co/functions/v1/razorpay-webhook` |
| Status function | `https://ieuwiinbvbdvjrdqqzlb.supabase.co/functions/v1/get-booking-status` |
| Resend configuration | Staging sender/configuration verified without printing secrets |
| Google Sheet tabs | Existing tabs only; no workbook or tab was created |

## Preflight checklist

- [x] Branch is not `main` or `staging`; the deployment source was the recovery feature branch.
- [x] Local focused and full contract tests pass.
- [x] Staging migrations are applied and function versions are recorded: `create-booking` 72, `retry-payment` 62, `handle-payment` 80, `get-booking-status` 52, `razorpay-webhook` 49, `record-lead` 75.
- [x] Framer staging publish/version was verified before backend testing.
- [x] Razorpay Test Mode webhook URL and provider configuration were verified without exposing secrets.
- [x] An unsigned webhook request returned HTTP 401 `Invalid webhook signature` and created no payment event.
- [x] Resend sender/configuration and signed status URL behavior were verified without exposing secrets.
- [x] Existing Sheets and complete header rows were readable; no tab bootstrap is enabled.
- [x] Payment events and lead submission records were read back after each controlled case.
- [x] A valid future departure (`2026-10-24`) was used; the active loader filtered stale dates before checkout.
- [x] Unique staging-only test identities were used.

## Executed staging evidence

| Case | Booking / event evidence | Result |
| --- | --- | --- |
| Full payment failure | Booking `f8e10660-ebe4-464b-8e9e-6610739ed2cf`, ref `TWN-2026-0124`, order `order_Tkfo9oESYTodxe`, failed event `TkfqHKcq0drPNj` | Immediate failed status render; one current booking row; failed history projected. The dummy `@example.com` email was rejected by Resend Test Mode, which explains why that test address did not receive mail. |
| Full payment success | Booking `53a95fab-d61c-47c0-a956-cfef0069cc9c`, ref `TWN-2026-0126` | Paid / fully settled; `order.paid` and `payment.captured` were each recorded once; both Sheet history projections and one idempotent email delivery were verified. |
| 25% deposit success | Booking `3a0957d3-a950-49d5-8a10-c8b04d1ca7de`, ref `TWN-2026-0127` | Paid / partially settled; payable `₹14,437.24`, balance `₹43,311.71`; both provider events, Sheet projections, and email delivery were verified. |
| Lead route projection | Submissions `a1f1a111…`, `b2f2b222…`, `c3f3c333…`, `d4f4d444…`, `e5f5e555…` | Waitlist → general `Leads`; booking invite → `NTC - Invites`; trip page → general/TWN `Leads`; custom → `Custom Trip Leads`; partial fill → general `Abandoned Leads`. All five Supabase records report `sheet_sync_status = synced`. |
| Idempotency and identity conflicts | Waitlist replay `a1f1a111…`; changed-payload replay; conflicting `lead_id` `f6f6f666…` | Same payload returned `replayed: true`; changed payload returned HTTP 409 `IDEMPOTENCY_CONFLICT`; conflicting lead identity returns HTTP 409 `LEAD_ID_CONFLICT`. |

## Production rollout evidence

- PR #37 was squash-merged into `main` at `16e2321730c6150d3ecf7a3279cfe46346d9b080`; post-merge CI passed.
- Production Supabase migration `payment_email_delivery` applied successfully to add durable email delivery state.
- Production function versions active after rollout: `get-booking-status` 27, `record-lead` 67, `razorpay-webhook` 23. Existing `create-booking`, `retry-payment`, and redirect-only `handle-payment` deployments were already on the reviewed source hashes.
- Framer staging version `c3e9a07f1` previewed with zero changes and zero warnings, then was promoted to `https://tripwithnomads.com`.
- Read-only live checks passed for `/`, `/checkout?slug=vietnam-twn&date=2026-10-24`, and `/payment-success?booking_id=…`.
- The production status page returned an actionable HTTP 401 state without a signed token and stopped loading within the verification window; no live payment, webhook replay, or production Sheet row was generated during release verification.

## Evidence template

For each controlled case record only IDs and timestamps:

```text
Case:
Started (IST):
Booking ID:
Booking Ref:
Attempt ID/number:
Provider order/reference:
Provider payment/transaction ID:
Provider event ID:
Status response first render (ms):
Payment status:
Settlement status:
Expected amount / received amount / balance:
Bookings current row evidence:
Success/failed history row evidence:
Email delivery state/provider ID:
Lead/SHEET route evidence:
Replay/duplicate result:
Notes:
```

## Payment cases

### Full payment success

- [x] Submit the full-page checkout once with a fresh `checkout_request_id`.
- [x] Complete Razorpay Test Mode success through the mock bank success control.
- [x] Confirm the browser redirects only and the signed status response renders immediately.
- [x] Confirm one booking, one attempt, two distinct verified provider events, one current `Bookings` row, two success history rows, and one idempotent email delivery.
- [x] Replay behavior and duplicate provider-event projection were checked without creating a second booking or email.

### Payment failure and retry

- [x] Submit a separate checkout and select Razorpay Test Mode failure.
- [x] Confirm failed status page, current booking state, and failed history row. The failure email test used `@example.com` and was correctly rejected by Resend Test Mode; the error is retained for retry/diagnostics.
- [ ] Confirm pending attempts cannot be retried immediately; confirm failed/expired attempts can be retried.
- [ ] Retry with a fresh `retry_request_id` and verify a new attempt on the same booking.
- [ ] Complete retry success and confirm failed and successful history remain separate while current state is monotonic.

### 25% deposit

- [x] Submit partial payment.
- [x] Confirm payable-now, paid amount, balance due, GST, Payment Status, and Settlement Status in UI, database, Sheet, and email.
- [x] Confirm status response is immediate and does not require polling completion.

### Event and provider resilience

- [ ] Duplicate success event.
- [ ] Success followed by failure.
- [ ] Failure followed by success.
- [ ] Late success from older attempt.
- [ ] Two successful attempts for one booking.
- [ ] Invalid signature, unknown booking, unsupported event, amount mismatch, currency mismatch.
- [ ] Provider API outage.
- [ ] Sheet failure followed by event replay.
- [ ] Email failure followed by event replay.

For every case, verify database reconciliation occurs at most once and unfinished projections retry independently.

## Status-page cases

- [x] Paid status renders booking information immediately.
- [x] Failed status renders failure information immediately.
- [ ] Pending status is explicit and polling is bounded.
- [ ] Timeout, 401, malformed response, missing booking ID, and missing/invalid token leave loading and show retry/error copy.
- [ ] Refresh and back navigation cannot overwrite a newer booking state.
- [ ] URL `payment_status` tampering cannot change the server-rendered result.

## Lead and Sheet cases

- [x] Waitlist.
- [x] Booking invite / `NTC - Invites`.
- [x] Trip-page lead.
- [x] Configured custom-trip route, with its existing tab confirmed.
- [x] Partial/abandoned submission.
- [x] Duplicate click/submit and idempotency replay.
- [x] Missing-email partial fill.
- [x] Conflicting `lead_id`.
- [x] Master lead projection for normal contacts.
- [ ] Generic, Instagram/source-aware, unknown-source, terminal-status, and forced Sheet-failure cases remain local contract coverage or require a separately authorized staging fixture.

For every case, read back Supabase event/identity rows and the exact existing Sheet destination. Confirm no new tab/workbook and no duplicate current row.

## Exit criteria

- [x] All controlled staging payment, status, email, lead, and Sheet cases have evidence.
- [x] `payment_events`, Sheets, and email delivery state agree for every verified success event.
- [x] No duplicate current rows or duplicate history/event/email projections were created by the controlled cases.
- [x] Local and staging verification evidence is recorded in this branch without secrets.
- [x] Production rollout was performed only after staging verification, PR merge, additive schema readiness, and live read-only route checks; no live payment or production Sheet write was used for verification.
