import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry-payment requires a retry key and persists payment attempts", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "retry_request_id")
    assertStringIncludes(source, "normalizeIdempotencyKey")
    assertStringIncludes(source, "canStartPaymentRetry")
    assertStringIncludes(source, "isStalePaymentAttempt")
    assertStringIncludes(source, 'status: "expired"')
    assertStringIncludes(source, "from(\"payment_attempts\")")
    assertStringIncludes(source, "attempt_no")
    assertStringIncludes(source, 'schema("crm").rpc("reserve_website_booking_payment_attempt"')
    assertStringIncludes(source, "p_expected_booking_updated_at: booking.updated_at")
    assertStringIncludes(source, "expectedPaymentAmountMinor")
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, 'sqlState === "23514"')
    assertStringIncludes(source, '"PAYMENT_ATTEMPT_CONFLICT"')
    assertStringIncludes(source, '}, conflict ? 409 : 500)')
    assertStringIncludes(source, "gateway: paymentProvider")
    assertStringIncludes(source, "paymentCallbackUrl")
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    if (source.includes("buildPayuPayload") || source.includes('paymentProvider === "payu"')) {
        throw new Error("retry-payment must not emit an unsupported PayU checkout")
    }
})
