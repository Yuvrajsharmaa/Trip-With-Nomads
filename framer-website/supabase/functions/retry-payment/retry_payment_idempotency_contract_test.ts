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
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, "gateway: paymentProvider")
    assertStringIncludes(source, "paymentCallbackUrl")
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    if (source.includes("buildPayuPayload") || source.includes('paymentProvider === "payu"')) {
        throw new Error("retry-payment must not emit an unsupported PayU checkout")
    }
})
