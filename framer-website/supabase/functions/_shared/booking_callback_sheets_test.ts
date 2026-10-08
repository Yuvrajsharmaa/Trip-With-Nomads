import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { BOOKING_CALLBACK_HEADERS, buildBookingCallbackRow } from "./booking_callback_sheets.ts"

Deno.test("payment history uses a compact event-oriented contract", () => {
    assertEquals(BOOKING_CALLBACK_HEADERS, [
        "Payment Date",
        "Booking Ref",
        "Trip",
        "Departure Date",
        "Guest Name",
        "Email",
        "Amount Received",
        "Expected Amount",
        "Payment Result",
        "Settlement Status",
        "Notes",
    ])
})

Deno.test("payment history row preserves money and omits provider identifiers", () => {
    const row = buildBookingCallbackRow({
        booking: {
            id: "booking-123",
            booking_ref: "TWN-2026-00123",
            trip_name: "Summer Spiti",
            departure_date: "2026-05-09",
            name: "Guest User",
            email: "GUEST@example.com",
            settlement_status: "fully_paid",
        },
        eventId: "evt_123",
        eventReceivedAt: "2026-03-11T12:34:56.000Z",
        processedAt: "2026-03-11T13:00:00.000Z",
        eventType: "payment.captured",
        paymentResult: "paid",
        amountReceived: 17323.95,
        expectedAmount: 17323.95,
        reconciliationResult: "matched",
        notes: "webhook synced",
    })

    assertEquals(row.length, BOOKING_CALLBACK_HEADERS.length)
    assertMatch(String(row[0]), /^11 Mar 2026, 6:04 PM IST$/)
    assertEquals(row[1], "TWN-2026-00123")
    assertEquals(row[2], "Summer Spiti")
    assertEquals(row[3], "9 May 2026")
    assertEquals(row[4], "Guest User")
    assertEquals(row[5], "guest@example.com")
    assertEquals(row[6], 17323.95)
    assertEquals(row[7], 17323.95)
    assertEquals(row[8], "Paid")
    assertEquals(row[9], "Fully paid")
    assertEquals(row[10], "webhook synced")
    assert(!row.some((value) => /booking-123|evt_123|razorpay|order_|pay_/i.test(String(value))))
})
