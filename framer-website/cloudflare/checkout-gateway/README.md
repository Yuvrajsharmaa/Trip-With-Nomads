# Checkout Gateway (Cloudflare Worker)

Browser-facing checkout API boundary for Trip With Nomads:

- `GET /api/checkout/context`
- `GET /api/checkout/display-price`
- `POST /api/checkout/validate-coupon`
- `POST /api/checkout/create-booking`
- `POST /api/checkout/booking-status`
- `POST /api/checkout/retry-payment`

## Why

This keeps Supabase service credentials server-side and prevents direct mutable Supabase calls from browser production bundles.

## Required secrets

Set via Wrangler:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Optional vars

- `CHECKOUT_ALLOWED_ORIGINS`
- `CHECKOUT_MAX_BODY_BYTES`
- `CHECKOUT_RATE_LIMIT_WINDOW_SEC`
- `CHECKOUT_RATE_LIMIT_WRITE_LIMIT`

## Deploy

```bash
cd framer-website/cloudflare/checkout-gateway
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Then map the Worker route to `tripwithnomads.com/api/checkout/*`.
