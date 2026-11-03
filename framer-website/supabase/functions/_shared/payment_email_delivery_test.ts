import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  classifyEmailDeliveryResult,
  emailProjectionNeedsRetry,
  parseStoredPaymentEmailPayload,
  safeEmailProjectionError,
  shouldSuppressFailurePaymentEmailForCurrentBooking,
  shouldSuppressFailurePaymentEmail,
  shouldSuppressStalePartialPaymentEmailForCurrentBooking,
  serializePaymentEmailPayload,
} from "./payment_email_delivery.ts"

const payload = {
  to: "guest@example.com",
  subject: "Booking confirmed",
  html: "<p>Paid</p>",
  text: "Paid",
  idempotencyKey: "payment-event:event-1:guest@example.com",
  headers: { "List-Unsubscribe": "<mailto:support@example.com>" },
}

Deno.test("stored payment email payload round-trips with headers", () => {
  assertEquals(parseStoredPaymentEmailPayload(serializePaymentEmailPayload(payload)), payload)
  const partial = { ...payload, settlementStatus: "partially_paid" }
  assertEquals(parseStoredPaymentEmailPayload(serializePaymentEmailPayload(partial)), partial)
})

Deno.test("email projection retries pending and failed events only", () => {
  assert(emailProjectionNeedsRetry({ email_sync_status: "pending" }))
  assert(emailProjectionNeedsRetry({ email_sync_status: "failed" }))
  assertEquals(emailProjectionNeedsRetry({ email_sync_status: "sent" }), false)
  assertEquals(emailProjectionNeedsRetry({ email_sync_status: "not_required" }), false)
})

Deno.test("a queued failure email is suppressed after the booking is paid", () => {
  assertEquals(shouldSuppressFailurePaymentEmail("payment.failed", "paid"), true)
  assertEquals(shouldSuppressFailurePaymentEmail("payment.failed", "succeeded"), true)
  assertEquals(shouldSuppressFailurePaymentEmail("payment.failed", "failed"), false)
  assertEquals(shouldSuppressFailurePaymentEmail("payment.captured", "paid"), false)
})

Deno.test("a stale failure snapshot is suppressed when the booking is paid before dispatch", async () => {
  let queriedBookingId = ""
  const supabase = {
    from(table: string) {
      assertEquals(table, "bookings")
      return {
        select(columns: string) {
          assertEquals(columns, "payment_status")
          return this
        },
        eq(column: string, value: string) {
          assertEquals(column, "id")
          queriedBookingId = value
          return this
        },
        async maybeSingle() {
          return { data: { payment_status: "paid" }, error: null }
        },
      }
    },
  }

  assertEquals(await shouldSuppressFailurePaymentEmailForCurrentBooking({
    supabase,
    eventName: "payment.failed",
    booking: { id: "booking-1", payment_status: "failed" },
  }), true)
  assertEquals(queriedBookingId, "booking-1")
})

Deno.test("a stored advance email is suppressed after the current booking is fully settled", async () => {
  const payload = {
    to: "guest@example.com",
    subject: "Advance received: Summer Spiti",
    html: "<p>Bank details</p>",
    text: "Bank details",
    idempotencyKey: "payment-partial",
    settlementStatus: "partially_paid",
  }
  let selected = ""
  const supabase = {
    from(table: string) {
      assertEquals(table, "bookings")
      return {
        select(columns: string) {
          selected = columns
          return this
        },
        eq() {
          return this
        },
        async maybeSingle() {
          return {
            data: { payment_status: "paid", settlement_status: "fully_paid", due_amount: 0 },
            error: null,
          }
        },
      }
    },
  }

  assertEquals(await shouldSuppressStalePartialPaymentEmailForCurrentBooking({
    supabase,
    booking: { id: "booking-1" },
    payload,
  }), true)
  assertEquals(selected, "payment_status, settlement_status, due_amount")
})

Deno.test("legacy advance email payloads are recognized without settlement metadata", async () => {
  let booking: Record<string, unknown> = { payment_status: "paid", settlement_status: "fully_paid", due_amount: 0 }
  const supabase = {
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        async maybeSingle() {
          return { data: booking, error: null }
        },
      }
    },
  }

  assertEquals(await shouldSuppressStalePartialPaymentEmailForCurrentBooking({
    supabase,
    booking: { id: "booking-1" },
    payload: { ...payload, subject: "Advance received: Summer Spiti" },
  }), true)
  booking = { payment_status: "paid", settlement_status: "partially_paid", due_amount: 100 }
  assertEquals(await shouldSuppressStalePartialPaymentEmailForCurrentBooking({
    supabase,
    booking: { id: "booking-1" },
    payload: { ...payload, subject: "Advance received: Summer Spiti" },
  }), false)
  booking = { payment_status: "paid", settlement_status: "partially_paid", due_amount: null }
  assertEquals(await shouldSuppressStalePartialPaymentEmailForCurrentBooking({
    supabase,
    booking: { id: "booking-1" },
    payload: { ...payload, subject: "Advance received: Summer Spiti" },
  }), false)
})

Deno.test("email delivery result is durable and distinguishes provider success from failure", () => {
  assertEquals(
    classifyEmailDeliveryResult({ sent: true, skipped: false, providerId: "msg_123" }, true),
    { status: "sent", error: null, providerId: "msg_123" },
  )
  assertEquals(
    classifyEmailDeliveryResult({ sent: false, skipped: true, reason: "missing_api_key" }, true),
    { status: "failed", error: "missing_api_key", providerId: null },
  )
  assertEquals(
    classifyEmailDeliveryResult({ sent: false, skipped: true, reason: "no_recipient" }, false),
    { status: "not_required", error: null, providerId: null },
  )
})

Deno.test("email projection errors are safe and bounded", () => {
  assertEquals(safeEmailProjectionError(new Error("provider unavailable")), "provider unavailable")
  assert(safeEmailProjectionError("x".repeat(600)).length <= 500)
})
