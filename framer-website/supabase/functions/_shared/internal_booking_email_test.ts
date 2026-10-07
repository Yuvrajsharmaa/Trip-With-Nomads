import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  buildInternalBookingEmail,
  buildInternalNotificationEventKey,
  normalizeInternalNotificationRecipients,
} from "./internal_booking_email.ts"

const booking = {
  id: "booking-123",
  booking_ref: "TWN-2026-00123",
  name: "Guest User",
  email: "guest@example.com",
  phone: "+91 9876543210",
  departure_date: "2026-05-09",
  travellers: [
    { id: 1, name: "Guest User", sharing: "Double", transport: "SUV" },
    { id: 2, name: "A Guest", sharing: "Quad", transport: "Bike" },
    { id: 3, name: "Third Traveller", sharing: "Double", transport: "SUV" },
  ],
  payment_breakdown: [
    { count: 2, variant: "Double", transport: "SUV", price: 16000 },
    { count: 1, variant: "Quad", transport: "Bike", price: 6000 },
  ],
  subtotal_amount: 22000,
  discount_amount: 1000,
  coupon_code: "NOMAD10",
  tax_amount: 3780,
  total_amount: 24780,
  currency: "INR",
  payable_now_amount: 24780,
  paid_amount: 24780,
  due_amount: 0,
  payment_status: "paid",
  settlement_status: "fully_paid",
  payment_mode: "full",
  payment_provider: "razorpay",
  payment_gateway_txn_id: "pay_123",
  payment_gateway_payment_id: "pay_123",
  payment_gateway_order_or_ref_id: "order_123",
  payment_attempt_number: 1,
}

Deno.test("normalizes internal recipients without hardcoding them", () => {
  assertEquals(
    normalizeInternalNotificationRecipients(
      "support@tripwithnomads.com, yuvrajsharma6367@gmail.com; SUPPORT@TRIPWITHNOMADS.COM",
    ),
    ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"],
  )
  assertEquals(normalizeInternalNotificationRecipients(""), [])
})

Deno.test("builds a full internal booking snapshot", () => {
  const email = buildInternalBookingEmail({
    recipients: ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"],
    eventType: "payment_received",
    eventKey: "payment:booking-123:paid:fully_paid:pay_123",
    booking,
    tripTitle: "Summer Spiti",
    tripSlug: "summer-spiti",
    eventName: "payment.captured",
    eventId: "evt_123",
    statusUrl: "https://tripwithnomads.com/payment-success?booking_id=booking-123&status_token=token",
    occurredAt: "2026-10-07T10:30:00.000Z",
  })

  assert(email)
  assertEquals(email.to, ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"])
  assertEquals(email.subject, "[TWN] Payment received: Summer Spiti | TWN-2026-00123")
  assertStringIncludes(email.html, "Guest User")
  assertStringIncludes(email.html, "3 pax")
  assertStringIncludes(email.html, "2 x Double | SUV")
  assertStringIncludes(email.html, "₹24,780.00")
  assertStringIncludes(email.html, "pay_123")
  assertStringIncludes(email.html, "order_123")
  assertStringIncludes(email.html, "payment.captured")
  assertStringIncludes(email.html, "evt_123")
  assertStringIncludes(email.html, "payment-success?booking_id=booking-123")
  assertStringIncludes(email.text, "Phone: +91 9876543210")
})

Deno.test("builds a payment failure alert with actionable error context", () => {
  const email = buildInternalBookingEmail({
    recipients: ["support@tripwithnomads.com"],
    eventType: "payment_failed",
    eventKey: "payment:booking-123:failed:failed:pay_failed",
    booking: {
      ...booking,
      payment_status: "failed",
      settlement_status: "failed",
      paid_amount: 0,
      payment_gateway_txn_id: "pay_failed",
      payment_gateway_payment_id: "pay_failed",
    },
    tripTitle: "Summer Spiti",
    eventName: "payment.failed",
    eventId: "evt_failed",
    errorCode: "BAD_REQUEST_ERROR",
    errorMessage: "Payment was declined by the bank",
    retryUrl: "https://tripwithnomads.com/payment-failed?booking_id=booking-123&status_token=token",
  })

  assert(email)
  assertEquals(email.subject, "[TWN] Payment failed: Summer Spiti | TWN-2026-00123")
  assertStringIncludes(email.html, "BAD_REQUEST_ERROR")
  assertStringIncludes(email.html, "Payment was declined by the bank")
  assertStringIncludes(email.html, "Try payment again")
  assertStringIncludes(email.text, "payment-failed?booking_id=booking-123")
})

Deno.test("builds stable internal notification event keys", () => {
  assertEquals(
    buildInternalNotificationEventKey({
      eventType: "payment_received",
      bookingId: "booking-123",
      settlementStatus: "fully_paid",
      paymentId: "pay_123",
    }),
    "payment:booking-123:paid:fully_paid:pay_123",
  )
})
