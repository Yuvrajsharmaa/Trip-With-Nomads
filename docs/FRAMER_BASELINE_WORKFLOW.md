# Framer Production Baseline Workflow

## Goal
Keep Framer production stable and reversible even when code overrides change frequently.

## Source of truth
- GitHub `main` is the only production baseline.
- Framer code panel is a deployment target, not source of truth.

## Before every Framer push
1. Ensure working tree is clean.
2. Pull latest `main`.
3. Create branch from `staging` for any new change.
4. Push to Framer only from reviewed code files in repo.

## Create a baseline checkpoint
1. Merge approved PR to `main`.
2. Tag release: `baseline/prod-YYYYMMDD-HHMM`.
3. Push tag to origin.
4. Record the exact Framer code file IDs used (for example: `jvQtnDE`).

## Safe rollback flow
If production breaks in Framer:
1. Checkout the last baseline tag.
2. Run the push script for affected file(s).
3. Verify remote/local content match.
4. Re-test critical flows (checkout, success/failure, popup lead capture).

## Rules
- Never hot-edit Framer code without matching repo commit.
- Never start new feature directly on `main`.
- Always keep one-file push scripts for critical overrides.
- Always test in staging first.

## Current critical production override files
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/CheckoutPageOverrides.tsx`
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/TripPriceOverrides.tsx`
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/BookingStatusOverride.tsx`
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/EmailPopupOverride.tsx`

## Part-payment status
- Part-payment is planned but not active in backend yet.
- Status override supports future fields (`payment_mode`, `payable_now_amount`, `due_amount`, `settlement_status`) but backend functions do not currently execute partial-payment logic.
