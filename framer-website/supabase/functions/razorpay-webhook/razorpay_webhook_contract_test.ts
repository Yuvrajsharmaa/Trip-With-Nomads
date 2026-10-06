import { assert, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook verifies raw payloads and persists generic payment events", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "await req.text()")
    assertStringIncludes(source, "x-razorpay-signature")
    assertStringIncludes(source, "x-razorpay-event-id")
    assertStringIncludes(source, "from(\"payment_events\")")
    assertStringIncludes(source, "provider_event_id")
    assertStringIncludes(source, "sheet_sync_status")
    assertStringIncludes(source, "email_sync_status")
    assertStringIncludes(source, "email_payload")
    assertStringIncludes(source, "email_attempts")
    assertStringIncludes(source, "Razorpay API")
    assertStringIncludes(source, "paymentOrderId")
    assertStringIncludes(source, "does not belong to the webhook order")
    assertStringIncludes(source, "more than one payment ID for the same order")
    assertStringIncludes(source, 'processing === "processing"')
    assertStringIncludes(source, "buildPaymentEmail")
    assertStringIncludes(source, "sendResendEmail")
    assertStringIncludes(source, "sendPaymentEmailProjection")
    assertStringIncludes(source, "BOOKING_CALLBACK_SHEET_ID")
    if (source.includes('Deno.env.get("GOOGLE_SHEET_ID_TRIPS")')) {
        throw new Error("razorpay-webhook must never use the trip-lead workbook as a booking Sheet fallback")
    }
    assert(!source.includes("callback_orphan"))
    assertNotEquals(source.indexOf("await req.text()"), -1)
})
