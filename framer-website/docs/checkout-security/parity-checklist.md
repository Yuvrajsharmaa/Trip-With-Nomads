# Checkout Gateway Parity Checklist

## Scope

This checklist freezes the current browser checkout behavior before switching production traffic to the first-party gateway.

## Route map (old path -> new path)

| Feature | Current browser path | Gateway path |
|---|---|---|
| Checkout context (trip + pricing bootstrap) | `rest/v1/trips` + `rest/v1/trip_pricing` | `GET /api/checkout/context` |
| Display price | `GET /functions/v1/get-trip-display-price` | `GET /api/checkout/display-price` |
| Coupon validation | `POST /functions/v1/validate-coupon` | `POST /api/checkout/validate-coupon` |
| Create booking | `POST /functions/v1/create-booking` | `POST /api/checkout/create-booking` |
| Booking status | `POST /functions/v1/get-booking-status` | `POST /api/checkout/booking-status` |
| Retry payment | `POST /functions/v1/retry-payment` | `POST /api/checkout/retry-payment` |

## Contract expectations to keep unchanged

1. **Display price**
- Preserve existing payload fields from `get-trip-display-price` unchanged (gateway is pure proxy).
- Same query support: `slug`, `trip_id`, `v`.

2. **Coupon validation**
- Keep `valid` boolean contract.
- Keep existing pricing and message fields consumed in `CheckoutPageOverrides.tsx`.
- Keep non-2xx behavior and JSON error payload shape.

3. **Create booking**
- Keep successful payload containing `payu.action` and all required PayU fields.
- Keep legacy error behavior for missing fields and malformed payloads.
- Keep urlencoded fallback compatibility (`Content-Type: application/x-www-form-urlencoded`).

4. **Booking status**
- Keep success payload shape with `booking` object.
- Keep token validation behavior (`status_token`) unchanged.

5. **Retry payment**
- Keep successful payload containing `payu.action` and form fields.
- Keep failure responses compatible with current retry UI fallback handling.

6. **Context route**
- New route contract:
  - `trip: { id, slug, title }`
  - `pricing: []`
  - `invite_only: boolean`
  - `engine_version: "checkout-gateway-v1"`

## Phased parity checks

- [ ] **Phase A (shadow):** gateway deployed, compare read payloads (`context`, `display-price`) on same trip/slug.
- [ ] **Phase B (read switch):** production reads use gateway and UI renders identical values.
- [ ] **Phase C (write switch):** writes (`validate-coupon`, `create-booking`, `booking-status`, `retry-payment`) use gateway with identical outcomes.
- [ ] **Rollback tested:** runtime flag routes production back to direct Supabase path.

## Quick smoke checklist after switch

- [ ] Checkout date list still excludes past dates.
- [ ] Apply valid coupon.
- [ ] Apply invalid coupon and confirm same error wording path.
- [ ] Create booking (full payment) redirects to PayU.
- [ ] Create booking (partial payment) redirects to PayU.
- [ ] Status page with valid `booking_id + status_token` resolves booking.
- [ ] Retry payment from failed page returns to PayU.
