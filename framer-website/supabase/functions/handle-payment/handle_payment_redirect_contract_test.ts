import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildPaymentStatusRedirectUrl } from "./redirect_url.ts"

Deno.test("handle-payment is redirect-only", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "Response.redirect")
    assertStringIncludes(source, "isPaymentFailureCallback")
    assertStringIncludes(source, "\"/payment-failed\"")
    assert(!source.includes(".from(\"bookings\")"))
    assert(!source.includes("appendRow("))
    assert(!source.includes('searchParams.set("payment_status"'))
    assert(!source.includes("callback_orphan"))
})

Deno.test("handle-payment only forwards a supplied status token", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assert(source.includes('buildPaymentStatusRedirectUrl(siteBase, statusPath, bookingId, suppliedToken)'))
    assert(!source.includes("issueBookingStatusToken"))
    assert(!source.includes("resolveBookingStatusSecret"))
})

Deno.test("handle-payment redirects with a supplied signed status token", () => {
    const url = new URL(buildPaymentStatusRedirectUrl(
        "https://maroon-aside-814100.framer.app",
        "/payment-success",
        "8c65dd46-2740-4f46-af9b-163512eaf2bb",
        "v1.1794259252.example-signature",
    ))

    assertEquals(url.origin, "https://maroon-aside-814100.framer.app")
    assertEquals(url.pathname, "/payment-success")
    assertEquals(url.searchParams.get("booking_id"), "8c65dd46-2740-4f46-af9b-163512eaf2bb")
    assertEquals(url.searchParams.get("status_token"), "v1.1794259252.example-signature")
})

Deno.test("handle-payment does not add a status token to a tokenless callback", () => {
    const url = new URL(buildPaymentStatusRedirectUrl(
        "maroon-aside-814100.framer.app",
        "/payment-failed",
        "8c65dd46-2740-4f46-af9b-163512eaf2bb",
        "",
    ))

    assertEquals(url.pathname, "/payment-failed")
    assertEquals(url.searchParams.get("booking_id"), "8c65dd46-2740-4f46-af9b-163512eaf2bb")
    assertEquals(url.searchParams.get("status_token"), null)
})
