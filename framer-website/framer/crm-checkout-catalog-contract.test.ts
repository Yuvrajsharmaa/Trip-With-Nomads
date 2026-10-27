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

Deno.test("checkout lets customers continue without traveller gender", async () => {
    const source = await Deno.readTextFile(new URL("./CheckoutPageOverrides.tsx", import.meta.url))

    assertStringIncludes(source, "gender: String(t.gender || \"\").trim()")
    assertStringIncludes(source, "traveller.gender || \"\"")
    assertStringIncludes(source, "Gender (optional)")
    const genderFieldStart = source.indexOf("aria-label={`Gender for traveller")
    const genderFieldEnd = source.indexOf("</select>", genderFieldStart)
    const genderField = source.slice(genderFieldStart, genderFieldEnd)
    if (/aria-required="true"|\brequired\b/.test(genderField)) {
        throw new Error("Website traveller gender must remain optional")
    }

    const submitStart = source.indexOf("const submit = async () =>")
    const submitEnd = source.indexOf("submitLockRef.current = true", submitStart)
    const submitGuards = source.slice(submitStart, submitEnd)
    if (submitGuards.includes(".gender")) {
        throw new Error("Website checkout must not block on gender; Sales collects it in CRM")
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
