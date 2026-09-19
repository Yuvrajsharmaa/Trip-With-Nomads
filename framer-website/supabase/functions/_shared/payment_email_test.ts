import {
    assert,
    assertEquals,
    assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildPaymentEmail } from "./payment_email.ts"

const pendingBooking = {
    id: "booking-123",
    booking_ref: "TWN-2026-00123",
    name: "Guest User",
    email: "guest@example.com",
    departure_date: "2026-05-09",
    total_amount: 17323.95,
    paid_amount: 0,
    due_amount: 0,
    payment_status: "pending",
    settlement_status: "pending",
    payment_mode: "full",
    payment_gateway_txn_id: "",
}

Deno.test("builds a paid payment email with escaped customer data", () => {
    const email = buildPaymentEmail(
        pendingBooking,
        {
            ...pendingBooking,
            name: "A <Guest>",
            payment_status: "paid",
            settlement_status: "fully_paid",
            paid_amount: 17323.95,
            payment_gateway_txn_id: "pay_123",
        },
        "Summer Spiti",
    )

    assert(email)
    assertEquals(email.to, "guest@example.com")
    assertEquals(email.subject, "Payment received for booking TWN-2026-00123")
    assertStringIncludes(email.html, "A &lt;Guest&gt;")
    assertStringIncludes(email.html, "9 May 2026")
    assertStringIncludes(email.html, "https://tripwithnomads.com")
    assertStringIncludes(email.text, "Payment received")
    assertStringIncludes(email.text, "₹17,323.95")
})

Deno.test("uses the configured site URL for environment-safe email links", () => {
    const email = buildPaymentEmail(
        pendingBooking,
        {
            ...pendingBooking,
            payment_status: "paid",
            settlement_status: "fully_paid",
            paid_amount: 17323.95,
            payment_gateway_txn_id: "pay_staging",
        },
        "Summer Spiti",
        "https://staging.tripwithnomads.com/",
    )

    assert(email)
    assertStringIncludes(email.html, "https://staging.tripwithnomads.com")
    assertEquals(email.html.includes("https://tripwithnomads.com\""), false)
})

Deno.test("does not build an email for a repeated unchanged callback", () => {
    const booking = {
        ...pendingBooking,
        payment_status: "paid",
        settlement_status: "fully_paid",
        paid_amount: 17323.95,
        payment_gateway_txn_id: "pay_123",
    }

    assertEquals(buildPaymentEmail(booking, booking, "Summer Spiti"), null)
})

Deno.test("builds a failure email for a valid failed transition", () => {
    const email = buildPaymentEmail(
        pendingBooking,
        {
            ...pendingBooking,
            payment_status: "failed",
            settlement_status: "failed",
            payment_gateway_txn_id: "pay_failed",
        },
        "Summer Spiti",
    )

    assert(email)
    assertStringIncludes(email.subject, "Payment update")
    assertStringIncludes(email.text, "could not complete")
})
