import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(
    new URL("./BookingStatusOverride.tsx", import.meta.url),
)

Deno.test("payment status retry sends the signed status token", () => {
    assertStringIncludes(source, "status_token: statusToken")
})

Deno.test("retry errors stay on the payment-status page", () => {
    assert(
        !source.includes("window.location.href = `${DOMESTIC_TRIPS_BASE_URL}/${data.trip_id}`"),
    )
    assert(!source.includes("window.location.href = DOMESTIC_TRIPS_BASE_URL"))
})

Deno.test("pending timeout has a distinct state instead of redirecting as failed", () => {
    assertStringIncludes(source, "_pendingTimedOut")
    assertStringIncludes(source, "Payment not completed")
})

Deno.test("payment outcome tag does not call a pending booking failed", () => {
    assertStringIncludes(source, "export function withPaymentOutcomeTag")
    assertStringIncludes(source, '"$control__tagText": statusText')
    assertStringIncludes(source, 'return "Payment processing"')
})
