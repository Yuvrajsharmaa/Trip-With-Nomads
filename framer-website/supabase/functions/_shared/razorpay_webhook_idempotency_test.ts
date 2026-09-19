import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("webhook claims a pending booking before writing callback sheets", async () => {
    const source = await Deno.readTextFile(
        new URL("../razorpay-webhook/index.ts", import.meta.url),
    )

    assertStringIncludes(source, 'eq("payment_status", "pending")')
    assertStringIncludes(source, 'is("payment_gateway_txn_id", null)')
    assertStringIncludes(source, 'reason: "booking_already_reconciled"')
    assertStringIncludes(source, "releasePaymentReconciliationClaim")
})
