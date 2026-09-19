import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const statusSource = await Deno.readTextFile(
    new URL("./BookingStatusOverride.tsx", import.meta.url),
)

Deno.test("payment redirects retain the full payment breakdown", () => {
    assertStringIncludes(
        statusSource,
        "return textOverride((d) => fmt(subtotalBeforeDiscount(d)))(Component)",
    )
    assertStringIncludes(
        statusSource,
        "return textOverride((d) => fmt(discountedSubtotal(d)))(Component)",
    )
    assertStringIncludes(statusSource, "return textOverride((d) => fmt(d.tax_amount))(Component)")
    assertStringIncludes(statusSource, "const total = resolvedTotalAmount(d)")
    assertStringIncludes(statusSource, "return textOverride((d) => fmt(dueAmount(d)))(Component)")
})
