import { assert, assertFalse } from "https://deno.land/std@0.168.0/testing/asserts.ts"

Deno.test("create-booking does not turn an order creation error into a payment failure", async () => {
    const source = await Deno.readTextFile(
        new URL("../create-booking/index.ts", import.meta.url),
    )

    assert(source.includes("Razorpay order creation failed"))
    assertFalse(
        /orderError[\s\S]{0,1400}payment_status:\s*["']failed["']/.test(source),
    )
})
