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

Deno.test("website checkout does not collect or send traveller gender", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))

    if (source.includes("aria-label={`Gender for traveller") || source.includes("TRAVELLER_GENDER_OPTIONS")) {
        throw new Error("Website checkout must not render a traveller gender field")
    }

    const submitStart = source.indexOf("const submit = async () =>")
    const submitEnd = source.indexOf("submitLockRef.current = true", submitStart)
    const submitGuards = source.slice(submitStart, submitEnd)
    if (submitGuards.includes(".gender")) {
        throw new Error("Website checkout must not validate traveller gender")
    }

    const travellerPayloadStart = source.indexOf("const normalizedTravellers = normalizeTravellers(store.travellers || [])")
    const travellerPayloadEnd = source.indexOf("const payload: any = {", travellerPayloadStart)
    const travellerPayload = source.slice(travellerPayloadStart, travellerPayloadEnd)
    if (/\bgender\s*:/.test(travellerPayload)) {
        throw new Error("Website checkout must not send traveller gender")
    }
})

Deno.test("early-bird winning over a coupon does not label the coupon as applied", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))
    const localPricing = source.slice(
        source.indexOf("function buildLocalPricingBreakdown"),
        source.indexOf("function normalizeTravellerTransport"),
    )

    assertStringIncludes(localPricing, 'applied_discount_code: appliedSource === "coupon"')
})
