# Booking Flow Feature Recovery, Staging E2E, and Status Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover every validated booking, checkout, lead, payment-email, and Sheet feature from the preserved dirty checkout without weakening the current hardening, then prove the complete flow in staging with Razorpay Test Mode before any production promotion.

**Architecture:** `origin/main` is the protected baseline. The old dirty checkout is an immutable recovery source, never a checkout to reset or copy wholesale. Supabase remains the source of truth for bookings, attempts, events, and leads. Razorpay webhooks are authoritative; browser callbacks only redirect. Framer provides the checkout/status UI and compatibility adapters. Google Sheets and Resend are idempotent projections with durable retry state.

**Tech Stack:** Supabase Postgres and Deno Edge Functions, Razorpay Test Mode, Framer code overrides, Google Sheets API, Resend, TypeScript, Deno tests, browser-based staging verification, GitHub feature branch and pull request.

**Spec:** The behavior contract remains [the booking/checkout/Sheets hardening plan](docs/superpowers/plans/2026-10-05-booking-checkout-sheets-hardening.md). This plan adds preservation, recovery, payment-email reliability, bounded status loading, and end-to-end staging proof around that contract.

## Global Constraints

- Do not reset, clean, overwrite, or delete `/Users/yuvrajsharma/Downloads/Trip-With-Nomads`. It is a recovery source containing uncommitted work and must remain available until the recovery audit is accepted.
- Create an external, timestamped snapshot of that checkout before importing anything: tracked diff, untracked-file archive, branch/ref inventory, and commit bundle. Keep secrets, `.wrangler`, `.next`, and other runtime artifacts out of the repository and out of the plan artifacts.
- Work only in a new `codex/` feature branch/worktree based on the current `origin/main`. Never use `git checkout` from the dirty checkout to replace the current tree.
- Do not push directly to `main` or `staging`. Use small PRs, review each PR, and squash-merge only after the verification gates pass.
- Verify staging before production. Production checks remain read-only unless the user separately authorizes a production deployment, live payment, webhook registration, or Sheet write.
- Do not create Google Sheet workbooks or tabs. Existing managed destinations must already exist; missing tabs and header drift are errors, not reasons to bootstrap new tabs.
- Preserve the active payment gateway and environment separation. Do not resurrect the historical Razorpay path, PayU path, or fixture-only configuration as the active provider without verifying the configured staging gateway.
- Database reconciliation happens before Sheet or email projection. A projection failure must be retryable without applying the payment or lead twice.
- Preserve the existing `NTC - Invites` route, full-payment and 25% deposit behavior, coupons, GST-inclusive pricing, past-date filtering, PayU compatibility where currently supported, legacy modal compatibility, Instagram/source tracking, abandonment capture, and signed status tokens.
- Do not log API keys, service-account JSON, payment secrets, customer credentials, or complete signed status tokens. Use masked configuration and unique test identities.
- No feature is considered removed until the preservation manifest records its source, current status, replacement, and test evidence.

## Review Focus

1. The dirty checkout contains a mixture of useful historical commits, uncommitted edits, generated files, and older behavior that conflicts with current idempotency/webhook hardening. Review every import as a selective recovery, never as a branch replacement.
2. The staging ledger currently has no new `payment_events` for the latest controlled fixture. The first staging gate must prove that the registered Test Mode webhook reaches the deployed function before interpreting a browser result as a payment result.
3. Payment email delivery must be independently observable. A successful booking or Sheet sync cannot silently hide a missing Resend key, provider rejection, Sheet-retry path, or duplicate-event path.
4. A status page must render a verified paid/failed response immediately, show an explicit pending/error state when appropriate, and never remain in an unbounded loading state because a request or token is stuck.
5. Every lead source and every booking result must be traced from Framer wrapper to Edge Function, database identity, Sheet route, normalized row, and retry behavior.

## 1. Freeze the Recovery Source and Build the Feature Manifest

**Files/artifacts:**

- New `docs/feature-preservation-manifest.md`
- New `docs/staging-booking-checkout-e2e-runbook.md`
- External recovery snapshot outside the repository, with its path recorded locally but no secrets committed

**Steps:**

- [ ] Record the current `origin/main` SHA, current branch, worktree status, all relevant refs, and the exact dirty checkout path before touching any source.
- [ ] Create an external snapshot containing the dirty checkout's tracked patch, untracked-file archive, `git ls-tree` output, branch/ref inventory, and a `git bundle` for reachable commits. Confirm the snapshot is readable before proceeding.
- [ ] Inventory the historical recovery commits (`fad1251`, `9b92379`, `f7bc650`, `32f0bc7`, `709630a`, `48f0427`, `6afce69`, `07dec23`, `bf91967`) and every uncommitted candidate file. Mark each as `keep`, `recover selectively`, `already present`, `superseded by hardening`, `generated/runtime`, or `needs product decision`.
- [ ] Compare the inventory with the current main exports and deployed Framer component IDs. Include booking modal, full checkout, payment return/status pages, waitlist, trip-page lead, booking invite, custom-trip lead, abandonment, NTC invite routing, pricing/date behavior, Sheets, webhook, retry, and payment-email behavior.
- [ ] For every candidate feature, record its original source, current main equivalent, expected user-visible behavior, compatibility risk, and planned test. A missing test is a recovery blocker, not permission to copy the old implementation.
- [ ] Explicitly record that the dirty checkout remains untouched. The recovery branch must be reproducible from `origin/main` plus individually selected patches or hand-written ports.

**Verification:** Review the manifest against the current source tree and the prior conversation requirements before importing code. The manifest must contain no unexplained deletion and must distinguish source history from currently deployed behavior.

**Commit:** `docs: add feature preservation and recovery manifest`

## 2. Establish the Isolated Recovery Branch and Safety Gates

**Files:**

- New recovery worktree/branch created outside the current main worktree
- Existing `.github/workflows/*` only if a narrowly scoped guard is needed; do not restore unrelated workflow changes from the dirty checkout

**Steps:**

- [ ] Create a new feature branch from the current `origin/main`, with a name such as `codex/feature-recovery-and-staging-e2e`.
- [ ] Add a pre-import checklist that fails if the source path is the dirty checkout, if a patch deletes current hardening migrations/functions, or if generated/runtime directories are being staged.
- [ ] Import one logical behavior at a time. Prefer a small hand-written port or a specific commit patch over a broad merge. Keep current `key_id`, request IDs, signed status token, webhook verification, payment attempts, lead idempotency, and Sheet fail-closed behavior as invariants.
- [ ] After every import, run `git diff --check`, the relevant Deno tests, and a file-level diff review against the preservation manifest.
- [ ] Require a clean worktree before each PR. Never run a cleanup command against the original dirty checkout while recovery is in progress.

**Verification:** The branch starts at the known main SHA, contains only intentional files, and has no generated Supabase `.temp`, `.wrangler`, `.tmp`, `.next`, or credentials.

**Commit:** `chore: create isolated feature recovery lane`

## 3. Recover and Harden Payment Email Delivery

**Files:**

- New migration `framer-website/supabase/migrations/<timestamp>_payment_email_delivery.sql`
- `framer-website/supabase/functions/_shared/resend.ts`
- `framer-website/supabase/functions/_shared/payment_email.ts`
- `framer-website/supabase/functions/razorpay-webhook/index.ts`
- Existing webhook/payment tests plus new `framer-website/supabase/functions/_shared/payment_email_delivery_test.ts`
- Optional small shared helper if it keeps the webhook readable; do not create a second payment authority

**Contract:** Extend `payment_events` with durable email projection state, for example `email_sync_status` (`pending`, `sent`, `failed`, `not_required`), `email_attempts`, `email_provider_id`, `email_sent_at`, and `email_error`. Keep the existing unique provider-event idempotency key. The exact migration names and check constraints must be reviewed against the current schema before applying.

**Steps:**

- [ ] Confirm the staging Resend key, verified sender/from address, reply-to address, and site/payment URLs without printing values. If any required configuration is absent, report the precise missing configuration and keep the payment path functional while marking email delivery retryable.
- [ ] Preserve the branded payment email copy/assets and all fields recovered from the old branch, including booking reference, trip/date, payment plan, payment result, amount, balance, status link, and the existing success/failure distinction. Remove fixture-only IDs, hard-coded customers, and old gateway assumptions.
- [ ] Change the Resend helper to return a typed result containing `sent`, `skipped` or `not_required`, provider message ID when available, and a safe error classification. Treat missing configuration and non-2xx provider responses as durable failures rather than silently successful sends.
- [ ] Make the webhook execute the sequence: verify raw signature and provider event ID; reserve/claim event; reconcile database state; project Sheets; project email; persist each projection result. Booking state must never roll back because email failed.
- [ ] On a duplicate webhook, retry whichever projection is incomplete. A duplicate with `sheet_sync_status=failed` must retry Sheets; a duplicate with Sheets complete but `email_sync_status=failed` or `pending` must retry email. A sent email must never be sent again for the same event/recipient.
- [ ] Ensure a missing or invalid recipient is `not_required` only when the booking has no deliverable email; it must not hide a malformed configured address or a Resend failure.
- [ ] Return a retryable response for transient email failure after durable state is written, or provide an authenticated internal replay path if provider retries are not reliable. Document the selected recovery mechanism and its security boundary.
- [ ] Preserve the behavior that success/failure notifications are triggered by verified payment state transitions, not by browser callbacks, URL parameters, or Sheet writes.

**Tests:**

- [ ] New payment event sends exactly one email and records provider ID/status.
- [ ] Missing Resend key, Resend 4xx, Resend 5xx, timeout, malformed recipient, and valid no-email booking each produce the documented durable status.
- [ ] Sheet failure followed by duplicate webhook retries email only after Sheet projection is repaired; no second booking/payment application occurs.
- [ ] Email failure followed by duplicate webhook retries email; a successful retry does not duplicate the message.
- [ ] Duplicate success, success followed by failure, failure followed by success, late older-attempt success, and two successful attempts preserve monotonic booking state and distinct event history.
- [ ] Full payment and 25% deposit email content has correct payment status, settlement status, amount received, expected amount, and balance.

**Verification:** Apply the migration to staging first, run the focused tests, then verify a real staging Test Mode event creates a `payment_events` row with visible email status. Do not claim “email fixed” from a mocked fetch alone.

**Commit:** `fix: make payment email projection durable and retryable`

## 4. Fix Payment Success/Failure Status Pages That Stay Loading

**Files:**

- `framer-website/framer/BookingStatusOverride.tsx`
- New `framer-website/framer/booking_status_loading_contract_test.ts` or the repository's established equivalent
- `framer-website/supabase/functions/get-booking-status/index.ts` only if query/response changes are proven necessary

**Steps:**

- [ ] Move runtime/environment resolution to request time or an equivalent safe boundary so a Framer preview/staging host cannot retain a stale module-level environment choice. Recognize the real staging Framer host and preview hosts without routing the production custom domain to staging.
- [ ] Add an explicit bounded request helper using `AbortController`, a short timeout, `Cache-Control: no-store`, and structured error classification. A missing/invalid `status_token`, timeout, non-2xx response, or malformed response must leave the loading state and show an actionable error/retry state.
- [ ] Set the page ready immediately after the first verified paid or failed response. Poll only while the verified status is pending; never delay the first ready render until polling completes.
- [ ] Preserve signed-token validation and never trust `payment_status` or equivalent status claims from the URL or browser callback. Preserve partial-payment labels and the distinction between Payment Status and Settlement Status.
- [ ] Cancel timers and in-flight requests on unmount/navigation so a prior checkout cannot overwrite a newer status page. Preserve the existing success/failed redirect destinations and payment-failure metadata handling.
- [ ] Add a visible pending state, error state, retry action, and safe fallback when `booking_id` or `status_token` is absent. Keep the existing visual design and feature behavior unless the change directly prevents indefinite loading.

**Tests:**

- [ ] Paid response renders booking information immediately.
- [ ] Failed response renders failure information immediately.
- [ ] Pending response renders pending state and polls with bounded attempts.
- [ ] Timeout, 401, malformed JSON, gateway outage, and missing token render an error/retry state rather than an endless loader.
- [ ] Preview/staging host, production host, localhost, and redirect URL selection resolve to the correct environment.
- [ ] URL status tampering cannot change the rendered payment result.

**Verification:** Publish to the Framer staging route only, open real staging success and failure URLs with valid signed tokens, measure time to first status response in the browser network panel, and verify refresh/back-navigation behavior. Do not publish production until staging passes the complete matrix.

**Commit:** `fix: bound payment status loading and render verified results immediately`

## 5. Recover Checkout and Legacy Compatibility Features Without Regressing Hardening

**Files:**

- `framer-website/framer/CheckoutPageOverrides.tsx`
- `framer-website/framer/BookingOverrides.tsx`
- `framer-website/framer/BookingStatusOverride.tsx`
- `framer-website/framer/EmailPopupOverride.tsx`
- Existing checkout/pricing/date/return-contract tests

**Recovery mapping:** Review the old behavior from `48f0427` (dynamic pending status), `6afce69` (partial/payment reconciliation behavior), `bf91967` (Razorpay failure metadata), and the payment-email commits. Port only behavior that is absent from current main and compatible with the current webhook/idempotency contract.

**Steps:**

- [ ] Confirm the full-page checkout remains canonical and the legacy booking modal is an adapter that sends the same request contract, including stable `checkout_request_id` and the complete traveller/contact/pricing payload.
- [ ] Preserve Razorpay `key_id`, order/reference fields, signed status token handling, partial 25% payments, full payments, coupons, GST-inclusive total math, balance due, payment/settlement labels, and PayU compatibility where the active environment still exposes it.
- [ ] Preserve filtering of past/today/unavailable departure dates before option/default construction; test mixed past and future CMS/pricing rows through the active loader, not only a fixture helper.
- [ ] Preserve submit locking and stable request IDs through double-click, refresh, browser back, timeout, retry, and repeated legacy/full-page submission paths.
- [ ] Preserve every Framer lead wrapper and its existing source metadata: waitlist, trip-page, booking invite, custom-trip, generic form, abandonment, Instagram ID, and NTC invite behavior. Fix duplicate handler wiring without removing any route.
- [ ] Compare all exported overrides and live component IDs against the manifest. Any missing export or changed prop contract is a release blocker.

**Tests:** Add or retain tests for missing pricing rows, invalid traveller combinations, coupon/GST/rounding, full and partial payment, unavailable dates, legacy/full-page single-booking behavior, PayU fallback, failure metadata, and every lead wrapper.

**Verification:** Run the complete local suite and browser smoke tests against staging. Confirm no current hardening file is deleted or replaced by the old checkout branch.

**Commit:** `fix: restore checkout compatibility without regressing payment hardening`

## 6. Recover Lead Routing, Identity Normalization, and Duplicate-Submission Protection

**Files:**

- `framer-website/supabase/functions/record-lead/index.ts`
- `framer-website/supabase/functions/_shared/lead_routing.ts` if the explicit matrix is not already represented safely
- `framer-website/supabase/functions/_shared/lead_routing_test.ts`
- `framer-website/framer/EmailPopupOverride.tsx`
- Existing lead schema/migration and function tests

**Route contract:** Use the configured existing Sheet IDs and tab names discovered from staging metadata. Preserve `NTC - Invites`; preserve the existing general/trip/custom destinations when present; use `Abandoned Leads` only for explicitly partial/abandoned submissions. Unknown sources are recorded as `unknown_source:<value>` rather than silently reclassified. A candidate route such as `Custom Trip Leads` must not be activated until the existing tab is confirmed.

**Steps:**

- [ ] Require a UUID `submission_id` for every lead event. Allow missing email only for explicitly marked `partial_fill`/abandoned submissions with a submission ID.
- [ ] Normalize email with trim/lowercase and use normalized email as the current-contact identity key. Reject a supplied `lead_id` that belongs to another normalized email.
- [ ] Upsert Supabase lead identity and event first, preserving non-empty existing fields, first/last seen times, submission count, latest source/page/trip/UTM values, and terminal CRM status.
- [ ] Ensure one Framer submission handler and one client-side submission guard prevent `onClick` plus `onSubmit` double sends while preserving submit accessibility and abandonment capture.
- [ ] Project current lead state with zero/one/multiple match behavior and record each submission event once. Sheet failure must be retryable without creating a second current lead row or losing the event.
- [ ] Test parallel submissions with the same normalized email, email case/whitespace differences, conflicting lead IDs, missing-email partial fills, terminal status preservation, every source route, and unknown-source recording.

**Verification:** Use unique staging-only emails and inspect both Supabase rows and exact Sheet destinations after each route. Confirm the same normalized contact does not create duplicate current rows.

**Commit:** `fix: restore lead routing and idempotent submission handling`

## 7. Harden Existing Booking and Lead Sheet Projections and Audit Reports

**Files:**

- `framer-website/supabase/functions/_shared/booking_sheets.ts`
- `framer-website/supabase/functions/_shared/booking_callback_sheets.ts`
- `framer-website/supabase/functions/_shared/lead_sheets.ts`
- `framer-website/supabase/functions/_shared/sheets.ts`
- Existing `framer-website/scripts/*` Sheet audit utilities, extended only when needed
- New focused projection/contract tests beside the shared modules

**Steps:**

- [ ] Validate the complete header row and exact existing tab names before writing. Missing tabs, header drift, malformed numeric/date cells, and unknown gateway columns produce a report and fail closed.
- [ ] Keep `Bookings` as one current row per booking. Match by `Booking ID`; zero matches append once, one match updates, multiple matches fail closed and enter the repair report. Never restore blind tab creation or `callback_orphan` append behavior.
- [ ] Keep `Bookings_Success` and `Bookings_Failed` append-only by verified provider event ID. Duplicate webhook delivery, Sheet retry, and legitimate failed-then-success attempts must remain distinguishable.
- [ ] Keep `Leads` as one current row per normalized email in each existing routed destination and `Abandoned Leads` as an event table keyed by submission ID. Preserve NTC routing.
- [ ] Map PayU/Razorpay legacy columns into provider-neutral headers while retaining unmapped legacy information in Notes. Store monetary values as numeric cells and timestamps/dates in sortable formats.
- [ ] Preserve or apply readable widths, frozen headers, filters, wrapped traveller summaries/notes, and INR formatting only through explicit existing-tab formatting operations. Never create a new tab as a side effect.
- [ ] Add dry-run reports for duplicate booking IDs, duplicate normalized lead emails, orphan rows, missing headers, multiple matches, and gateway-specific legacy columns. Back up tab values before any cleanup.

**Tests:** Cover zero/one/multiple current-row matches, duplicate history events, header drift, missing tabs, PayU legacy mapping, numeric/date output, Sheet write retry, and preservation of legitimate failed/successful attempt history.

**Verification:** Read staging Sheet metadata and narrow ranges before and after controlled tests. Verify exact row counts and normalized values. No production cleanup or Sheet write is part of this plan.

**Commit:** `fix: make existing Sheet projections fail-closed and retryable`

## 8. Prepare and Validate the Staging Payment Environment Before Browser Tests

**Files/artifacts:**

- `docs/staging-booking-checkout-e2e-runbook.md`
- Existing safe staging diagnostics/scripts, with no secrets written to disk

**Steps:**

- [ ] Confirm the staging Supabase project, Framer host, checkout gateway, active gateway name, Test Mode flag, payment redirect base, configured Razorpay Test key ID, webhook function URL, and webhook event subscriptions.
- [ ] Confirm the webhook secret used by Razorpay Test Mode matches the staging function configuration without displaying it. Verify the endpoint returns the expected signature error for unsigned input and does not mutate data.
- [ ] Confirm Resend configuration, sender verification, and `SITE_URL`/status URL settings. Send only through the controlled staging payment event during the E2E test, not by improvising a production recipient.
- [ ] Confirm all existing Sheet IDs and managed tabs are readable and that the required complete headers are present. If a tab/header is missing, stop before writing and report the repair requirement.
- [ ] Select a staging trip with valid future pricing for both full and 25% payment. Also record a mixed past/today/future date fixture for UI filtering without changing production CMS data.
- [ ] Use unique staging-only names/emails/phone numbers and record their IDs in the runbook, never in source control.

**Verification:** A staging payment event must be observable in `payment_events` after a controlled test. If the ledger remains empty, stop and diagnose webhook registration/delivery before testing browser success/failure claims.

## 9. Run the Complete Staging Razorpay E2E Matrix

**Artifacts:** Update the staging runbook with timestamps, booking IDs, attempt IDs, provider IDs, event IDs, response timings, Sheet row evidence, and email delivery evidence. Do not record secrets or full payment credentials.

**Full payment success:**

- [ ] Submit canonical full-page checkout once with a unique `checkout_request_id`.
- [ ] Complete Razorpay Test Mode success in the browser.
- [ ] Verify the browser only redirects; the signed status page reads the server result immediately and shows Payment Status `Paid` plus Settlement Status.
- [ ] Verify one booking, one payment attempt, one verified success event, one current `Bookings` row, one `Bookings_Success` history row, correct amount/currency/provider references, and one Resend delivery record.
- [ ] Refresh, back-navigate, repeat the same idempotency request, and replay/duplicate the webhook. Confirm no second booking, attempt, history row, Sheet row, or email.

**Payment failure and retry:**

- [ ] Submit a separate canonical checkout and select Razorpay Test Mode failure.
- [ ] Verify a failed attempt, failed status page, one `Bookings_Failed` event row, current booking state, and failure email.
- [ ] Verify retry is blocked while the attempt is pending and allowed after the failure/expiry rule. Confirm the same booking gets a new attempt and `retry_request_id`, not a new booking.
- [ ] Complete the retry successfully and verify the failed and successful event histories remain distinct while the current booking becomes paid/settled according to the contract.

**25% deposit success:**

- [ ] Submit partial payment and verify payable-now, paid amount, balance due, GST, Payment Status, and Settlement Status in the UI, database, Sheets, and email.
- [ ] Confirm the status page renders the partial result without waiting for the polling loop to finish.

**Out-of-order/provider resilience:**

- [ ] Verify duplicate delivery, success-after-failure, failure-after-success, late older-attempt success, two successful attempts, amount mismatch, currency mismatch, unknown booking, invalid signature, unsupported event, and provider API outage behavior using safe signed staging fixtures or provider replay facilities.
- [ ] Verify a late failure never downgrades an already paid booking. Verify an older valid success is recorded/reconciled but cannot create a second booking or overwrite the newer paid attempt.
- [ ] Force a Sheet projection failure in staging, replay the event, and verify Sheet recovery without duplicate payment application. Separately force email failure, replay, and verify exactly one eventual email.

**Legacy/compatibility flows:**

- [ ] Submit the legacy booking modal and confirm it creates the same contract and one booking as the full-page flow.
- [ ] Exercise active PayU fallback only if staging configuration explicitly enables it; otherwise verify the fallback branch remains present and is not selected for Razorpay staging.

## 10. Run the Complete Staging Lead and Sheet Normalization Matrix

- [ ] Exercise waitlist, booking invite, trip-page lead, custom-trip lead if configured, generic form, Instagram/source-aware form, and partial/abandoned submission wrappers.
- [ ] Verify each submission has a stable ID, one Supabase event, one current normalized contact row where applicable, and the expected existing Sheet destination.
- [ ] Submit duplicate click/submit events and parallel submissions; verify one current row, one event per unique submission ID, preserved non-empty fields, incremented submission count, and no terminal-status downgrade.
- [ ] Submit email case/whitespace variants and confirm identity convergence. Submit a missing-email partial fill and confirm it is accepted only with explicit partial status and submission ID.
- [ ] Submit a conflicting `lead_id` and verify a safe rejection with no Sheet write. Submit an unknown source and verify explicit source recording.
- [ ] Read back exact headers, row values, dates, numeric values, route/tab names, and notes from each staging destination. Confirm no new Sheet tabs/workbooks were created.
- [ ] Repeat a Sheet-failure/retry scenario for current leads, abandoned leads, current bookings, success history, and failed history.

## 11. Local, Staging, and Production Verification Gates

**Local gate:**

- [ ] Run all existing Deno tests plus the new payment-email, status-loading, lead-routing, Sheet-contract, pricing/date, payment-authority, and return-contract tests.
- [ ] Run type checks/lint/build checks supported by the repository. Run `git diff --check`. Confirm no forbidden generated/runtime files are staged.
- [ ] Compare exported Framer override names and critical markers with the preservation manifest.

**Staging gate:**

- [ ] Apply migrations and deploy functions sequentially to staging only.
- [ ] Publish Framer changes to staging only.
- [ ] Complete the Razorpay full, failed/retry, and 25% journeys plus every lead route and Sheet readback above.
- [ ] Verify status first-response timing, webhook ledger rows, email delivery state, and no duplicate rows after refresh/replay.

**Production gate:**

- [ ] Perform read-only source/deployment/config/status checks and confirm the production bundle still contains current hardening markers.
- [ ] Do not make production migrations, function deploys, Framer publishes, live payments, webhook registration changes, or Sheet writes until the user gives explicit production authorization after reviewing staging evidence.

## 12. PR, Merge, and Anti-Regression Closeout

- [ ] Open separate small PRs where practical: recovery manifest/safety, email delivery, status loading, checkout compatibility, lead routing, and Sheet projections. Link the staging runbook and preservation manifest in each relevant PR.
- [ ] Review every PR for accidental feature deletion, gateway/environment drift, callback mutation, unbounded loading, duplicate handler registration, Sheet tab creation, secret exposure, and lost NTC/partial/PayU/lead behavior.
- [ ] Require clean worktree status, passing CI, passing staging evidence, and explicit acceptance of the preservation manifest before squash merge.
- [ ] After merge, re-read the merged file list against the manifest and compare the old dirty checkout snapshot to the recovered behavior. The dirty checkout may then be archived only after the user approves archival; do not delete it automatically.
- [ ] Update the final release note with exactly what was recovered, what was fixed, what was tested, which staging booking/event/email/Sheet evidence passed, and which production actions remain intentionally unperformed.

## Acceptance Criteria

- One current `Bookings` row exists per booking; retries and duplicate callbacks never create a second booking.
- Full payment, failed payment, retry, and 25% deposit flows work through Razorpay Test Mode in staging, with monotonic state transitions and distinct attempt/event history.
- Payment success/failure pages show verified information immediately or show a bounded, actionable error/pending state; they never remain indefinitely loading.
- Each verified payment event has independently observable Sheet and email projection status. Sheet or Resend failures are retryable and do not reapply payment state.
- Every existing lead route preserves its source and destination, normalizes identity by email where available, supports explicit partial fills, and is idempotent by submission ID.
- Existing Sheets are updated by upsert/append contracts with complete header validation, no automatic new tabs, no duplicate current rows, and no collapsed legitimate payment history.
- The feature-preservation manifest accounts for every behavior found in the dirty checkout and prior conversations. No feature is removed silently.
- Local tests, staging browser tests, webhook replay tests, email delivery checks, and Sheet readbacks pass before any production promotion.
