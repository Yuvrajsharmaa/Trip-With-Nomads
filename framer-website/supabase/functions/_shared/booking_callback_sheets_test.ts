import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    BOOKING_CALLBACK_HEADERS,
    buildBookingCallbackRow,
} from "./booking_callback_sheets.ts"

Deno.test("callback sheet row keeps expected shape and IST timestamps", () => {
    const row = buildBookingCallbackRow({
        booking: {
            id: "booking-123",
            booking_ref: "TWN-2026-00123",
            payment_status: "paid",
            settlement_status: "fully_paid",
            payment_mode: "full",
            departure_date: "2026-05-09",
            created_at: "2026-03-11T12:34:56.000Z",
            name: "Guest User",
            email: "guest@example.com",
            phone: "9999999999",
            total_amount: 17323.95,
            payable_now_amount: 17323.95,
            paid_amount: 17323.95,
            due_amount: 0,
            payu_txnid: "txn_12345",
            payu_mihpayid: "mih_12345",
        },
        tripTitle: "Summer Spiti",
        tripSlug: "summer-spiti",
        notes: "callback synced",
        updatedAt: "2026-03-11T13:00:00.000Z",
    })

    assertEquals(row.length, BOOKING_CALLBACK_HEADERS.length)
    assertEquals(row[0], "booking-123")
    assertEquals(row[5], "Summer Spiti")
    assertEquals(row[6], "summer-spiti")
    assertMatch(String(row[8]), /IST$/)
    assertMatch(String(row[18]), /IST$/)
})
