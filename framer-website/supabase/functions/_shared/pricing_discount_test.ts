import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    buildPricingQuote,
    resolveAppliedCouponCode,
    type CouponValidationResult,
} from "./pricing.ts"

const lineItems = [{
    traveller_id: 1,
    sharing: "Double" as const,
    transport: "Volvo",
    unit_price: 1000,
}]

function coupon(discountAmount: number, code = "SAVE20"): CouponValidationResult {
    return {
        valid: true,
        code,
        discount_type: "fixed",
        discount_value: discountAmount,
        discount_amount: discountAmount,
    }
}

Deno.test("best discount only reports the coupon when the coupon wins", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 100,
        couponResult: coupon(200),
        lineItems,
    })

    assertEquals(quote.applied_discount_source, "coupon")
    assertEquals(quote.applied_discount_code, "SAVE20")
    assertEquals(quote.discount_amount_total, 200)
    assertEquals(quote.coupon_discount_amount, 200)
    assertEquals(quote.early_bird_discount_amount, 0)
})

Deno.test("best discount only reports early bird when early bird wins", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 300,
        couponResult: coupon(200),
        lineItems,
    })

    assertEquals(quote.applied_discount_source, "early_bird")
    assertEquals(quote.applied_discount_code, null)
    assertEquals(quote.discount_amount_total, 300)
    assertEquals(quote.coupon_discount_amount, 0)
    assertEquals(quote.early_bird_discount_amount, 300)
})

Deno.test("invalid or empty coupon contributes no discount", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 0,
        couponResult: { valid: false, code: "BAD", discount_amount: 999 },
        lineItems,
    })

    assertEquals(quote.applied_discount_source, "none")
    assertEquals(quote.discount_amount_total, 0)
    assertEquals(quote.coupon_discount_amount, 0)
    assertEquals(quote.early_bird_discount_amount, 0)
    assertEquals(quote.total_amount, 1050)
})

Deno.test("winning coupon quote keeps GST inside the final trip total", () => {
    const quote = buildPricingQuote({
        baseSubtotal: 1000,
        earlyBirdDiscountAmount: 0,
        couponResult: coupon(200),
        lineItems,
    })

    assertEquals(quote.taxable_amount, 800)
    assertEquals(quote.tax_amount, 40)
    assertEquals(quote.total_amount, 840)
})

Deno.test("only a winning coupon can be persisted as the applied coupon code", () => {
    assertEquals(
        resolveAppliedCouponCode({
            applied_discount_source: "coupon",
            applied_discount_code: "save20",
        }),
        "SAVE20",
    )
    assertEquals(
        resolveAppliedCouponCode({
            applied_discount_source: "early_bird",
            applied_discount_code: "SAVE20",
        }),
        null,
    )
})
