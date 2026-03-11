# Partial Payment (25%) Review

Date: 2026-03-10

## Scope
Review and implementation notes for enabling 25% partial payment in checkout, with staging-only validation and production safety constraints.

## Key Findings
1. Checkout already had `partial_25` UI/state hooks, but payable-now was computed from subtotal, not final payable total.
2. Repo edge functions were full-payment oriented (`PayU amount = total_amount`) and not settlement-aware.
3. Retry flow used `total_amount` unconditionally, which can overcharge in partial mode.
4. Status page already supports future settlement fields (`payment_mode`, `payable_now_amount`, `due_amount`, `settlement_status`) and can render partial outcomes correctly once backend writes these fields.
5. Production and staging Supabase projects are not schema-equivalent for `bookings`; staging must be the rollout environment.

## Implemented Changes (Code)
- Checkout override:
  - 25% deposit now computes from final total (`total`), not subtotal.
  - Payment mode inference made stricter (`partial`/`deposit`/`25%`) to reduce accidental toggles.
  - Legacy create-booking fallback recognizes both older and newer missing-field error signatures.
- `create-booking` function:
  - Supports JSON and form payloads.
  - Computes authoritative `payment_mode`, `payable_now_amount`, and `due_amount` on server.
  - Persists settlement fields (`paid_amount`, `due_amount`, `settlement_status`, `balance_due_note`).
  - Sends PayU amount using `payable_now_amount` (or full amount for full mode).
- `handle-payment` function:
  - Verifies callback hash against callback amount context.
  - Sets settlement status to `fully_paid` or `partially_paid` on success.
  - Persists `paid_amount`, `due_amount`, and `balance_due_note` for partial success.
- `retry-payment` function:
  - Uses PayU test/live key selection pattern consistent with other functions.
  - Retries only payable-now amount for partial bookings.
  - Blocks retry for already-paid bookings.

## Critical Dependencies
1. Staging database schema must include booking settlement columns used above.
2. Staging secrets must be set: `PAYU_*`, `PAYMENT_CALLBACK_URL`, `SITE_URL`/`PAYMENT_REDIRECT_BASE_URL` as needed.
3. Staging checkout/status code overrides must be published before end-to-end validation.
4. Production publish/migration must remain blocked until explicit sign-off.

## Edge Cases Covered
1. Full payment success.
2. Partial payment success.
3. Partial + coupon.
4. Partial + early-bird.
5. Invite-only trip blocked.
6. Invalid contact inputs blocked client-side.
7. Tampered client payable-now amount corrected server-side.
8. Hash mismatch callback marked failed.
9. Pending callback state and status-page poll handling.
10. Retry failed partial payment with deposit amount only.
11. Retry blocked after successful payment.
12. Rounding edge amounts.
13. Zero/negative amount rejected.
14. Schema parity gate before production rollout.

## Approval Prototype
Use:
- `framer-website/prototypes/partial-payment-approval-lab.html`

This prototype includes all scenarios above with expected request payload, gateway amount/hash basis, booking row mutation, and status-page output.
