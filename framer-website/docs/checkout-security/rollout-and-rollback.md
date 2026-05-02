# Checkout Gateway Rollout and Rollback

## Runtime flags

These flags are read by Framer overrides at runtime:

- `window.__TWN_CHECKOUT_FORCE_GATEWAY__ = true`
  - Forces `/api/checkout/*` even outside production.
- `window.__TWN_CHECKOUT_FORCE_DIRECT_SUPABASE__ = true`
  - Emergency rollback to direct Supabase calls.
  - Use only as a temporary incident fallback.

## Normal production behavior

By default, production hosts (`tripwithnomads.com`, `www.tripwithnomads.com`) use gateway-first mode:

- `/api/checkout/context`
- `/api/checkout/display-price`
- `/api/checkout/validate-coupon`
- `/api/checkout/create-booking`
- `/api/checkout/booking-status`
- `/api/checkout/retry-payment`

Development hosts continue to allow direct Supabase for local validation.

## Rollout sequence

1. Deploy worker `framer-website/cloudflare/checkout-gateway`.
2. Attach route: `tripwithnomads.com/api/checkout/*`.
3. Run parity checks from `parity-checklist.md`.
4. Publish Framer overrides with gateway code.
5. Monitor booking conversion, 4xx/5xx rates, and latency.

## Rollback sequence

1. Set `window.__TWN_CHECKOUT_FORCE_DIRECT_SUPABASE__ = true` in runtime override bootstrap.
2. Republish Framer overrides.
3. Confirm checkout and status recover on direct path.
4. Keep worker live for analysis while incident resolves.
5. Remove rollback flag after root cause is fixed.
