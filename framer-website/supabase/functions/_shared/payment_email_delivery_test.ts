import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  classifyEmailDeliveryResult,
  emailProjectionNeedsRetry,
  parseStoredPaymentEmailPayload,
  safeEmailProjectionError,
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
})

Deno.test("email projection retries pending and failed events only", () => {
  assert(emailProjectionNeedsRetry({ email_sync_status: "pending" }))
  assert(emailProjectionNeedsRetry({ email_sync_status: "failed" }))
  assertEquals(emailProjectionNeedsRetry({ email_sync_status: "sent" }), false)
  assertEquals(emailProjectionNeedsRetry({ email_sync_status: "not_required" }), false)
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
