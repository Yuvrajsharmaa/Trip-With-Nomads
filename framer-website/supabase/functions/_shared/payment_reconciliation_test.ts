import {
    calculateSettlementStatus,
    bookingStatusesAfterSuccessfulPayment,
    isAmountMatch,
    isPaidStatus,
    isSupersededPaymentFailure,
    paymentAttemptMatchesBookingOrder,
    transitionPaymentStatus,
} from "./payment_reconciliation.ts"
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("payment transitions are monotonic", () => {
    assertEquals(transitionPaymentStatus("pending", "success"), "paid")
    assertEquals(transitionPaymentStatus("failed", "success"), "paid")
    assertEquals(transitionPaymentStatus("paid", "failure"), "paid")
    assertEquals(transitionPaymentStatus("paid", "success"), "paid")
    assertEquals(transitionPaymentStatus("pending", "failure"), "failed")
})

Deno.test("a late webhook is accepted only for the order on its booking attempt", () => {
    assertEquals(paymentAttemptMatchesBookingOrder({
        bookingId: "booking-1",
        attemptBookingId: "booking-1",
        bookingOrderId: "order-new",
        attemptOrderId: "order-old",
        eventOrderId: "order-old",
    }), true)
    assertEquals(paymentAttemptMatchesBookingOrder({
        bookingId: "booking-1",
        attemptBookingId: "booking-1",
        bookingOrderId: "order-new",
        attemptOrderId: "order-other",
        eventOrderId: "order-old",
    }), false)
    assertEquals(paymentAttemptMatchesBookingOrder({
        bookingId: "booking-1",
        attemptBookingId: "booking-2",
        bookingOrderId: "order-old",
        attemptOrderId: "order-old",
        eventOrderId: "order-old",
    }), false)
    assertEquals(paymentAttemptMatchesBookingOrder({
        bookingId: "booking-1",
        attemptBookingId: "booking-1",
        bookingOrderId: "order-current",
        attemptOrderId: null,
        eventOrderId: "order-current",
    }), true)
})

Deno.test("a delayed failure for a payment superseded by retry is ignored", () => {
    const attempt = { superseded_payment_ids: ["pay_old"] }
    assertEquals(isSupersededPaymentFailure({
        eventName: "payment.failed",
        paymentId: "pay_old",
        attempt,
    }), true)
    assertEquals(isSupersededPaymentFailure({
        eventName: "payment.failed",
        paymentId: "pay_current",
        attempt,
    }), false)
    assertEquals(isSupersededPaymentFailure({
        eventName: "payment.captured",
        paymentId: "pay_old",
        attempt,
    }), false)
    assertEquals(isSupersededPaymentFailure({
        eventName: "payment.failed",
        paymentId: "pay_legacy_retry",
        attempt: { status: "pending", provider_payment_id: "pay_legacy_retry" },
    }), true)
})

Deno.test("paid status includes legacy succeeded bookings", () => {
    assertEquals(isPaidStatus("paid"), true)
    assertEquals(isPaidStatus("succeeded"), true)
    assertEquals(isPaidStatus("failed"), false)
})

Deno.test("settlement status distinguishes full and 25 percent payments", () => {
    assertEquals(calculateSettlementStatus("partial_25", 10000, 2500), "partially_paid")
    assertEquals(calculateSettlementStatus("full", 10000, 10000), "fully_paid")
    assertEquals(calculateSettlementStatus("full", 10000, 2500), "partially_paid")
})

Deno.test("successful website payments confirm the booking and sync its CRM lifecycle", () => {
    assertEquals(bookingStatusesAfterSuccessfulPayment({
        websiteStatus: "pending_payment",
        crmStatus: "payment_pending",
        paidAmountMinor: 1732395,
        dueAmountMinor: 0,
        payableNowAmountMinor: 1732395,
        totalAmountMinor: 1732395,
    }), { websiteStatus: "confirmed", crmStatus: "fully_paid" })

    assertEquals(bookingStatusesAfterSuccessfulPayment({
        websiteStatus: "pending_payment",
        crmStatus: "payment_pending",
        paidAmountMinor: 2500,
        dueAmountMinor: 7500,
        payableNowAmountMinor: 2500,
        totalAmountMinor: 10000,
    }), { websiteStatus: "confirmed", crmStatus: "confirmed" })

    assertEquals(bookingStatusesAfterSuccessfulPayment({
        websiteStatus: "pending_payment",
        crmStatus: "payment_pending",
        paidAmountMinor: 2000,
        dueAmountMinor: 8000,
        payableNowAmountMinor: 2500,
        totalAmountMinor: 10000,
    }), { websiteStatus: "pending_payment", crmStatus: "payment_pending" })
})

Deno.test("successful payment reconciliation does not revive a cancelled booking", () => {
    assertEquals(bookingStatusesAfterSuccessfulPayment({
        websiteStatus: "cancelled",
        crmStatus: "cancelled",
        paidAmountMinor: 10000,
        dueAmountMinor: 0,
        payableNowAmountMinor: 10000,
        totalAmountMinor: 10000,
    }), { websiteStatus: "cancelled", crmStatus: "cancelled" })
})

Deno.test("payment amount matching uses minor units and a small gateway tolerance", () => {
    assertEquals(isAmountMatch(2500, 2500), true)
    assertEquals(isAmountMatch(2501, 2500, 1), true)
    assertEquals(isAmountMatch(2550, 2500, 1), false)
})
