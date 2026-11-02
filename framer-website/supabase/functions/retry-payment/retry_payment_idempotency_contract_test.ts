import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry-payment requires a retry key and persists payment attempts", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "retry_request_id")
    assertStringIncludes(source, "normalizeIdempotencyKey")
    assertStringIncludes(source, "canStartPaymentRetry")
    assertStringIncludes(source, "canReplayPaymentAttempt")
    assertStringIncludes(source, "isStalePaymentAttempt")
    assertStringIncludes(source, 'status: "pending"')
    assertStringIncludes(source, "mayCreateOrder = !replayed")
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
    const replayOrderRecovery = source.indexOf("const recovered = await recoverPaymentAttemptForRetry({")
    const replayAttemptGuard = source.indexOf("canReplayPaymentAttempt(replayAttempt, booking")
    if (replayOrderRecovery < 0 || replayAttemptGuard < 0 || replayOrderRecovery > replayAttemptGuard) {
        throw new Error("retry-payment must recover a missing provider order before rejecting a stale replay")
    }
    assertStringIncludes(source, "let replayed = Boolean(reusableAttempt)")
    assertStringIncludes(source, "PAYMENT_RECONCILIATION_PENDING")
    assertStringIncludes(source, '.or("payment_status.is.null,payment_status.neq.paid")')
    assertStringIncludes(
        source,
        "idempotencyKey: retryRequestId,",
    )
    const failedOrderReconciliation = source.indexOf("isRazorpayOrderConfirmedUnpaid({")
    const attemptReservationCall = source.indexOf('schema("crm").rpc("reserve_website_booking_payment_attempt"')
    if (failedOrderReconciliation < 0 || attemptReservationCall < 0 || failedOrderReconciliation > attemptReservationCall) {
        throw new Error("retry-payment must confirm a failed provider order is unpaid before creating a fresh attempt")
    }
    assertStringIncludes(source, 'code: "PAYMENT_ATTEMPT_FINISHED"')
    assertStringIncludes(source, 'code: "PAYMENT_ORDER_IN_PROGRESS"')
    assertStringIncludes(source, "from(\"payment_attempts\")")
    assertStringIncludes(source, "attempt_no")
    assertStringIncludes(source, 'schema("crm").rpc("reserve_website_booking_payment_attempt"')
    assertStringIncludes(source, "PAYMENT_ATTEMPT_STARTING")
    assertStringIncludes(source, "p_expected_booking_updated_at: booking.updated_at")
    assertStringIncludes(source, 'p_status: "pending"')
    assertStringIncludes(source, "expectedPaymentAmountMinor")
    assertStringIncludes(source, "expectedBookingPaymentAmountMinor(booking)")
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, 'sqlState === "23514"')
    assertStringIncludes(source, '"PAYMENT_ATTEMPT_CONFLICT"')
    assertStringIncludes(source, '}, conflict ? 409 : 500)')
    assertStringIncludes(source, "gateway: paymentProvider")
    assertStringIncludes(source, "paymentCallbackUrl")
    const existingReplayGuard = source.indexOf("canReplayPaymentAttempt(replayAttempt, booking")
    const existingOrderBuild = source.indexOf("const existingGateway = await buildRazorpayPayload")
    if (existingReplayGuard < 0 || existingReplayGuard > existingOrderBuild) {
        throw new Error("retry-payment must validate and reuse the same active attempt before rebuilding a gateway payload")
    }
    const reservationReplayGuard = source.indexOf("if (replayed && !String(paymentAttempt.provider_order_id")
    const reservationGatewayBuild = source.indexOf("gateway = await buildRazorpayPayload")
    if (reservationReplayGuard >= 0 || reservationGatewayBuild < 0) {
        throw new Error("retry-payment must let the shared receipt-recovery helper resolve a replay without a saved provider order")
    }
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    if (source.includes("buildPayuPayload") || source.includes('paymentProvider === "payu"')) {
        throw new Error("retry-payment must not emit an unsupported PayU checkout")
    }
})
