# Supabase Booking + PayU Payment — Implementation Plan

## Overview

Connect the existing Framer booking flow (3-step modal) to Supabase for storing bookings and PayU for processing payments. The booking data from Step 3 ("Pay Now") should:

1. Create a booking record in Supabase
2. Generate a PayU hash via an Edge Function
3. Redirect the user to PayU for payment
4. Handle the PayU callback (success/failure) and update the booking record

---

## Current State

### What Exists ✅
- **Framer Frontend**: 3-step booking modal (`BookingOverrides.tsx`)
  - Step 1: Select departure date + transport
  - Step 2: Add travellers (name + sharing variant)
  - Step 3: Review & Pay
- **`withPayButton`**: Generates a payload but only logs to console + alert
- **`computeTotals()`**: Calculates subtotal, tax (2%), breakdown per sharing variant
- **Supabase**: Project `jxozzvwvprmnhvafmpsa` with `trip_pricing` table already working
- **Edge Functions (existing code, may need updating)**:
  - `edge_function.ts` — `create-booking`: Inserts booking → generates PayU hash → returns PayU form data
  - `handle_payment.ts` — `handle-payment`: Receives PayU callback → verifies hash → updates booking status → redirects user
- **PayU Credentials**: Already configured as Supabase secrets (PAYU_KEY, PAYU_SALT, test/live modes)

### What Needs Work 🔧
1. **Database schema** — `bookings` table needs to support multi-traveller data
2. **`create-booking` Edge Function** — Update to match the new payload structure (multi-traveller, sharing variants, breakdown)
3. **`withPayButton`** — Replace console.log with actual API call to edge function
4. **PayU form submission** — Auto-submit the PayU form from Framer
5. **`handle-payment` Edge Function** — Verify it handles the new schema
6. **Success/Failure pages** — Ensure they exist on the Framer site

---

## Phase 1: Database Schema

### 1A. Update `bookings` Table

```sql
-- Run in Supabase SQL Editor
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travellers JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS departure_date TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_breakdown JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payu_txnid TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payu_mihpayid TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
```

> **Note**: Check if the `bookings` table already exists with conflicting columns. If so, run `ALTER TABLE` to rename/drop as needed. The existing `edge_function.ts` uses columns: `name`, `email`, `trip_id`, `departure_date`, `sharing`, `transport`, `amount`, `phone`, `payment_status`, `payu_txnid`. We need to adapt this to the multi-traveller model.

### 1B. Expected `bookings` Row Shape

| Column | Type | Example |
|---|---|---|
| `id` | UUID (PK, auto) | `a1b2c3...` |
| `trip_id` | UUID (FK) | `66d08175-8a57-...` |
| `departure_date` | TEXT | `2026-02-24` |
| `transport` | TEXT | `traveller` |
| `travellers` | JSONB | `[{"name":"John","sharing":"triple"},{"name":"Jane","sharing":"double"}]` |
| `payment_breakdown` | JSONB | `[{"label":"1x Guest (triple)","price":6999,...}]` |
| `tax_amount` | NUMERIC | `280` |
| `total_amount` | NUMERIC | `14280` |
| `currency` | TEXT | `INR` |
| `payment_status` | TEXT | `pending` → `paid` / `failed` |
| `payu_txnid` | TEXT | `txn_1234567890` |
| `payu_mihpayid` | TEXT | PayU's internal ID |
| `name` | TEXT | Primary traveller name (for PayU) |
| `email` | TEXT | Contact email (for PayU) |
| `phone` | TEXT | Contact phone (for PayU) |
| `created_at` | TIMESTAMPTZ | Auto |

---

## Phase 2: Update `create-booking` Edge Function

### Current flow (single traveller):
```
Frontend → { name, email, trip_id, departure_date, sharing, transport, amount } → Edge Function
```

### New flow (multi-traveller):
```
Frontend → {
  trip_id, departure_date, transport,
  travellers: [{ name, sharing }],
  payment_breakdown, tax_amount, total_amount,
  name (primary), email, phone
} → Edge Function
```

### Key Changes:
1. Accept `travellers` array instead of single `sharing` field
2. Store breakdown + tax in the booking
3. Use `total_amount` for PayU `amount`
4. First traveller's name or contact name for PayU `firstname`

### Updated Edge Function (`create-booking/index.ts`):

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const body = await req.json()

        const {
            trip_id,
            departure_date,
            transport,
            travellers,           // [{ name, sharing }]
            payment_breakdown,     // [{ label, price, variant, count }]
            tax_amount,
            total_amount,
            name,                  // Primary contact name
            email,                 // Primary contact email
            phone,                 // Primary contact phone
        } = body

        // Validation
        if (!trip_id || !departure_date || !transport || !travellers?.length || !total_amount || !email || !name) {
            return new Response(
                JSON.stringify({ error: "Missing required fields" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // PayU Setup
        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        let PAYU_KEY = IS_TEST
            ? (Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY"))
            : (Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY"))
        let PAYU_SALT = IS_TEST
            ? (Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT"))
            : (Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT"))

        if (!PAYU_KEY || !PAYU_SALT) {
            return new Response(
                JSON.stringify({ error: "Payment configuration missing" }),
                { status: 500, headers: corsHeaders }
            )
        }

        // Generate Transaction ID
        const txnid = "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000)

        // Insert Booking
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        const { data, error } = await supabase
            .from("bookings")
            .insert({
                trip_id,
                departure_date,
                transport,
                travellers,
                payment_breakdown,
                tax_amount,
                total_amount,
                name,
                email,
                phone: phone || "",
                currency: "INR",
                payment_status: "pending",
                payu_txnid: txnid,
            })
            .select()
            .single()

        if (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // Generate PayU Hash
        const productinfo = "Trip Booking"
        const firstname = name.split(" ")[0]
        const udf1 = data.id  // Booking UUID for callback lookup

        const hashString = `${PAYU_KEY}|${txnid}|${total_amount}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${PAYU_SALT}`

        const encoder = new TextEncoder()
        const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("")

        const actionUrl = IS_TEST
            ? "https://test.payu.in/_payment"
            : "https://secure.payu.in/_payment"

        return new Response(
            JSON.stringify({
                booking_id: data.id,
                payu: {
                    key: PAYU_KEY,
                    txnid,
                    amount: total_amount.toString(),
                    productinfo,
                    firstname,
                    email,
                    phone: phone || "",
                    surl: Deno.env.get("PAYMENT_CALLBACK_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-payment`,
                    furl: Deno.env.get("PAYMENT_CALLBACK_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-payment`,
                    hash,
                    udf1,
                    action: actionUrl,
                },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err) {
        console.error("💥 Error:", err)
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
```

---

## Phase 3: Update `withPayButton` in BookingOverrides.tsx

Replace the current `console.log + alert` with an actual API call:

```typescript
const handlePay = async () => {
    if (!isValid) {
        alert("Please fill in all details for every traveller.")
        return
    }

    // 1. Collect contact info (prompt or use first traveller)
    const contactName = travellers[0]?.name || "Guest"
    const contactEmail = prompt("Enter your email for booking confirmation:")
    if (!contactEmail) return
    const contactPhone = prompt("Enter your phone number:") || ""

    // 2. Call create-booking Edge Function
    try {
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/create-booking`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
                body: JSON.stringify({
                    trip_id: store.tripId,
                    departure_date: store.date,
                    transport: store.transport,
                    travellers: travellers.map((t) => ({
                        name: t.name,
                        sharing: t.sharing,
                    })),
                    payment_breakdown: breakdown,
                    tax_amount: tax,
                    total_amount: total,
                    name: contactName,
                    email: contactEmail,
                    phone: contactPhone,
                }),
            }
        )

        const result = await response.json()
        if (!response.ok) throw new Error(result.error)

        // 3. Auto-submit PayU form
        const { payu } = result
        const form = document.createElement("form")
        form.method = "POST"
        form.action = payu.action

        Object.entries(payu).forEach(([key, value]) => {
            if (key === "action") return
            const input = document.createElement("input")
            input.type = "hidden"
            input.name = key
            input.value = value as string
            form.appendChild(input)
        })

        document.body.appendChild(form)
        form.submit()  // Redirects to PayU
    } catch (err) {
        console.error("[BookingLogic] Payment error:", err)
        alert("Something went wrong. Please try again.")
    }
}
```

---

## Phase 4: `handle-payment` Edge Function (Already Exists ✅)

The existing `handle_payment.ts` should work as-is. It:
1. Receives PayU's POST callback (form data)
2. Fetches the booking from Supabase using `udf1` (booking UUID)
3. Verifies the reverse hash
4. Updates `payment_status` to `paid` or `failed`
5. Redirects to success/failure page

### Verify these Supabase secrets are set:
- `PAYU_KEY` / `PAYU_TEST_KEY` / `PAYU_LIVE_KEY`
- `PAYU_SALT` / `PAYU_TEST_SALT` / `PAYU_LIVE_SALT`
- `PAYU_TEST_MODE` (`"true"` or `"false"`)
- `PAYMENT_CALLBACK_URL` (your `handle-payment` function URL)

---

## Phase 5: Contact Info Collection (UX Decision Needed)

Currently the booking flow doesn't collect **email** or **phone** — which are required by PayU. Options:

### Option A: Add Email/Phone Fields to Step 2 (Recommended)
Add input fields at the top of the traveller section for primary contact. This keeps the flow self-contained.

### Option B: Prompt on Pay Click
Use `window.prompt()` to ask for email/phone when user clicks "Pay Now." Quick but not polished.

### Option C: Add a Step 2.5
Insert a "Contact Details" step between traveller details and review. More steps = more friction.

**Recommendation**: Option A — add email + phone fields at the top of the traveller section on Step 2.

---

## Implementation Order

| # | Task | Effort | File(s) |
|---|---|---|---|
| 1 | Run SQL to update `bookings` table schema | 5 min | Supabase Dashboard |
| 2 | Add email + phone input fields to Step 2 | 30 min | `BookingOverrides.tsx` |
| 3 | Update `create-booking` Edge Function | 20 min | Deploy via Supabase CLI |
| 4 | Update `withPayButton` to call Edge Function + auto-submit PayU form | 20 min | `BookingOverrides.tsx` |
| 5 | Verify `handle-payment` works with new schema | 10 min | Test with PayU test mode |
| 6 | Create/verify success + failure pages on Framer | 10 min | Framer Editor |
| 7 | End-to-end test in PayU test mode | 15 min | Browser |
| 8 | Switch to PayU live mode | 5 min | Supabase secrets |

**Total estimated effort: ~2 hours**

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│  FRAMER WEBSITE (BookingOverrides.tsx)                         │
│                                                               │
│  Step 1: Date + Transport                                     │
│  Step 2: Travellers + Email/Phone                             │
│  Step 3: Review → Click "Pay Now"                             │
│           │                                                   │
│           ▼                                                   │
│  POST /functions/v1/create-booking                            │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTION: create-booking                       │
│                                                               │
│  1. Validate payload                                          │
│  2. INSERT into bookings table (status: pending)              │
│  3. Generate PayU hash (SHA-512)                              │
│  4. Return PayU form data (key, txnid, hash, etc.)            │
│                                                               │
└───────────┬───────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│  FRAMER: Auto-create & submit hidden form to PayU             │
│  (form.action = https://test.payu.in/_payment)                │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────────────────────────────┐                  │
│  │  USER ON PAYU PAYMENT PAGE              │                  │
│  │  UPI / Card / NetBanking / Wallet       │                  │
│  └─────────────┬───────────────────────────┘                  │
│                │                                              │
└────────────────┼──────────────────────────────────────────────┘
                 │ (PayU POSTs to surl/furl)
                 ▼
┌───────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTION: handle-payment                       │
│                                                               │
│  1. Parse PayU form data                                      │
│  2. Fetch booking from DB using udf1 (booking UUID)           │
│  3. Verify reverse hash                                       │
│  4. UPDATE bookings SET payment_status = paid/failed          │
│  5. Redirect (303) to Framer success/failure page             │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Questions to Decide Before Starting

1. **Contact info collection**: Should we add email/phone fields to Step 2, or use prompts on Step 3?
2. **Test mode**: Should we start in PayU test mode? (Recommended: yes)
3. **Bookings table**: Does the `bookings` table already exist, or do we need to create it fresh?
4. **Edge functions**: Are `create-booking` and `handle-payment` already deployed, or do they need fresh deployment?
5. **Success/failure pages**: Do these exist on `twn2.framer.website`?
