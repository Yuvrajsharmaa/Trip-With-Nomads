import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("create-booking persists a checkout request and replays its attempt", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "checkout_request_fingerprint")
    assertStringIncludes(source, "fingerprintBookingRequest")
    assertStringIncludes(source, "from(\"payment_attempts\")")
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, "!replayed")
    assertStringIncludes(source, "gateway: activeProvider")
    assertStringIncludes(source, "todayISTDateKey")
    assertStringIncludes(source, "computeBasePricing")
    assertStringIncludes(source, "already_paid")
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    assertStringIncludes(source, "BOOKING_CALLBACK_SHEET_ID")
    if (source.includes('Deno.env.get("GOOGLE_SHEET_ID_TRIPS")')) {
        throw new Error("create-booking must never use the trip-lead workbook as a booking Sheet fallback")
    }
    assertStringIncludes(source, "key_id: credentials.keyId")
    if (source.includes("key: credentials.keyId")) {
        throw new Error("create-booking must return the key_id field consumed by the checkout client")
    }
    if (source.includes('activeProvider === "payu"') || source.includes("responsePayload.payu")) {
        throw new Error("create-booking must not emit an unsupported PayU checkout")
    }
})
