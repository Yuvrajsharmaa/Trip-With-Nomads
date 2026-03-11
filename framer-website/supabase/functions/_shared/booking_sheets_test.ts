import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { BOOKING_HEADERS, buildBookingSheetRow } from "./booking_sheets.ts"

Deno.test("booking sheet row includes due amount and mode fields in expected columns", () => {
    const row = buildBookingSheetRow({
        booking: {
            id: "9f3ce5fb-1111-2222-3333-444444444444",
            booking_ref: "TWN-ABCD1234",
            trip_id: "trip-123",
            departure_date: "2026-05-09",
            name: "Yuvraj Sharma",
            email: "yuvraj@example.com",
            phone: "9999999999",
            travellers: [
                { name: "Yuvraj Sharma", sharing: "Quad", transport: "Bike" },
                { name: "Ravi", sharing: "Double", vehicle: "SUV" },
            ],
            payment_breakdown: [
                { count: 1, variant: "Quad", transport: "Bike", price: 17999 },
                { count: 1, variant: "Double", transport: "SUV", price: 24500 },
            ],
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
            payu_txnid: "txn_123456",
            payu_mihpayid: "mih_123456",
            balance_due_note: "₹32,680.46 due on-site before trip departure.",
        },
        eventStage: "paid_callback",
        notes: "callback synced",
        updatedAt: "2026-03-11T12:34:56.000Z",
    })

    assertEquals(row.length, BOOKING_HEADERS.length)
    assertEquals(row[12], "Partial payment (25%)")
    assertEquals(row[17], "₹10,893.49")
    assertEquals(row[19], "₹32,680.46")
    assertEquals(row[25], "paid_callback")
})

Deno.test("booking sheet timestamp is IST formatted", () => {
    const row = buildBookingSheetRow({
        booking: { id: "booking-1" },
        eventStage: "created",
        updatedAt: "2026-03-11T12:34:56.000Z",
    })

    assertMatch(String(row[0]), /IST$/)
})
