import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook ignores failed payments superseded by a retry", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "isSupersededPaymentFailure")
    assertStringIncludes(source, '"superseded_payment_ids"')
    assertStringIncludes(source, '"ignored_superseded_payment_failure"')
    assertStringIncludes(source, 'processing_status: "ignored"')
})
