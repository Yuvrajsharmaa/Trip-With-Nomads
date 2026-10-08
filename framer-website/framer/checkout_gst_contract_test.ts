import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const checkoutSource = await Deno.readTextFile(
    new URL("./CheckoutPageOverrides.tsx", import.meta.url),
)

Deno.test("checkout derives quoted totals from taxable price plus GST", () => {
    assertStringIncludes(
        checkoutSource,
        "const taxInclusive = calculateTaxInclusiveTotal(rawTaxableAmount)",
    )
    assertStringIncludes(checkoutSource, "const totalAmount = taxInclusive.totalAmount")
    assert(
        !checkoutSource.includes(
            "pickFirstNumber(source, [\"total_amount\", \"totalAmount\"]",
        ),
    )
})

Deno.test("checkout keeps the trip cost separate from the GST-inclusive payable amount", () => {
    assertStringIncludes(
        checkoutSource,
        "return withTextFromState((store) => fmtINR(computeTotals(store).subtotal))(Component)",
    )
    assertStringIncludes(
        checkoutSource,
        "return withTextFromState((store) => fmtINR(computeTotals(store).payableNow))(Component)",
    )
    assertStringIncludes(
        checkoutSource,
        'totals.appliedDiscountSource !== "coupon"',
    )
})
