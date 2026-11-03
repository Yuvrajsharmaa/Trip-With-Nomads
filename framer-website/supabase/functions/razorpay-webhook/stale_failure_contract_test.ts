import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook ignores failed payments superseded by a retry", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "isSupersededPaymentFailure")
    assertStringIncludes(source, '"ignored_superseded_payment_failure"')
    assertStringIncludes(source, 'processing_status: "ignored"')
    const ignoredClaim = source.slice(
        source.indexOf('if (processing === "ignored")'),
        source.indexOf('if (processing === "applied")'),
    )
    assertStringIncludes(ignoredClaim, 'emailStatus !== "sent"')
    const reconciliation = source.slice(
        source.indexOf("async function reconcilePayment"),
        source.indexOf("function bookingSheetId"),
    )
    assertStringIncludes(reconciliation, 'rpc("reconcile_website_payment_failure"')
    assertStringIncludes(reconciliation, "Atomic payment failure reconciliation returned an invalid result")
    assertEquals(
        reconciliation.indexOf('rpc("reconcile_website_payment_failure"') <
            reconciliation.indexOf('.from("payment_attempts")'),
        true,
    )

    const earlyDuplicateGate = source.indexOf("await suppressSupersededPaymentRecovery(supabase, eventRow)")
    assertEquals(earlyDuplicateGate < source.indexOf('if (claim === "sheet")'), true)
    assertEquals(earlyDuplicateGate < source.indexOf('if (claim === "email")'), true)
    assertStringIncludes(source, 'current attempt could not be verified before failure email')
    assertStringIncludes(source, 'processing_status: "ignored"')
    assertStringIncludes(source, "failureEvent && await suppressSupersededPaymentRecovery(params.supabase, eventRow)")

    const sheetBranch = source.indexOf('if (claim === "sheet")')
    const sheetGate = source.indexOf("if (await suppressSupersededPaymentRecovery(supabase, eventRow))", sheetBranch)
    const sheetRetry = source.indexOf("await syncPaymentSheets({", sheetBranch)
    assertEquals(sheetGate < sheetRetry, true)

    const emailGate = source.indexOf("failureEvent && await suppressSupersededPaymentRecovery(params.supabase, eventRow)")
    const emailSend = source.indexOf("const result = await sendResendEmail(payload)")
    assertEquals(emailGate < emailSend, true)

    const internalGate = source.indexOf("const supersededAttempt = await findSupersededPaymentAttempt(params.supabase, eventRow)")
    const internalSend = source.indexOf("const internalStatus = await deliverInternalBookingNotification({")
    assertEquals(internalGate < internalSend, true)
})
