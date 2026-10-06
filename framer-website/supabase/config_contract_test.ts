import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook is configured for signature verification without JWT", async () => {
    const source = await Deno.readTextFile(new URL("./config.toml", import.meta.url))
    assertStringIncludes(source, "[functions.razorpay-webhook]")
    assertStringIncludes(source, "verify_jwt = false")
})
