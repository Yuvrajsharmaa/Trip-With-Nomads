import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const statusSource = await Deno.readTextFile(
    new URL("./BookingStatusOverride.tsx", import.meta.url),
)
const checkoutSource = await Deno.readTextFile(
    new URL("./CheckoutPageOverrides.tsx", import.meta.url),
)

Deno.test("status pages expose explicit total, payable, paid, and label overrides", () => {
    assertStringIncludes(statusSource, "export function withTotalAmount")
    assertStringIncludes(statusSource, "export function withTotalTripCostLabel")
    assertStringIncludes(statusSource, "export function withPaymentAmountLabel")
    assertStringIncludes(statusSource, "export function withPayableNowAmount")
    assertStringIncludes(statusSource, "export function withDueLabel")
    assertStringIncludes(statusSource, "GST (5%)")
})

Deno.test("status pages do not display the full total as paid while pending", () => {
    assert(!statusSource.includes("const total = resolvedTotalAmount(d);\n    return fmt(total);"))
    assertStringIncludes(statusSource, "snapshot?.applied_coupon !== true")
})

Deno.test("checkout exposes a distinct grand-total and payable-now binding", () => {
    assertStringIncludes(checkoutSource, "export function withCheckoutGrandTotal")
    assertStringIncludes(checkoutSource, "export function withCheckoutGrandTotalLabel")
    assertStringIncludes(checkoutSource, "export function withCheckoutPayableNow")
    assertStringIncludes(checkoutSource, "export function withCheckoutDueLabel")
    assertStringIncludes(checkoutSource, "return withTextFromState(() => \"GST (5%)\")")
})

Deno.test("checkout recomputes the payment split when partial payment is selected", () => {
    assertStringIncludes(checkoutSource, "const activePaymentMode = store.paymentMode || breakdown.payment_mode || \"full\"")
    assertStringIncludes(checkoutSource, "activePaymentMode === \"partial_25\"")
    assertStringIncludes(checkoutSource, "dueAmount")
})

Deno.test("checkout never presents a losing coupon as an applied discount", () => {
    assert(!checkoutSource.includes('applied_discount_source: "both"'))
    assert(!checkoutSource.includes("return Boolean(store.appliedCoupon?.valid)"))
    assertStringIncludes(checkoutSource, "coupon_code: totals.appliedDiscountCode || null")
})
