# Framer Setup: 25% Partial Payment (Staging-Safe)

Updated from Framer MCP snapshot on 2026-03-10.

## 1) Safety first (no production impact)

These local code changes do **not** affect live production until you explicitly publish.

- Production URL: `https://tripwithnomads.com`
- Staging URL: `https://maroon-aside-814100.framer.app`
- Checkout page node: `yGf8924jv`
- Success page node: `OJHearLQ8`
- Failed page node: `eEbVMn5Su`
- Checkout override file in Framer: `CheckoutPageOverrides.tsx` (`codeFileId=perCTUm`)
- Status override file in Framer: `Bookingstatusoverride.tsx` (`codeFileId=jvQtnDE`)

Use Framer staging publish only until QA sign-off.

## 2) Checkout wiring (existing layers)

Apply these overrides on `/checkout` (Desktop node `IifsGjoMf`):

- `Desktop (IifsGjoMf)` -> `withCheckoutBootstrap`
- `BackButton (p09RsWYB4)` -> `withCheckoutBackButton`
- `CheckoutForTripName (HCaCc7CuL)` -> `withCheckoutSelectionText`

Traveller block:
- `1Traveller (RIKo1MlsR)` -> `withTravellerCount`
- `TravellersList (WjD7_HKc0)` -> `withTravellerList`
- `Traveller1 (uPzhipQg2)` -> `withTravellerLabel`
- `Name (P7w7b7Mox)` -> `withTravellerName`
- `SelectSharing (Hng1kBcvo)` -> `withTravellerSharing`
- `VehicleSelection (p24PvWueC)` -> `withTravellerVehicleSelect`
- `Remove (HDtX2vXXj)` -> `withRemoveTraveller`
- `AddGuests (u0xi0wz0K)` -> `withAddTraveller`

Contact block:
- `YourName (rdY26TQGv)` -> `withCheckoutContactName`
- `YourNumber (tXiyIpTW6)` -> `withCheckoutContactPhone`
- `YourEmail (BCMYphPzY)` -> `withCheckoutContactEmail`

Coupon + summary:
- `Coupon input layer` -> `withCouponCodeInput` (use a real input/text-field component; not plain text)
- `Apply (Y6S2DZyTe)` -> `withApplyCouponButton`
- `RemoveCoupon (waAQMi35i)` -> `withRemoveCouponButton`
- `CouponHelper (MCXVQYkq4)` -> `withCouponMessage`
- `Subtotal label (OIddj9zNt)` -> `withCheckoutSubtotalLabel`
- `Subtotal value (c950Mc3YR)` -> `withCheckoutSubtotal`
- `Discount label (AhLYfjKKn)` -> `withCheckoutDiscountLabel`
- `Discount value (DDmMH9pzW)` -> `withCheckoutDiscount`
- `Coupon row container (VGUrdZtl2)` -> `withCheckoutHideWhenNoCoupon`
- `Coupon value (A6GHNM9vV)` -> `withCheckoutCouponCode`
- `Tax label (kOoLR6SkA)` -> `withCheckoutTaxLabel`
- `Tax value (d9P24c8Uf)` -> `withCheckoutTaxValue`
- `Total value (ouagpjxN9)` -> `withCheckoutTotal`
- `MainButton (k31IFGWef)` -> `withCheckoutPayButton`

## 3) New UI elements to add on checkout

Current checkout structure has no explicit payment-mode UI rows. Add these under `PaymentDetails (n6u764CZ8)`, above the final pay button.

Add a `PaymentModeSection` stack with:
- `PaymentOptionTitle` text: "Payment option"
- `PayFullOption` button/chip text: "Pay Full"
- `Pay25Option` button/chip text: "Pay 25% now"
- `PayableNowLabel` text: "Payable now"
- `PayableNowValue` text
- `DueNowLabel` text: "Remaining due"
- `DueNowValue` text
- `PaymentModeHint` text

Wire these new elements:
- `PayFullOption` -> `withCheckoutPaymentMode`
- `Pay25Option` -> `withCheckoutPaymentMode`
- `PayableNowValue` -> `withCheckoutPayableNow`
- `DueNowValue` -> `withCheckoutDueAmount`
- `PaymentModeHint` -> `withCheckoutPaymentModeHint`

Important:
- Keep the layer text containing either `full` or `25%/deposit/partial`, because `withCheckoutPaymentMode` infers mode from text/props.
- If you want explicit binding, set a prop like `paymentModeValue="full"` and `paymentModeValue="partial_25"` on those two option layers.
- MCP snapshot shows `ApplyDiscountCode (l0pJDwBMl)` as text. Keep this as a label and add a dedicated text-field layer for coupon entry.

## 4) Payment success/failed page wiring

Apply `withBookingStatus` on the outer Desktop frame of both pages:
- Success page Desktop `pgJCemeQZ`
- Failed page Desktop `Xoh17F6np`

Header/status:
- Success `BookingConfirmed (Q3qcU4SAs)` + Failed `PaymentFailed (NzeTmUGtv)` -> `withHeadingText`
- Success `YourAdventure... (Xr9eh7y83)` + Failed `YourPaymentDidnT... (yg6gJ3izG)` -> `withSubheadingText`
- Success `TagBrand (L63WWS3bl)` + Failed `TagBrand (cM4bU10Gf)` -> `withStatusBadge`

Booking details values:
- Success `Twn20260847 (G1TMSxIwY)` + Failed `Twn20260847 (YVgZUhJYa)` -> `withBookingId`
- Success `trip_name (Outdz7Ns9)` + Failed `trip_name (j1yEWi7ql)` -> `withTripName`
- Success `date (zDeieCiqT)` + Failed `date (zhkAzR_h6)` -> `withDepartureDate`
- Success `vehicle (O50F7V3SQ)` + Failed `vehicle (GFykq88Im)` -> `withTransportOption`

Travellers card:
- Success `1Travellers (N_UlA4_T_)` + Failed `1Travellers (K7kHX6lnN)` -> `withTravellerCount`
- Success list container `QcfdAlKS9` + Failed list container `wDrWidbkN` -> `withTravellerList`

Payment summary card:
- Success badge `Paid (cNy5GTO1I)` + Failed badge `Failed (tPuyKBr60)` -> `withPaymentBadge`
- Base price amount: `QNbmKTavH` / `db_daIlHm` -> `withBasePrice`
- Discount amount: `fYTpBziD1` / `g9n3ucTwG` -> `withDiscountAmount`
- Coupon value: `dspp9sc9_` / `EEy790Emq` -> `withCouponCode`
- Subtotal amount: `HXPYEj7x6` / `V8Nn6_lHK` -> `withSubtotal`
- Tax amount: `TVo9DbVQ6` / `KFD8rq3Pk` -> `withTaxAmount`
- Total amount: `bdpMLO5J7` / `TE9SktbJJ` -> `withTotalPaid`
- Discount row containers `M8JSUJJ2d` / `jvhAyvoij` -> `withHideWhenNoDiscount`
- Coupon row containers `JclI0yHxB` / `K_iYGME4x` -> `withHideWhenNoCoupon`

Retry:
- Failed page `MainButton (orF4InM3K)` -> `withRetryButton`

## 5) New UI elements to add on success/failed for partial payments

Current status pages do not have dedicated "balance due" rows.

Add these rows to both success and failed `Payment summary` cards:
- `PayableNowLabel` + `PayableNowValue`
- `DueAmountLabel` + `DueAmountValue`
- `BalanceDueNote` text (small caption below rows)

Wire them:
- `PayableNowValue` -> `withPayableNowAmount`
- `DueAmountValue` -> `withDueAmount`
- `BalanceDueNote` -> `withBalanceDueNote`
- Row wrapper(s) + note wrapper -> `withHideWhenNoBalance`

This keeps full-payment bookings visually unchanged while showing due balance only for partial-payment bookings.

## 6) Staging QA checklist (must pass before production)

- Full payment, 1 traveller
- Partial 25%, 1 traveller
- Partial 25%, multiple travellers with mixed sharing + vehicle
- Coupon + partial payment
- Coupon removed after apply
- Invite-only trip (blocked)
- Invalid contact inputs (validation)
- PayU success callback
- PayU failed callback
- Pending callback then resolved
- Retry flow (failed booking)
- Retry blocked for already-paid booking
