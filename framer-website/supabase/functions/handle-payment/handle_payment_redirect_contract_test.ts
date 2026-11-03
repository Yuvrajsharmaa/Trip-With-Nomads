import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("handle-payment is redirect-only", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "Response.redirect")
    assertStringIncludes(source, "isPaymentFailureCallback")
    assertStringIncludes(source, "\"/payment-failed\"")
    assert(!source.includes(".from(\"bookings\")"))
    assert(!source.includes("appendRow("))
    assert(!source.includes('searchParams.set("payment_status"'))
    assert(!source.includes("callback_orphan"))
})
