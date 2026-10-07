# Framer Website Project

This project contains all the code and assets related to the **Trip with Nomads** Framer website. It includes the logic for the booking flow, data synchronization scripts, and prototypes.

## 📂 Structure

- **`framer/`**: The core TypeScript/React components added as Code Overrides in the Framer editor.
  - `CheckoutPageOverrides.tsx`: The only supported booking and payment flow at `/checkout`.
  - `BookingStatusOverride.tsx`: Handles payment success/failure display.
  - `EmailPopupOverride.tsx`: Lead-only wrappers for waitlist, trip-page, booking-invite, and custom-trip forms. It is not a buying flow.
- **`scripts/`**: Automation scripts for syncing data between the local environment, Supabase, and Framer CMS.
  - `framer_cms_sync.mjs`: Syncs trip data to Framer.
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
3. **Edge Functions**: Creating idempotent checkout attempts, reconciling verified Razorpay webhooks, and serving signed payment status.

`IMPLEMENTATION_PLAN.md` is a historical PayU/modal design note. The active implementation is documented by the Supabase migrations, shared contracts, and the staging E2E runbook.

---

### Core Shared Runtime Folders
- `supabase/`: Database schema and edge function logic.
- `scripts/`: Data management utilities.
- `data/`: Source of truth for trips.
- `IMPLEMENTATION_PLAN.md`: The overarching technical plan.

## 🔐 Payment Status Token Secret

Set `BOOKING_STATUS_TOKEN_SECRET` in Supabase Edge Function secrets to protect booking status reads on payment success/failure pages.  
If this secret is not set, the functions fall back to `PAYU_*_SALT` values for backward compatibility.

## Payment Update Emails

The verified Razorpay webhook sends a transactional payment update through Resend after a valid booking status change. Set `RESEND_API_KEY` in both staging and production Supabase Edge Function secrets. The default sender is `Trip With Nomads <payments@tripwithnomads.com>` with replies routed to `support@tripwithnomads.com`.

If a sending subdomain was verified instead of the root domain, also set `RESEND_FROM_EMAIL` to a sender on that verified subdomain. Email requests use deterministic Resend idempotency keys so repeated payment events do not create duplicate messages.

Internal booking operations notifications are sent to the comma-separated recipients in the server-side `BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS` secret. Configure it in both environments with the support mailbox and the operations Gmail address. These messages cover booking creation/setup failures, payment retries, verified full or advance payments, verified failures, and reconciliation anomalies. Delivery is best-effort and does not change the payment authority or block checkout; abandoned-payment reminders, refunds, cancellations, chargebacks, and reschedules are intentionally out of scope until authoritative events exist.
