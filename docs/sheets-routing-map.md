# Trip With Nomads: simple Sheet map

Supabase is the source of truth. Google Sheets are readable team views. The application uses the existing workbooks and tabs only; it does not create a new workbook or tab when a route is missing.

## The simple rule

- A **current** tab has one row per person or booking and is updated in place.
- An **event** tab has one row per submission or verified payment event and is append-only.
- Technical keys, provider references, raw URLs, and UTM values stay in Supabase and internal repair state only. They are not written to managed Sheets.
- The visible columns contain only captured human information: when, who, contact details, trip or itinerary, activity/reason, source, status, and payment values.

## Where each form goes

| Form or route | What the person is doing | Captured information | Workbook and tab |
| --- | --- | --- | --- |
| Waitlist popup on the home, trips, or club pages | Joining the waitlist | Name, email, phone, country code, Instagram, reason when the form has it, source page, trip context, and UTM values | **TWN General & Waitlist Leads → `Leads`**; incomplete submissions → `Abandoned Leads` |
| General enquiry form | Asking a general question or requesting information | Name, email, phone, Instagram, reason when present, source page, trip context, and UTM values | **TWN General & Waitlist Leads → `Leads`**; incomplete submissions → `Abandoned Leads` |
| Trip page form, for example `/upcoming-trips/vietnam-twn` | Asking to join a specific trip | Name, phone, optional email, trip name, and the captured activity | **TWN Trip Page Leads → `Leads`**; an email-free/partial submission → `Abandoned Leads` |
| Trip-page itinerary request/download | Asking for an itinerary and then downloading it after the form is recorded | Contact details, itinerary name, and `Downloaded itinerary` activity | **TWN Trip Page Leads → `Leads`**; an email-free/partial submission → `Abandoned Leads` |
| NTC invite form | Requesting an invite to Nomads Travel Club | Name, email, phone, Instagram, and the exact answer to **why they want to travel with us** | **NTC Invites → `NTC - Invites`**; incomplete submissions → `Abandoned Leads` |
| Custom trip enquiry form | Requesting a trip designed around their needs | Name, email, phone, Instagram, reason, source page, trip context, and UTM values | **Custom Trip Leads → `Custom Trip Leads`**; incomplete submissions → `Abandoned Leads` |
| Full-page `/checkout` | Buying a trip | Departure, guest/contact details, traveller names and sharing, transport/vehicle, coupon, payment plan, GST, total, payable now, and balance due | **TWN Bookings → `Bookings`** |
| Checkout abandoned before payment | Started checkout but did not complete payment | Contact details, trip, departure date, travellers, payment plan, and `Checkout abandoned before payment` reason | **TWN Bookings → `Abandoned Bookings`**; it is not a current `Bookings` row or a current `Leads` row |
| Razorpay payment webhook | Confirming a payment | Verified event, booking, amount, attempt, provider references, result, and reconciliation | **TWN Bookings → `Bookings_Success` or `Bookings_Failed`** as payment history; the current state remains in `Bookings` |

## What each workbook should look like

| Workbook | Day-to-day tab | History or recovery tabs | Meaning |
| --- | --- | --- | --- |
| **TWN Bookings** | `Bookings` | `Abandoned Bookings`, `Bookings_Success`, `Bookings_Failed`, hidden `Legacy Abandoned Archive` | `Bookings` is the only current booking register. `Abandoned Bookings` is the pre-payment checkout event log. Success and failed tabs are payment-event history for retries, disputes, and reconciliation; they are not another booking list. |
| **TWN Trip Page Leads** | `Leads` | `Abandoned Leads` | Contacts who came from a trip page. |
| **TWN General & Waitlist Leads** | `Leads` | `Abandoned Leads` | General enquiries and waitlist entries. |
| **NTC Invites** | `NTC - Invites` | `Abandoned Leads` | Invite requests and the reason each person gave. |
| **Custom Trip Leads** | `Custom Trip Leads` | `Abandoned Leads` | Custom-trip enquiries. |
| **TWN Master Leads** | `Master Leads` | none | One compact current-contact view across the routed lead destinations. It is sorted for review; it is not a second event log. |

## Visible columns

General, trip-page, custom-trip, and Master current tabs show: `Captured At`, `Last Activity`, `Name`, `Email`, `Phone`, `Company / Group`, `Trip / Itinerary`, `Reason / Activity`, `Source`, `Status`, and `Notes`.

The NTC tab calls the reason column `Why They Want To Travel` so the purpose is obvious. Abandoned lead tabs show `Captured At`, contact details, trip/itinerary, source, reason/activity, status, and notes. Abandoned booking tabs additionally show departure date, travellers, and payment plan. No UUID, raw URL, provider key, country-code helper field, or UTM field is shown in managed Sheets.

The booking current tab shows the booking, traveller details, money, `Payment Status`, and `Settlement Status`. Payment history shows the payment date, booking, amount received, expected amount, result, and settlement status. Dates use `7 Oct 2026, 9:27 PM IST` style text; amounts remain numeric INR cells so they can still be filtered and totalled.

## Routing safeguards

- `booking_invite` always targets the existing **NTC Invites** workbook and `NTC - Invites` tab.
- `trip_page_lead` uses the dedicated trip-page workbook. The old `GOOGLE_SHEET_ID_TRIPS` variable is only a compatibility alias for that lead workbook; it is never a booking destination.
- `waitlist_popup` and `general_lead` use the general/waitlist workbook.
- `custom_trip_lead` uses the custom workbook only when its existing destination is configured and present.
- `booking_abandoned` is an event and goes to the booking workbook's `Abandoned Bookings` tab. It never goes to the general lead workbook or `Master Leads`.
- A missing tab, changed header row, or multiple current-row matches stops the write and enters the repair report. The application does not silently create a tab or append a duplicate.
- Existing NTC reasons are preserved exactly. New invite submissions write their answer to the visible reason column; a blank historical reason is not invented.
