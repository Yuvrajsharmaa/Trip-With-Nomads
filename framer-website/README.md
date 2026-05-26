# Framer Website Project

This project contains all the code and assets related to the **Trip with Nomads** Framer website. It includes the logic for the booking flow, data synchronization scripts, and prototypes.

## 📂 Structure

- **`framer/`**: The core TypeScript/React components added as Code Overrides in the Framer editor.
  - `BookingOverrides.tsx`: The main 3-step booking flow.
  - `BookingStatusOverride.tsx`: Handles payment success/failure display.
- **`scripts/`**: Automation scripts for syncing data between the local environment, Supabase, and Framer CMS.
  - `framer_cms_sync.mjs`: Syncs trip data to Framer.
  - `push_booking_overrides.mjs`: Utility to manage overrides.
  - `upload_r2_video.mjs`: Uploads public marketing videos to Cloudflare R2.
- **`supabase/`**: Shared backend infrastructure (migrations and Edge Functions).
- **`app/` & `components/`**: A Next.js clone of the Framer site (used for prototyping and reference).
- **`prototypes/`**: HTML prototypes for testing specific logic (e.g., payment redirections).
- **`data/`**: JSON and CSV files containing trip and pricing data.
- **`legacy-components/`**: Older versions of components for reference.
- **`docs/`**: Project-specific operational notes such as Cloudflare R2 setup and change logs for public videos.
  - `security-change-log.md`: Security rollout log (Supabase/checkout hardening).

## 🔗 Dependencies & Context

This project relies heavily on the **Supabase** backend for:
1. **Bookings**: Storing transaction details.
2. **Pricing**: Fetching real-time trip pricing.
3. **Edge Functions**: Handling PayU hash generation and payment callbacks.

Check `IMPLEMENTATION_PLAN.md` for the full technical roadmap.

---

### Core Shared Runtime Folders
- `supabase/`: Database schema and edge function logic.
- `scripts/`: Data management utilities.
- `data/`: Source of truth for trips.
- `IMPLEMENTATION_PLAN.md`: The overarching technical plan.

## 🔐 Payment Status Token Secret

Set `BOOKING_STATUS_TOKEN_SECRET` in Supabase Edge Function secrets to protect booking status reads on payment success/failure pages.  
If this secret is not set, the functions fall back to `PAYU_*_SALT` values for backward compatibility.

## Payment Gateway Runbook

Use this for production/staging payment operations.

### Required Supabase secrets

- `PAYMENT_GATEWAY` = `razorpay` or `payu`
- `PAYMENT_GATEWAY_TEST_MODE` = `true` (test) or `false` (live)
- `PAYMENT_CALLBACK_URL` = `<project-supabase-url>/functions/v1/handle-payment`
- `BOOKING_STATUS_TOKEN_SECRET` = high-entropy dedicated secret

Razorpay (recommended keys):

- `RAZORPAY_LIVE_KEY_ID`
- `RAZORPAY_LIVE_KEY_SECRET`
- `RAZORPAY_TEST_KEY_ID`
- `RAZORPAY_TEST_KEY_SECRET`

### Safe cutover order

1. Deploy migrations (if schema changed).
2. Deploy edge functions: `create-booking`, `retry-payment`, `handle-payment`, `get-booking-status`.
3. Set/update payment secrets.
4. Run one controlled checkout on target env (success path + status page load).

### Emergency rollback

Set `PAYMENT_GATEWAY=payu` and redeploy is not required for toggle-only rollback.

### Razorpay secret rotation

If a live key is ever exposed in plain text:

1. Rotate/regenerate keys in Razorpay Dashboard immediately.
2. Update Supabase secrets (`RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`, optional generic mirrors).
3. Re-run one live checkout smoke test.
