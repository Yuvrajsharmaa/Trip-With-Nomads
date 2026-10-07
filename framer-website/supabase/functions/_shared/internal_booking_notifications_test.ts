import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  internalNotificationNeedsRetry,
  parseStoredInternalBookingEmailPayload,
  serializeInternalBookingEmailPayload,
} from "./internal_booking_notifications.ts"

const payload = {
  to: ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"],
  subject: "[TWN] Booking created: Summer Spiti | TWN-2026-00123",
  html: "<p>Booking created</p>",
  text: "Booking created",
  idempotencyKey: "internal-booking-created:booking-123:attempt-1",
}

Deno.test("internal notification payload round-trips with recipient arrays", () => {
  assertEquals(
    parseStoredInternalBookingEmailPayload(serializeInternalBookingEmailPayload(payload)),
    payload,
  )
})

Deno.test("internal notification retries pending and failed ledger rows", () => {
  assert(internalNotificationNeedsRetry({ status: "pending" }))
  assert(internalNotificationNeedsRetry({ status: "failed" }))
  assertEquals(internalNotificationNeedsRetry({ status: "sent" }), false)
  assertEquals(internalNotificationNeedsRetry({ status: "not_required" }), false)
})

Deno.test("internal notification payload rejects incomplete stored rows", () => {
  assertEquals(parseStoredInternalBookingEmailPayload({ ...payload, to: [] }), null)
  assertEquals(parseStoredInternalBookingEmailPayload({ ...payload, html: "" }), null)
  assertStringIncludes(
    String(parseStoredInternalBookingEmailPayload(payload)?.idempotencyKey),
    "booking-created",
  )
})
