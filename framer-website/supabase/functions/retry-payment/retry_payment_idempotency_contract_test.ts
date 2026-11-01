import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry-payment requires a retry key and persists payment attempts", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "retry_request_id")
    assertStringIncludes(source, "normalizeIdempotencyKey")
    assertStringIncludes(source, "canStartPaymentRetry")
    assertStringIncludes(source, "isStalePaymentAttempt")
    assertStringIncludes(source, 'status: "creating"')
    assertStringIncludes(source, "mayCreateOrder = Boolean(attemptInsert.data)")
    const paymentCredentialCheck = source.indexOf(
        "retryPaymentCredentials = retryPaymentCredentials || razorpayCredentials()",
    )
    const paymentAttemptInsert = source.indexOf(
        "const attemptPayload = buildPaymentAttemptInsert({",
    )
    if (paymentCredentialCheck < 0 || paymentAttemptInsert < 0 || paymentCredentialCheck > paymentAttemptInsert) {
        throw new Error("retry-payment must validate Razorpay credentials before creating a payment attempt")
    }
    assertStringIncludes(source, "isCompatiblePaymentAttemptReplay")
    assertStringIncludes(source, "ensurePaymentAttemptOrder")
    assertStringIncludes(source, "reactivatePayablePaymentAttempt")
    assertStringIncludes(source, "PAYMENT_RECONCILIATION_PENDING")
    assertStringIncludes(source, '.or("payment_status.is.null,payment_status.neq.paid")')
    assertStringIncludes(
        source,
        "idempotencyKey: retryRequestId,",
    )
    const existingOrderReconciliation = source.indexOf("reactivatePayablePaymentAttempt({")
    const attemptInsertCall = source.indexOf("const attemptInsert = await supabase")
    if (existingOrderReconciliation < 0 || attemptInsertCall < 0 || existingOrderReconciliation > attemptInsertCall) {
        throw new Error("retry-payment must reconcile and reuse an existing provider order before creating another attempt")
    }
    assertStringIncludes(source, 'code: "PAYMENT_ORDER_IN_PROGRESS"')
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
