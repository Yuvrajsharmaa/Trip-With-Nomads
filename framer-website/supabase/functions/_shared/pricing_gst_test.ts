import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildPricingQuote } from "./pricing.ts"

Deno.test("winning coupon quote keeps GST inside the final trip total", () => {
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

    assertEquals(quote.taxable_amount, 800)
    assertEquals(quote.tax_amount, 40)
    assertEquals(quote.total_amount, 840)
})

Deno.test("payment-summary contract uses pre-GST trip cost and taxes the discounted amount", () => {
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

    // ₹18,000 - ₹900 discount = ₹17,100 taxable; GST is ₹855.
    assertEquals(quote.taxable_amount, 17100)
    assertEquals(quote.tax_amount, 855)
    assertEquals(quote.total_amount, 17955)

    const payableNow = Math.round(quote.total_amount * 0.25 * 100) / 100
    const dueAmount = Math.round((quote.total_amount - payableNow) * 100) / 100
    assertEquals(payableNow, 4488.75)
    assertEquals(dueAmount, 13466.25)
})
