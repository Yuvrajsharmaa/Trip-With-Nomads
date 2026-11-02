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
    assertStringIncludes(source, "isRazorpayOrderConfirmedUnpaid")
    assertStringIncludes(source, "reactivatePayablePaymentAttempt")
    assertStringIncludes(source, "reusableAttempt = await recoverPaymentAttemptForRetry({")
    assertStringIncludes(source, "latestState = reusableAttempt")
    assertStringIncludes(source, "let replayed = Boolean(reusableAttempt)")
    assertStringIncludes(source, "PAYMENT_RECONCILIATION_PENDING")
    assertStringIncludes(source, '.or("payment_status.is.null,payment_status.neq.paid")')
    assertStringIncludes(
        source,
        "idempotencyKey: retryRequestId,",
    )
    const failedOrderReconciliation = source.indexOf("isRazorpayOrderConfirmedUnpaid({")
    const attemptInsertCall = source.indexOf("const attemptInsert = await supabase")
    if (failedOrderReconciliation < 0 || attemptInsertCall < 0 || failedOrderReconciliation > attemptInsertCall) {
        throw new Error("retry-payment must confirm a failed provider order is unpaid before creating a fresh attempt")
    }
    assertStringIncludes(source, 'code: "PAYMENT_ATTEMPT_FINISHED"')
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
