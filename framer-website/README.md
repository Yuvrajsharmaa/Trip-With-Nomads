# Framer Website Project

This project contains all the code and assets related to the **Trip with Nomads** Framer website. It includes the logic for the booking flow, data synchronization scripts, and prototypes.

## 📂 Structure

- **`framer/`**: The core TypeScript/React components added as Code Overrides in the Framer editor.
  - `CheckoutPageOverrides.tsx`: The active checkout page flow (`/checkout`) with travellers, vehicle, coupon, and payment wiring.
  - `BookingStatusOverride.tsx`: Handles payment success/failure display.
  - `EmailPopupOverride.tsx`: Delayed email popup behavior.
- **`scripts/`**: Automation scripts for syncing data between the local environment, Supabase, and Framer CMS.
  - `framer_cms_sync.mjs`: Syncs trip data to Framer.
  - Push helpers for active overrides are temporary MCP scripts during local debugging.
- **`supabase/`**: Shared backend infrastructure (migrations and Edge Functions).
- **`app/` & `components/`**: A Next.js clone of the Framer site (used for prototyping and reference).
- **`prototypes/`**: HTML prototypes for testing specific logic (e.g., payment redirections).
- **`data/`**: JSON and CSV files containing trip and pricing data.
- **`legacy-components/`**: Older versions of components for reference.

## 🔗 Dependencies & Context

This project relies heavily on the **Supabase** backend for:
1. **Bookings**: Storing transaction details.
2. **Pricing**: Fetching real-time trip pricing.
3. **Edge Functions**: Handling PayU hash generation and payment callbacks.

Check `IMPLEMENTATION_PLAN.md` for the full technical roadmap.

---

### Shared with Admin Dashboard
The following folders are kept in sync with the `admin-dashboard` project for context:
- `supabase/`: Database schema and edge function logic.
- `scripts/`: Data management utilities.
- `data/`: Source of truth for trips.
- `IMPLEMENTATION_PLAN.md`: The overarching technical plan.
