import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { BOOKING_HEADERS, buildBookingSheetRow } from "./booking_sheets.ts"

Deno.test("Bookings uses a stable human-readable current-state contract", () => {
    assertEquals(BOOKING_HEADERS, [
        "Last Updated (IST)",
        "Booking Ref",
        "Booking ID",
        "Trip Name",
        "Trip ID",
        "Departure Date",
        "Guest Name",
        "Email",
        "Phone",
        "Traveller Count",
        "Traveller Summary",
        "Coupon Code",
        "Payment Plan",
        "Subtotal",
        "Discount",
        "GST",
        "Trip Total",
        "Payable Now",
        "Paid Amount",
        "Balance Due",
        "Payment Status",
        "Settlement Status",
        "Payment Provider",
        "Payment Attempt",
        "Provider Order/Reference",
        "Provider Payment/Transaction ID",
        "Last Payment Event",
        "Last Payment Event At (IST)",
        "Notes",
    ])
})

Deno.test("booking current-state row keeps amounts numeric and provider-neutral", () => {
    const row = buildBookingSheetRow({
        booking: {
            id: "9f3ce5fb-1111-2222-3333-444444444444",
            booking_ref: "TWN-ABCD1234",
            trip_name: "Summer Spiti",
            trip_id: "trip-123",
            departure_date: "2026-05-09",
            name: "Yuvraj Sharma",
            email: "YUVRAJ@example.com",
            phone: "9999999999",
            travellers: [{ name: "Yuvraj Sharma", sharing: "Quad", transport: "Bike" }],
            coupon_code: "EARLY1000",
            payment_mode: "partial_25",
            subtotal_amount: 42499,
            discount_amount: 1000,
            tax_amount: 2074.95,
            total_amount: 43573.95,
            payable_now_amount: 10893.49,
            paid_amount: 10893.49,
            due_amount: 32680.46,
            payment_status: "paid",
            settlement_status: "partially_paid",
            payment_provider: "razorpay",
            payment_attempt_number: 2,
            provider_order_id: "order_123",
            provider_payment_id: "pay_123",
            last_payment_event: "payment.captured",
            last_payment_event_at: "2026-03-11T12:34:56.000Z",
            balance_due_note: "Due before departure",
        },
        notes: "webhook synced",
        updatedAt: "2026-03-11T12:34:56.000Z",
    })

    assertEquals(row.length, BOOKING_HEADERS.length)
    assertEquals(row[12], "25% deposit")
    assertEquals(row[13], 42499)
    assertEquals(row[19], 32680.46)
    assertEquals(row[22], "razorpay")
    assertEquals(row[24], "order_123")
    assertEquals(row[25], "pay_123")
    assertMatch(String(row[0]), /^2026-03-11T18:04:56\+05:30$/)
})
