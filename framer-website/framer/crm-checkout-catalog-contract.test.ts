import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("checkout gets prices and billing issuer from the shared CRM catalogue endpoint", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))

    assertStringIncludes(source, "fetchTripDisplayPrice({ tripId })")
    assertStringIncludes(source, "pricingPayload?.pricing_rows")
    assertStringIncludes(source, "pricingPayload?.finance_issuer")
    assertStringIncludes(source, "calculateWebsiteBookingTotals")
    if (source.includes("function fetchTripPricing")) {
        throw new Error("Checkout must not read the legacy public.trip_pricing table")
    }
    if (source.includes("/rest/v1/trip_pricing")) {
        throw new Error("Checkout must not read the legacy public.trip_pricing table")
    }
})

Deno.test("checkout records traveller gender for CRM booking readiness", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))

    assertStringIncludes(source, "aria-label={`Gender for traveller ${index + 1}`}")
    assertStringIncludes(source, "gender: String(t.gender || \"\").trim()")
    assertStringIncludes(source, "traveller.gender || \"\"")
    assertStringIncludes(source, "Complete each traveller's name and gender")
})

Deno.test("early-bird winning over a coupon does not label the coupon as applied", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))
    const localPricing = source.slice(
        source.indexOf("function buildLocalPricingBreakdown"),
        source.indexOf("function normalizeTravellerTransport"),
    )

    assertStringIncludes(localPricing, 'applied_discount_code: appliedSource === "coupon"')
})
