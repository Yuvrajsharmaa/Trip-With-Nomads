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

## 📊 Lead Sheet Routing

Lead routing is handled in `supabase/functions/record-lead/index.ts` by the `source` value:

- `booking_invite` -> `GOOGLE_SHEET_ID_NTC`
- `trip_page_lead` -> `GOOGLE_SHEET_ID_TRIPS`
- `custom_trip_lead` -> `GOOGLE_SHEET_ID_CUSTOM_TRIPS` (no fallback routing)
- all other sources -> `GOOGLE_SHEET_ID_GENERAL`

For custom destination inquiries that do not have pricing/dates, wire Framer forms to
`withCustomTripLeadTracking` in `framer/EmailPopupOverride.tsx`.
This override now captures both submitted and abandoned (`partial_fill`) custom-trip leads.

Sheet write guard:
- Sheets are written only for requests coming from live hosts (`tripwithnomads.com`, `www.tripwithnomads.com`).
- Staging/local/dev can still store leads in DB but will skip Sheets logging.

Abandoned lead tracking overrides:
- `withBookingInviteAbandonTracking`
- `withTripPageLeadAbandonTracking`
- `withCustomTripLeadAbandonTracking`

Apply the abandon tracking override to the corresponding form (or outer wrapper) to log
`status = partial_fill` once per source+email+page session.
For custom-trip forms, separate abandon override is optional because `withCustomTripLeadTracking`
already includes abandoned lead capture.
