# Staging Booking, Checkout, Webhook, Email, Lead, and Sheets Runbook

Status: prepared; execute after the recovery branch is deployed to staging.

All values recorded here must be staging-only. Never record API keys, service-account JSON, payment credentials, webhook secrets, or complete signed tokens.

## Environment map

| Item | Staging value/status |
| --- | --- |
| Supabase project | `ieuwiinbvbdvjrdqqzlb` |
| Framer staging host | `https://maroon-aside-814100.framer.app` |
| Checkout gateway | `https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev` |
| Active payment provider | Confirm from deployed configuration before payment |
| Razorpay mode | Test Mode only |
| Webhook function | `https://ieuwiinbvbdvjrdqqzlb.supabase.co/functions/v1/razorpay-webhook` |
| Status function | `https://ieuwiinbvbdvjrdqqzlb.supabase.co/functions/v1/get-booking-status` |
| Resend configuration | Confirm key, verified sender, reply-to, and site URL without printing secrets |
| Google Sheet tabs | Read metadata first; existing tabs only |

## Preflight checklist

- [ ] Branch is not `main` or `staging`; `git status` is clean before deployment.
- [ ] Local tests and contract tests pass.
- [ ] Staging migrations are applied and function versions are recorded.
- [ ] Framer staging publish/version is recorded.
- [ ] Razorpay Test Mode webhook URL, secret, and subscribed events are confirmed.
- [ ] An unsigned webhook request returns an authentication error and creates no database or Sheet row.
- [ ] Resend sender/domain and `SITE_URL`/status URLs are confirmed.
- [ ] Existing Sheets and complete header rows are readable; no tab bootstrap is enabled.
- [ ] `payment_events` is queried before the test and the baseline count is recorded.
- [ ] A valid future trip/date and a mixed past/today/future date fixture are available.
- [ ] Unique staging-only test identities are prepared.

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

- [ ] Submit the full-page checkout once with a fresh `checkout_request_id`.
- [ ] Complete Razorpay Test Mode success.
- [ ] Confirm the browser redirects only and the signed status response renders immediately.
- [ ] Confirm one booking, one attempt, one verified event, one current `Bookings` row, one success history row, and one email delivery.
- [ ] Repeat the same request ID, refresh, use browser back, and replay the event. Confirm no duplicate booking, attempt, row, or email.

### Payment failure and retry

- [ ] Submit a separate checkout and select Razorpay Test Mode failure.
- [ ] Confirm failed status page, current booking state, failed history row, and failure email.
- [ ] Confirm pending attempts cannot be retried immediately; confirm failed/expired attempts can be retried.
- [ ] Retry with a fresh `retry_request_id` and verify a new attempt on the same booking.
- [ ] Complete retry success and confirm failed and successful history remain separate while current state is monotonic.

### 25% deposit

- [ ] Submit partial payment.
- [ ] Confirm payable-now, paid amount, balance due, GST, Payment Status, and Settlement Status in UI, database, Sheet, and email.
- [ ] Confirm status response is immediate and does not require polling completion.

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

- [ ] Paid status renders booking information immediately.
- [ ] Failed status renders failure information immediately.
- [ ] Pending status is explicit and polling is bounded.
- [ ] Timeout, 401, malformed response, missing booking ID, and missing/invalid token leave loading and show retry/error copy.
- [ ] Refresh and back navigation cannot overwrite a newer booking state.
- [ ] URL `payment_status` tampering cannot change the server-rendered result.

## Lead and Sheet cases

- [ ] Waitlist.
- [ ] Booking invite / `NTC - Invites`.
- [ ] Trip-page lead.
- [ ] Configured custom-trip route, only if its existing tab is confirmed.
- [ ] Generic lead.
- [ ] Instagram/source-aware lead.
- [ ] Partial/abandoned submission.
- [ ] Duplicate click/submit and parallel submissions.
- [ ] Email case and whitespace normalization.
- [ ] Missing-email partial fill.
- [ ] Conflicting `lead_id`.
- [ ] Unknown source.
- [ ] Terminal CRM status preservation.
- [ ] Sheet failure followed by retry.

For every case, read back Supabase event/identity rows and the exact existing Sheet destination. Confirm no new tab/workbook and no duplicate current row.

## Exit criteria

- [ ] All payment, status, email, lead, and Sheet cases have evidence.
- [ ] `payment_events`, Sheets, and email delivery state agree for every verified event.
- [ ] No duplicate current rows or duplicate history/event/email projections.
- [ ] Local and staging verification logs are attached to the PR without secrets.
- [ ] Production remains read-only until explicit production approval.
