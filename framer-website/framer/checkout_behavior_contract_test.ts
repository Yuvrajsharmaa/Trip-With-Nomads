import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

async function read(name: string): Promise<string> {
    return await Deno.readTextFile(new URL(`./${name}`, import.meta.url))
}

Deno.test("canonical checkout uses stable request ids, the active Razorpay gateway, and server totals", async () => {
    const source = await read("CheckoutPageOverrides.tsx")

    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "sessionStorage")
    assertStringIncludes(source, "crypto.randomUUID")
    assertStringIncludes(source, "Razorpay")
    assertStringIncludes(source, "payment_mode")
    assertStringIncludes(source, "settlement_status")
    assertStringIncludes(source, "isBookableDepartureDate")
    assertStringIncludes(source, "already_paid")
})

Deno.test("legacy booking modal is a checkout compatibility adapter", async () => {
    const source = await read("BookingOverrides.tsx")

    assert(!source.includes("const TAX_RATE = 0.02"))
    assert(!source.includes("/functions/v1/create-booking"))
    assertStringIncludes(source, "/checkout")
    assertStringIncludes(source, "sessionStorage")
})

Deno.test("status UI renders payment and settlement state from the signed response", async () => {
    const source = await read("BookingStatusOverride.tsx")

    assertStringIncludes(source, "payment_status")
    assertStringIncludes(source, "settlement_status")
    assert(!source.includes('params.get("payment_status")'))
    assert(!source.includes('searchParams.get("payment_status")'))
})
