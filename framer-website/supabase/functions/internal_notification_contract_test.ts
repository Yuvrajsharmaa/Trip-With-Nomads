import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("booking and payment handlers cover the internal notification scenarios", async () => {
  const files = [
    new URL("./create-booking/index.ts", import.meta.url),
    new URL("./retry-payment/index.ts", import.meta.url),
    new URL("./razorpay-webhook/index.ts", import.meta.url),
    new URL("./_shared/internal_booking_email.ts", import.meta.url),
  ]
  const source = (await Promise.all(files.map((file) => Deno.readTextFile(file)))).join("\n")
  for (const scenario of [
    '"booking_created"',
    '"booking_setup_failed"',
    '"payment_retry_started"',
    '"payment_retry_failed"',
    '"payment_received"',
    '"advance_received"',
    '"payment_failed"',
    '"reconciliation_alert"',
  ]) {
    assertStringIncludes(source, scenario)
  }
  assertStringIncludes(source, "BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS")
  assertStringIncludes(source, "deliverInternalBookingNotification")
  assertStringIncludes(source, "Razorpay payment amount")
  assertStringIncludes(source, "retry_request_id")
})
