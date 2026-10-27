import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const checkoutSource = await Deno.readTextFile(
    new URL("./CheckoutPageOverrides.tsx", import.meta.url),
)

Deno.test("checkout derives discounted tax totals from the trip billing issuer", () => {
    assertStringIncludes(
        checkoutSource,
        "const taxInclusive = calculateTaxInclusiveTotal(rawTaxableAmount, discountAmountTotal, issuer)",
    )
    assertStringIncludes(checkoutSource, "const totalAmount = taxInclusive.totalAmount")
    assertStringIncludes(checkoutSource, "gst_amount: taxInclusive.gstAmount")
    assertStringIncludes(checkoutSource, "tcs_amount: taxInclusive.tcsAmount")
    assertStringIncludes(checkoutSource, "finance_issuer: issuer")
    assert(
        !checkoutSource.includes(
            "pickFirstNumber(source, [\"total_amount\", \"totalAmount\"]",
        ),
    )
})

Deno.test("checkout keeps the trip cost separate from the GST-inclusive payable amount", () => {
    assertStringIncludes(
        checkoutSource,
        "export function withCheckoutGrandTotal(Component)",
    )
    assertStringIncludes(
        checkoutSource,
        "formatCheckoutAmount(store, computeTotals(store).subtotal)",
    )
    assertStringIncludes(
        checkoutSource,
        "export function withCheckoutPayableNow(Component)",
    )
    assertStringIncludes(
        checkoutSource,
        "formatCheckoutAmount(store, computeTotals(store).payableNow)",
    )
    assertStringIncludes(
        checkoutSource,
        'totals.appliedDiscountSource !== "coupon"',
    )
})
