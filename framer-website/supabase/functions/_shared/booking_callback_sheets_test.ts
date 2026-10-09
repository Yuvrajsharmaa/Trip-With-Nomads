import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    BOOKING_CALLBACK_HEADERS,
    BOOKING_PAYMENT_HISTORY_TAB,
    buildBookingCallbackRow,
    resolveBookingPaymentHistoryTab,
} from "./booking_callback_sheets.ts"

Deno.test("payment history prefers one existing human-readable tab and never invents one", () => {
    assertEquals(BOOKING_PAYMENT_HISTORY_TAB, "Payment History")
    assertEquals(
        resolveBookingPaymentHistoryTab("paid", ["Payment History", "Bookings_Failed"]),
        "Payment History",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab(
            "failed",
            ["Payment History", "Bookings_Failed"],
            "Bookings_Success",
        ),
        "Payment History",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab("paid", ["Bookings_Success", "Bookings_Failed"]),
        "Bookings_Success",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab("failed", ["Bookings_Success", "Bookings_Failed"]),
        "Bookings_Failed",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab("failed", ["Bookings_Failed"], "Missing History"),
        "Bookings_Failed",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab(
            "failed",
            ["Bookings_Success", "Bookings_Failed"],
            "Bookings_Success",
        ),
        "Bookings_Failed",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab("paid", ["Payment Records"], "Payment Records"),
        "Payment Records",
    )
    assertEquals(
        resolveBookingPaymentHistoryTab(
            "paid",
            ["Payment History", "Bookings_Success"],
            undefined,
            "Bookings_Success",
            "Bookings_Failed",
            "Bookings_Success",
        ),
        "Bookings_Success",
    )
})

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
        paymentAttempt: 2,
    })

    assertEquals(row.length, BOOKING_CALLBACK_HEADERS.length)
    assertEquals(typeof row[0], "number")
    assertEquals(row[0] as unknown, 46092.75342592593)
    assertEquals(row[1], "TWN-2026-00123")
    assertEquals(row[2], "Summer Spiti")
    assertEquals(row[3] as unknown, 46151)
    assertEquals(row[4], "Guest User")
    assertEquals(row[5], "guest@example.com")
    assertEquals(row[6], 17323.95)
    assertEquals(row[7], 17323.95)
    assertEquals(row[8], "Paid")
    assertEquals(row[9], "Fully paid")
    assertEquals(row[10], "Payment captured · Attempt 2")
    assert(!row.some((value) => /booking-123|evt_123|razorpay|order_|pay_/i.test(String(value))))
})

Deno.test("payment history notes explain failed attempts without provider jargon", () => {
    const row = buildBookingCallbackRow({
        booking: { booking_ref: "TWN-2026-00124", settlement_status: "pending" },
        eventType: "payment.failed",
        paymentResult: "failed",
        paymentAttempt: 2,
        reconciliationResult: "amount_mismatch",
    })

    assertEquals(row[8], "Failed")
    assertEquals(row[10], "Payment failed · Attempt 2 · Review: Amount Mismatch")
})
