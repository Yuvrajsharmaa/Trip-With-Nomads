import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { normalizeResendRecipients } from "./resend.ts"

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
