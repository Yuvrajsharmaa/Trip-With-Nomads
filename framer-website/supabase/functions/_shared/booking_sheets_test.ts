import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    ABANDONED_BOOKING_HEADERS,
    BOOKING_HEADERS,
    buildAbandonedBookingSheetRow,
    buildBookingSheetRow,
} from "./booking_sheets.ts"

Deno.test("Bookings exposes a compact current-state contract", () => {
    assertEquals(BOOKING_HEADERS, [
        "Last Updated",
        "Booking Ref",
        "Trip",
        "Departure Date",
        "Guest Name",
        "Email",
        "Phone",
        "Travellers",
        "Payment Plan",
        "Trip Total",
        "Paid",
        "Balance Due",
        "Payment Status",
        "Settlement Status",
        "Notes",
    ])
})

Deno.test("booking current-state row keeps money readable and hides provider fields", () => {
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
            country_code: "+91",
            travellers: [{ name: "Yuvraj Sharma", sharing: "Quad", transport: "Bike" }],
            payment_mode: "partial_25",
            total_amount: 43573.95,
            paid_amount: 10893.49,
            due_amount: 32680.46,
            payment_status: "paid",
            settlement_status: "partially_paid",
            payment_provider: "razorpay",
            payment_gateway_order_or_ref_id: "order_123",
            payment_gateway_payment_id: "pay_123",
        },
        notes: "Due before departure",
        updatedAt: "2026-03-11T12:34:56.000Z",
    })

    assertEquals(row.length, BOOKING_HEADERS.length)
    assertMatch(String(row[0]), /^11 Mar 2026, 6:04 PM IST$/)
    assertEquals(row[1], "TWN-ABCD1234")
    assertEquals(row[2], "Summer Spiti")
    assertEquals(row[3], "9 May 2026")
    assertEquals(row[4], "Yuvraj Sharma")
    assertEquals(row[5], "yuvraj@example.com")
    assertEquals(row[6], "+91 9999999999")
    assertEquals(row[7], "Yuvraj Sharma (Quad · Bike)")
    assertEquals(row[8], "25% deposit")
    assertEquals(row[9], 43573.95)
    assertEquals(row[10], 10893.49)
    assertEquals(row[11], 32680.46)
    assertEquals(row[12], "Paid")
    assertEquals(row[13], "Partially paid")
    assertEquals(row[14], "Due before departure")
    assert(!row.some((value) => /9f3ce5|trip-123|order_123|pay_123|razorpay/i.test(String(value))))
})

Deno.test("abandoned booking rows keep checkout context sales-readable", () => {
    assertEquals(ABANDONED_BOOKING_HEADERS, [
        "Captured At",
        "Name",
        "Email",
        "Phone",
        "Trip",
        "Departure Date",
        "Travellers",
        "Payment Plan",
        "Reason",
        "Status",
        "Notes",
    ])

    const row = buildAbandonedBookingSheetRow({
        submission: {
            captured_at: "2026-10-08T10:00:00.000Z",
            name: "Guest User",
            email: "GUEST@example.com",
            phone: "9876543210",
            country_code: "+91",
            trip_name: "Winter Spiti Expedition",
            departure_date: "2026-12-20",
            travellers: [{ name: "Guest User", sharing: "Double", transport: "SUV" }],
            payment_mode: "partial_25",
            reason: "checkout_abandoned_before_payment",
            status: "abandoned_booking",
            notes: "",
        },
    })

    assertEquals(row.length, ABANDONED_BOOKING_HEADERS.length)
    assertMatch(String(row[0]), /^8 Oct 2026, 3:30 PM IST$/)
    assertEquals(row[1], "Guest User")
    assertEquals(row[2], "guest@example.com")
    assertEquals(row[3], "+91 9876543210")
    assertEquals(row[4], "Winter Spiti Expedition")
    assertEquals(row[5], "20 Dec 2026")
    assertEquals(row[6], "Guest User (Double · SUV)")
    assertEquals(row[7], "25% deposit")
    assertEquals(row[8], "Checkout abandoned before payment")
    assertEquals(row[9], "Checkout abandoned")
})
