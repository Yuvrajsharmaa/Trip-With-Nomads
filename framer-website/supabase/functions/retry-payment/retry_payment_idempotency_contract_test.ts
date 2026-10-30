import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry-payment requires a retry key and persists payment attempts", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "retry_request_id")
    assertStringIncludes(source, "normalizeIdempotencyKey")
    assertStringIncludes(source, "canStartPaymentRetry")
    assertStringIncludes(source, "canReplayPaymentAttempt")
    assertStringIncludes(source, "isStalePaymentAttempt")
    assertStringIncludes(source, 'status: "expired"')
    assertStringIncludes(source, "from(\"payment_attempts\")")
    assertStringIncludes(source, "attempt_no")
    assertStringIncludes(source, 'schema("crm").rpc("reserve_website_booking_payment_attempt"')
    assertStringIncludes(source, "PAYMENT_ATTEMPT_STARTING")
    assertStringIncludes(source, "p_expected_booking_updated_at: booking.updated_at")
    assertStringIncludes(source, "expectedPaymentAmountMinor")
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, 'sqlState === "23514"')
    assertStringIncludes(source, '"PAYMENT_ATTEMPT_CONFLICT"')
    assertStringIncludes(source, '}, conflict ? 409 : 500)')
    assertStringIncludes(source, "gateway: paymentProvider")
    assertStringIncludes(source, "paymentCallbackUrl")
    const existingReplayGuard = source.indexOf("canReplayPaymentAttempt(existingRequest.data, booking")
    const existingOrderBuild = source.indexOf("const existingGateway = await buildRazorpayPayload")
    if (existingReplayGuard < 0 || existingReplayGuard > existingOrderBuild) {
        throw new Error("retry-payment must validate and reuse the same active attempt before rebuilding a gateway payload")
    }
    const reservationReplayGuard = source.indexOf("PAYMENT_ATTEMPT_STARTING", existingOrderBuild)
    const reservationGatewayBuild = source.indexOf("gateway = await buildRazorpayPayload", existingOrderBuild)
    if (reservationReplayGuard < 0 || reservationReplayGuard > reservationGatewayBuild) {
        throw new Error("retry-payment must not create a second provider order while the first request is being prepared")
    }
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    if (source.includes("buildPayuPayload") || source.includes('paymentProvider === "payu"')) {
        throw new Error("retry-payment must not emit an unsupported PayU checkout")
    }
})
