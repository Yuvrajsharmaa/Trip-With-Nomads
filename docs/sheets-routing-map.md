# Trip With Nomads sheet map

Supabase is the source of truth. Google Sheets are readable projections for the team, not a second database. Existing workbooks and tabs are reused; the application does not create new tabs.

## Where each record goes

| Workbook | Visible tabs | What belongs there | What does not belong there |
| --- | --- | --- | --- |
| **TWN Bookings** | `Bookings`, `Bookings_Success`, `Bookings_Failed` | Booking payment state and verified payment events only | Leads, waitlist entries, invite forms, or abandoned lead submissions |
| **TWN Trip Page Leads** | `Leads`, `Abandoned Leads` | Leads and partial submissions started from a trip page | Booking payment rows or general waitlist rows |
| **TWN General & Waitlist Leads** | `Leads`, `Abandoned Leads` | General website forms and waitlist submissions | Trip-page leads or bookings |
| **TWN Booking Invites** | `NTC - Invites`, `Abandoned Leads` | Booking-invite submissions | Payment events or general website forms |
| **Custom Trip Leads** | `Custom Trip Leads`, `Abandoned Leads` | Custom-trip enquiries | Booking payment rows or unrelated leads |
| **TWN Master Leads** | `Master Leads` | A compact current-contact overview across lead routes | Booking rows and payment history |

The old lead tabs that were accidentally kept inside **TWN Bookings** are retained as hidden `Legacy Leads Archive` and `Legacy Abandoned Archive` tabs. They are historical recovery data, not active destinations.

## What people should see

- Current tabs are one row per booking or one row per normalized contact.
- History tabs append one row per verified payment event or abandoned submission.
- Names, contact details, trip information, source, status, and payment amounts use plain-language headers.
- Internal identifiers needed for idempotency and reconciliation remain in the existing tabs but are hidden from the normal working view. They are not deleted because removing them would make retries and repair unsafe.
- Money is numeric and formatted as INR. Timestamps are sortable IST timestamps. Traveller summaries and notes wrap for readability.

## Routing rules

- `trip_page_lead` → **TWN Trip Page Leads**.
- `waitlist_popup` and `general_lead` → **TWN General & Waitlist Leads**.
- `booking_invite` → **TWN Booking Invites**.
- `custom_trip_lead` → **Custom Trip Leads**.
- `booking_abandoned` and other partial submissions stay in the configured route's `Abandoned Leads` tab.
- A booking is written only to **TWN Bookings**: the current row is upserted in `Bookings`, and verified webhook events go to `Bookings_Success` or `Bookings_Failed`.

The trip-page route has its own configuration (`GOOGLE_SHEET_ID_TRIP_LEADS`). The old `GOOGLE_SHEET_ID_TRIPS` setting is retained only as a backward-compatible alias for that trip-lead workbook; it is no longer used as a booking destination.
