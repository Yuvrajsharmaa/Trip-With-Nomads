import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isResendIdempotencyConflict, normalizeResendRecipients } from "./resend.ts"

Deno.test("normalizes and deduplicates Resend recipient lists", () => {
  assertEquals(
    normalizeResendRecipients([
      " Support@TripWithNomads.com ",
      "yuvrajsharma6367@gmail.com",
      "support@tripwithnomads.com",
      "not-an-email",
    ]),
    ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"],
  )
})

Deno.test("recognizes an already-accepted Resend idempotency conflict", () => {
  assertEquals(
    isResendIdempotencyConflict(
      new Error('Resend API 409: {"name":"invalid_idempotent_request"}'),
    ),
    true,
  )
  assertEquals(isResendIdempotencyConflict(new Error("Resend API 500")), false)
})
