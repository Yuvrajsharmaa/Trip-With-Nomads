import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    BOOKING_CALLBACK_HEADERS,
    buildBookingCallbackRow,
} from "./booking_callback_sheets.ts"

Deno.test("payment history is event-oriented and numeric", () => {
    const row = buildBookingCallbackRow({
        booking: {
            id: "booking-123",
            booking_ref: "TWN-2026-00123",
            trip_name: "Summer Spiti",
            departure_date: "2026-05-09",
            name: "Guest User",
            email: "GUEST@example.com",
            payment_attempt_number: 2,
            payment_provider: "razorpay",
            settlement_status: "fully_paid",
        },
        eventId: "evt_123",
        eventReceivedAt: "2026-03-11T12:34:56.000Z",
        processedAt: "2026-03-11T13:00:00.000Z",
        eventType: "payment.captured",
        paymentResult: "paid",
        providerOrderReference: "order_123",
        providerPaymentReference: "pay_123",
        amountReceived: 17323.95,
        expectedAmount: 17323.95,
        reconciliationResult: "matched",
        notes: "webhook synced",
    })

    assertEquals(row.length, BOOKING_CALLBACK_HEADERS.length)
    assertEquals(row[0], "evt_123")
    assertEquals(row[4], 2)
    assertEquals(row[13], "order_123")
    assertEquals(row[15], 17323.95)
    assertMatch(String(row[1]), /^2026-03-11T18:04:56\+05:30$/)
    assertMatch(String(row[17]), /^2026-03-11T18:30:00\+05:30$/)
})
