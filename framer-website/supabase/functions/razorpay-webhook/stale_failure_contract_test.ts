import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook ignores failed payments superseded by a retry", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "isSupersededPaymentFailure")
    assertStringIncludes(source, '"superseded_payment_ids"')
    assertStringIncludes(source, '"status,provider_payment_id,superseded_payment_ids"')
    assertStringIncludes(source, '"ignored_superseded_payment_failure"')
    assertStringIncludes(source, 'processing_status: "ignored"')
    assertStringIncludes(source, '.or(`provider_payment_id.is.null,provider_payment_id.neq.${params.paymentId}`)')

    const earlyDuplicateGate = source.indexOf("await suppressSupersededPaymentRecovery(supabase, eventRow)")
    assertEquals(earlyDuplicateGate < source.indexOf('if (claim === "sheet")'), true)
    assertEquals(earlyDuplicateGate < source.indexOf('if (claim === "email")'), true)
    assertStringIncludes(source, 'current attempt could not be verified before failure email')
    assertStringIncludes(source, 'processing_status: "ignored"')
})
