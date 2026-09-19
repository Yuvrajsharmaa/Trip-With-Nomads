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
