import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildPricingQuote, normalizeTravellers } from "./pricing.ts"

Deno.test("normalizes traveller gender when the website customer supplies it", () => {
    assertEquals(normalizeTravellers([{
        id: 1,
        name: "Asha Guest",
        gender: " Non-binary ",
        sharing: "Double",
        transport: "SUV",
    }]), [{
        id: 1,
        name: "Asha Guest",
        gender: "Non-binary",
        sharing: "Double",
        transport: "SUV",
    }])
})

Deno.test("website traveller pricing accepts a missing gender for CRM follow-up", () => {
    const [traveller] = normalizeTravellers([{
        id: 1,
        name: "Asha Guest",
        sharing: "Double",
        transport: "SUV",
    }])

    assertEquals(traveller, {
        id: 1,
        name: "Asha Guest",
        sharing: "Double",
        transport: "SUV",
    })
})

Deno.test("winning coupon quote keeps GST inside the final trip total and deducts coupon after tax", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 0,
        couponResult: {
            valid: true,
            code: "SAVE20",
            discount_type: "fixed",
            discount_value: 200,
            discount_amount: 200,
        },
        lineItems: [{
            traveller_id: 1,
            sharing: "Double",
            transport: "",
            unit_price: 1000,
        }],
    })

    assertEquals(quote.taxable_amount, 1000)
    assertEquals(quote.tax_amount, 50)
    assertEquals(quote.total_amount, 850)
})

Deno.test("payment-summary contract applies discount after GST to reconcile with CRM billing snapshots", () => {
    const quote = buildPricingQuote({
        // Total trip cost shown to the traveller: ₹18,000 before GST.
        baseSubtotal: 18000,
        earlyBirdDiscountAmount: 0,
        couponResult: {
            valid: true,
            code: "SAVE5",
            discount_type: "percent",
            discount_value: 5,
            discount_amount: 900,
        },
        lineItems: [{
            traveller_id: 1,
            sharing: "Double",
            transport: "",
            unit_price: 18000,
        }],
    })

    // GST is calculated on ₹18,000, then the ₹900 coupon is deducted.
    assertEquals(quote.taxable_amount, 18000)
    assertEquals(quote.tax_amount, 900)
    assertEquals(quote.total_amount, 18000)

    const payableNow = Math.round(quote.total_amount * 0.25 * 100) / 100
    const dueAmount = Math.round((quote.total_amount - payableNow) * 100) / 100
    assertEquals(payableNow, 4500)
    assertEquals(dueAmount, 13500)
})

Deno.test("NTC coupon quote includes GST and TCS using the CRM issuer policy", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 10000,
        earlyBirdDiscountAmount: 0,
        couponResult: {
            valid: true,
            code: "SAVE",
            discount_type: "fixed",
            discount_value: 1000,
            discount_amount: 1000,
        },
        lineItems: [{
            traveller_id: 1,
            sharing: "Double",
            transport: "SUV",
            unit_price: 10000,
        }],
        issuer: "NTC",
    })

    assertEquals(quote.taxable_amount, 10000)
    assertEquals(quote.tax_amount, 710)
    assertEquals(quote.total_amount, 9710)
})

Deno.test("only the best of early-bird and coupon discounts is applied", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 150,
        couponResult: {
            valid: true,
            code: "SAVE",
            discount_type: "fixed",
            discount_value: 100,
            discount_amount: 100,
        },
        lineItems: [{ traveller_id: 1, sharing: "Double", transport: "SUV", unit_price: 1000 }],
    })

    assertEquals(quote.applied_discount_source, "early_bird")
    assertEquals(quote.discount_amount_total, 150)
    assertEquals(quote.total_amount, 900)
})
