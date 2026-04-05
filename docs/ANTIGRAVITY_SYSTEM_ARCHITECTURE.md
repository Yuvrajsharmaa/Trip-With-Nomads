# Antigravity System Architecture Handoff

## Document metadata
- Project: Trip With Nomads
- Date: 2026-04-06 (Asia/Kolkata)
- Audience: Antigravity engineering, product, and operations
- Objective: single system-level reference for the live Framer + Supabase platform

## 1) System scope
This system powers:
- public trip discovery pages
- public checkout and booking
- payment initiation and callback processing
- booking status retrieval
- public lead capture and CRM synchronization workflows

Out of scope for this document:
- internal non-Supabase services not present in this repository
- design-only Framer layer styling details

## 2) Environment topology
### Frontend runtime
- Public domain: `tripwithnomads.com` (production)
- Staging domain pattern: `maroon-aside-814100.framer.app` and `maroon-aside-814100-*.framer.app`

### Supabase projects
- Production project ref: `jxozzvwvprmnhvafmpsa`
- Staging/dev project ref: `ieuwiinbvbdvjrdqqzlb`

### Runtime routing behavior
Primary routing logic exists in:
- `framer-website/framer/TripPriceOverrides.tsx`
- `framer-website/framer/CheckoutPageOverrides.tsx`

Behavior:
- production hostnames route to production Supabase
- staging hostnames route to staging/dev Supabase
- localhost also routes to staging/dev Supabase

## 3) Architecture layers

### A) Experience layer (Framer site + overrides)
Key override files:
- `framer-website/framer/TripPriceOverrides.tsx`
- `framer-website/framer/CheckoutPageOverrides.tsx`
- `framer-website/framer/BookingStatusOverride.tsx`
- `framer-website/framer/EmailPopupOverride.tsx`

Responsibilities:
- read route context (`slug`, `trip_id`, date, transport)
- maintain checkout local state (travellers, selection, payment mode, coupon state)
- call Supabase Edge Functions
- apply resilient UI fallbacks (`₹0` for unavailable price)

### B) API layer (Supabase Edge Functions)
Core public-booking functions:
- `get-trip-display-price`
- `get-trip-checkout-context`
- `validate-coupon`
- `create-booking`
- `handle-payment`
- `retry-payment`
- `get-booking-status`
- `record-lead`

CRM-oriented functions:
- `crm-chat-bootstrap`
- `crm-chat-send-message`
- `crm-convert-lead`
- `crm-invite-user`
- `crm-run-sla-reminders`
- `crm-sync-public-leads`
- `crm-upsert-dashboard-layout`

Shared logic:
- `framer-website/supabase/functions/_shared/*`
- pricing utilities, sheets utilities, booking-status token utilities

### C) Data layer (Supabase Postgres)
Primary tables used by public flows:
- `trips`
- `trip_pricing`
- `bookings`
- coupon-related tables used via `validate-coupon` shared logic

Additional external persistence:
- Google Sheets append/sync for selected workflows (conditional by env flags)

### D) External integrations
- PayU: payment initialization and callback verification
- Google Sheets: lead and booking lifecycle logging

## 4) Critical runtime flows

### Flow 1: Trip page price rendering
Entry point:
- `withTripPrimaryPrice` in `framer-website/framer/TripPriceOverrides.tsx`

Path:
1. extract `trip_id` and/or `slug` from props and URL
2. call `GET /functions/v1/get-trip-display-price`
3. edge function resolves trip + pricing rows
4. computes display summary (base, payable, save, discount flag)
5. frontend renders INR value or `₹0` when unavailable

Reliability behavior:
- if Supabase API/PostgREST query fails in function, function attempts direct DB query via `SUPABASE_DB_URL`

### Flow 2: Checkout bootstrap and context load
Entry point:
- `withCheckoutBootstrap` in `framer-website/framer/CheckoutPageOverrides.tsx`

Path:
1. parse checkout route context (`slug`, `trip_id`, optional date/transport)
2. call `GET /functions/v1/get-trip-checkout-context`
3. receive trip metadata + pricing rows
4. hydrate store for trip name, selectable dates/sharing/transport
5. date labels shown in human format (ordinal style, e.g. `21st of May, 2026`)

Fallback behavior:
- bootstrap first prefers function response; legacy direct REST reads remain as fallback code paths

### Flow 3: Coupon validation
Entry point:
- checkout override calls `POST /functions/v1/validate-coupon`

Path:
1. send `trip_id`, `departure_date`, travellers, transport, email, coupon code
2. function computes base subtotal from `trip_pricing`
3. function validates coupon against subtotal and constraints
4. returns final applied discount source and full pricing quote breakdown

### Flow 4: Booking creation and payment initiation
Entry point:
- checkout override calls `POST /functions/v1/create-booking`

Path:
1. validate payload and normalize traveller/payment data
2. compute/validate payable amounts and coupon consistency
3. create booking row in `bookings`
4. generate payment payload/redirect to PayU
5. optionally write lifecycle data to sheets

### Flow 5: Payment callback and settlement update
Entry point:
- PayU callback to `POST /functions/v1/handle-payment` (form-data callback)

Path:
1. verify callback key/hash authenticity
2. load booking, update payment and settlement fields
3. apply due/paid amounts for full vs partial behavior
4. optional sheets update
5. issue/refresh booking status token support

### Flow 6: Booking status retrieval
Entry point:
- `GET` or `POST /functions/v1/get-booking-status`

Path:
1. verify signed status token
2. load booking + trip title
3. return normalized booking status payload to client

## 5) Resilience architecture

### Production outage mode addressed
Observed production issue:
- PostgREST/API read failures (`PGRST002`, 503) could break direct `/rest/v1` lookups

Mitigation introduced:
- `get-trip-display-price` and `get-trip-checkout-context` include direct DB fallback when API path fails
- frontend price fallback is explicit (`₹0`) instead of stale/manual text

Operational effect:
- trip page and checkout bootstrap can remain functional even during partial Supabase API degradation

## 6) Security and secrets model

### What is intentionally public
- Supabase `anon` keys in frontend overrides are public client credentials by design

### What is server-only
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- PayU salts/secrets
- booking status token secret(s)
- Google Sheets credentials

These are only read inside Supabase Edge Functions via env vars.

### Security boundary notes
- Browser calls functions with anon key; functions execute privileged reads/writes using service role
- Booking status endpoint requires signed status token verification
- Payment callback verifies provider hash/key before mutating booking records

### Current hardening gap to track
- `get-trip-checkout-context` currently returns `trip_pricing` via `select("*")`
- endpoint is open CORS GET (`Access-Control-Allow-Origin: *`)
- recommendation: return only required columns and consider rate limiting

## 7) Deployment architecture

### Frontend overrides deployment
1. Edit local override files in repo
2. Push code files to Framer project (MCP or push script)
3. Publish in Framer UI

Important:
- code file update is not equivalent to site publish
- production behavior changes only after Framer publish step

### Edge function deployment
1. update function source in `framer-website/supabase/functions/*`
2. deploy to staging project first
3. validate responses and checkout/trip flows
4. deploy to production project

## 8) Observability and debugging

### Frontend checks
- browser network for:
  - `/functions/v1/get-trip-display-price`
  - `/functions/v1/get-trip-checkout-context`
  - `/functions/v1/validate-coupon`
  - `/functions/v1/create-booking`

### Function logs
- inspect Supabase function logs for:
  - trip lookup API error -> direct DB fallback
  - pricing lookup API error -> direct DB fallback
  - payment callback hash/key mismatch

### Console noise classification
- Framer editor/canvas-sandbox hydration warnings can appear in editor context and are not always publish blockers

## 9) Known risks and decisions

### Known risks
- legacy direct REST fallback calls in checkout may still hit degraded PostgREST paths
- wide payload shape from checkout-context function (`pricing_rows` full row objects)
- environment parity drift if staging/prod secrets differ

### Decisions currently in effect
- trip price display prioritizes correctness over silent stale values (`₹0` on fetch failure)
- trip/check context functions include DB fallback to survive PostgREST/API outages
- staging-first rollout remains mandatory for architecture changes

## 10) Ownership map (practical)

### Frontend ownership surface
- all pricing and checkout UI logic is centralized in:
  - `framer-website/framer/TripPriceOverrides.tsx`
  - `framer-website/framer/CheckoutPageOverrides.tsx`

### Backend ownership surface
- pricing read model:
  - `framer-website/supabase/functions/get-trip-display-price/index.ts`
  - `framer-website/supabase/functions/get-trip-checkout-context/index.ts`
- booking and payment:
  - `framer-website/supabase/functions/create-booking/index.ts`
  - `framer-website/supabase/functions/handle-payment/index.ts`
  - `framer-website/supabase/functions/get-booking-status/index.ts`
  - `framer-website/supabase/functions/retry-payment/index.ts`
- discounts:
  - `framer-website/supabase/functions/validate-coupon/index.ts`

## 11) Quick runbook for incidents

### Incident: trip prices show `₹0` on production
1. test `get-trip-display-price` directly for affected slug/trip_id
2. check function logs for fallback path and errors
3. if function returns 200, verify published frontend bundle is latest
4. if function returns 500, validate prod env vars (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`)

### Incident: checkout shows missing trip context
1. test `get-trip-checkout-context` directly
2. verify checkout page is on latest published Framer bundle
3. inspect network that checkout bootstrap calls function endpoint (not only `/rest/v1`)
4. check function logs for trip/pricing fallback failures

### Incident: coupon or booking submit failure
1. test `validate-coupon` and `create-booking` endpoints with same payload shape
2. confirm `trip_id`, `departure_date`, travellers normalization
3. inspect function logs for pricing fetch/coupon validation or PayU config errors

## 12) Next architecture hardening tasks
1. Narrow `get-trip-checkout-context` response to explicit field allowlist.
2. Remove or gate legacy direct REST fallbacks in checkout bootstrap after confidence window.
3. Add explicit request correlation id in frontend and function logs.
4. Add minimal health endpoint or synthetic check for pricing/checkout critical paths.
5. Document env var matrix per project (staging vs production) in a secured internal doc.
