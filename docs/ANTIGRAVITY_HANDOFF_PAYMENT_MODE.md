# Antigravity Handoff: Checkout Payment Mode Radio + Due Amount

## Context
- Project: Trip With Nomads (Framer + Supabase checkout flow)
- Target: staging only (`https://maroon-aside-814100.framer.app`)
- Checkout page: `/checkout` nodeId `yGf8924jv`
- Date: 2026-03-11

## Goal
Make payment mode switching work correctly on checkout:
- `Pay in full` and `Partial payment` are mutually exclusive (only one selected visually and functionally).
- Summary total shows payable-now amount.
- Due row appears only in partial mode.

## What is already done

### 1) Code fix applied locally and pushed to Framer code file
- Local file: `framer-website/framer/CheckoutPageOverrides.tsx`
- Framer code file id: `perCTUm` (`CheckoutPageOverrides.tsx`)
- Push status: completed (remote content matched local during verification).

### 2) Key behavior updates in `withCheckoutPaymentMode`
- Better mode inference from nested child text (`Pay in full`, `Partial payment`).
- Click-target fallback inference from event text.
- Active/inactive visual styling enforced.
- Important fix: removed forced `value={store.paymentMode}` on radio-like components.
- Now uses `checked={isSelected}` + boolean-aware change handling.

### 3) Checkout totals optimization
- `withCheckoutTotal` now shows `payableNow` (not full total).
- Added `withCheckoutHideWhenNoDue`.
- `withCheckoutDueAmount` retained.

## Known issue pattern found
If checkout layers are assigned to `Bookingstatusoverride.tsx` (`jvQtnDE`) instead of `CheckoutPageOverrides.tsx` (`perCTUm`):
- Override dropdowns appear wrong/empty for checkout layers.
- Behavior breaks or appears inconsistent.

This happened at least once on checkout summary layers.

## Exact wiring to keep/fix (checkout payment section)

Use **File = `CheckoutPageOverrides.tsx`** for all mappings below.

### Payment mode
1. `AmD9R4L_7` (`Label` for Pay in full) -> `withCheckoutPaymentMode`
2. `TMd4uXU5b` (`Label` for Partial payment) -> `withCheckoutPaymentMode`
3. `jLiHDamZc` (`PaymentModeHelper`) -> `withCheckoutPaymentModeHint`

### Summary rows
4. `ouagpjxN9` (`Pricing` value under Total Price) -> `withCheckoutTotal`
5. `aMC4Tohog` (`Due` value) -> `withCheckoutDueAmount`
6. `DzZ7XZoIR` (Due row container) -> `withCheckoutHideWhenNoDue`

### Must NOT have payment-mode override
- `yECje2Nq_` (`RadioGroup`) -> no `withCheckoutPaymentMode`
- `SktE2Du7V` (`PayInFull` text) -> no `withCheckoutPaymentMode`
- `a_EMwf1kk` (`PartialPayment` text) -> no `withCheckoutPaymentMode`
- Any common parent container -> no `withCheckoutPaymentMode`

## Quick audit checklist Antigravity should run
1. In Framer, inspect both payment option layers and confirm:
   - Same override file: `CheckoutPageOverrides.tsx`
   - Same override: `withCheckoutPaymentMode`
2. Check no duplicate payment-mode override higher/lower in tree.
3. Confirm due row container/value use `withCheckoutHideWhenNoDue` + `withCheckoutDueAmount`.
4. Publish to staging only.
5. Hard refresh browser (`Cmd/Ctrl + Shift + R`).
6. Validate:
   - Clicking each option toggles helper text.
   - Only one option looks selected at a time.
   - Total value changes to payable-now in partial mode.
   - Due row hidden in full mode, visible in partial mode.

## If still broken after correct wiring
Most likely cause is double-binding (override applied on both label and parent group).
Fallback: move `withCheckoutPaymentMode` to only one clickable node per option (the `Label` nodes above), remove everywhere else.

## Related files for reference
- Local checkout overrides: `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/CheckoutPageOverrides.tsx`
- Review/wiring doc: `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/FRAMER_PARTIAL_PAYMENT_SETUP.md`
