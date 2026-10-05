import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("create-booking persists a checkout request and replays its attempt", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "checkout_request_fingerprint")
    assertStringIncludes(source, "fingerprintBookingRequest")
    assertStringIncludes(source, "from(\"payment_attempts\")")
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, "!replayed")
})
