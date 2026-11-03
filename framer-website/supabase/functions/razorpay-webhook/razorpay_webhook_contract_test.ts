import { assert, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook verifies raw payloads and persists generic payment events", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "await req.text()")
    assertStringIncludes(source, "x-razorpay-signature")
    assertStringIncludes(source, "x-razorpay-event-id")
    assertStringIncludes(source, "from(\"payment_events\")")
    assertStringIncludes(source, "provider_event_id")
    assertStringIncludes(source, "sheet_sync_status")
    assertStringIncludes(source, 'from("payment_event_sheet_rows")')
    assertStringIncludes(source, "mappedHistory?.tab_name")
    assertStringIncludes(source, "configuration_missing")
    assertStringIncludes(source, "SHEET_CONFIGURATION_MISSING")
    assertStringIncludes(source, "Booking Sheet projection configuration is missing or disabled")
    assertStringIncludes(source, "email_sync_status")
    assertStringIncludes(source, 'email_sync_status: "not_required"')
    assertStringIncludes(source, 'email_sync_status: paymentApplied')
    assertStringIncludes(source, 'processing === "ignored"')
    assertStringIncludes(source, 'email_error: null')
    assertStringIncludes(source, "email_payload")
    assertStringIncludes(source, "email_attempts")
    assertStringIncludes(source, "Razorpay API")
    assertStringIncludes(source, "paymentOrderId")
    assertStringIncludes(source, "does not belong to the webhook order")
    assertStringIncludes(source, "more than one payment ID for the same order")
    assertStringIncludes(source, "paymentAttemptMatchesBookingOrder")
    assertStringIncludes(source, "bookingStatusesAfterSuccessfulPayment")
    assertStringIncludes(source, '.from("booking_details")')
    assertStringIncludes(source, 'update({ booking_status: successfulPaymentStatuses.crmStatus })')
    assertStringIncludes(source, 'rpc("reconcile_website_payment_failure"')
    assertStringIncludes(source, "shouldSuppressFailurePaymentEmail")
    assertStringIncludes(source, 'processing === "processing"')
    assertStringIncludes(source, "buildPaymentEmail")
    assertStringIncludes(source, "sendResendEmail")
    assertStringIncludes(source, "sendPaymentEmailProjection")
    assertStringIncludes(source, "shouldSuppressFailurePaymentEmailForCurrentBooking")
    assertStringIncludes(source, "BOOKING_CALLBACK_SHEET_ID")
    const eventSnapshot = source.indexOf("email_previous_state: emailPreviousState")
    const reconcile = source.indexOf("const reconciliation = await reconcilePayment")
    if (eventSnapshot < 0 || reconcile < 0 || eventSnapshot > reconcile) {
        throw new Error("Webhook email state must be persisted before payment state is reconciled")
    }
    if (source.slice(reconcile).includes("email_previous_state: previousPaymentState(booking)")) {
        throw new Error("Webhook replay must retain the payment email snapshot captured before reconciliation")
    }
    const sheetFailureReturn = source.indexOf(
        'return jsonResponse({ error: "Payment applied; Sheet projection failed" }, 500)',
        reconcile,
    )
    const paymentEmailProjection = source.indexOf(
        "const emailDelivered = await sendPaymentEmailProjection(",
        reconcile,
    )
    const failureEmailDispatchGuard = source.indexOf(
        "failureNowPaid = await shouldSuppressFailurePaymentEmailForCurrentBooking(",
        source.indexOf("async function sendPaymentEmailProjection"),
    )
    const emailSend = source.indexOf("await sendResendEmail(payload)", failureEmailDispatchGuard)
    if (failureEmailDispatchGuard < 0 || emailSend < failureEmailDispatchGuard) {
        throw new Error("Failure email dispatch must recheck the current booking payment state")
    }
    if (sheetFailureReturn >= 0 && sheetFailureReturn < paymentEmailProjection) {
        throw new Error("Sheet projection failure must not skip customer payment email delivery")
    }
    const sheetRetryStart = source.indexOf('if (claim === "sheet")')
    const emailRetryStart = source.indexOf('if (claim === "email")', sheetRetryStart)
    const sheetRetry = source.slice(sheetRetryStart, emailRetryStart)
    const retrySheetFailureReturn = sheetRetry.indexOf(
        'return jsonResponse({ error: "Payment applied; Sheet projection failed" }, 500)',
    )
    const retryEmailProjection = sheetRetry.indexOf("const emailDelivered = await sendPaymentEmailProjection(")
    if (retrySheetFailureReturn >= 0 && retrySheetFailureReturn < retryEmailProjection) {
        throw new Error("Sheet retry failure must not skip the pending customer payment email")
    }
    if (source.includes('Deno.env.get("GOOGLE_SHEET_ID_TRIPS")')) {
        throw new Error("razorpay-webhook must never use the trip-lead workbook as a booking Sheet fallback")
    }
    assert(!source.includes("callback_orphan"))
    assert(!source.includes('sheet_sync_status: synced ? "synced" : "not_required"'))
    assertNotEquals(source.indexOf("await req.text()"), -1)
})
