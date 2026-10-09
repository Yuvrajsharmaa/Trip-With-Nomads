import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

async function read(name: string): Promise<string> {
    return await Deno.readTextFile(new URL(`./${name}`, import.meta.url))
}

Deno.test("canonical checkout uses stable request ids, the active Razorpay gateway, and server totals", async () => {
    const source = await read("CheckoutPageOverrides.tsx")

    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "trip_slug")
    assertStringIncludes(source, "fetchTripContextBySlug")
    assertStringIncludes(source, "fetchCheckoutRequest")
    assertStringIncludes(source, "retrying once")
    assertStringIncludes(source, "canonical public route identity")
    assertStringIncludes(source, "This trip is not available for online booking")
    assertStringIncludes(source, "sessionStorage")
    assertStringIncludes(source, "crypto.randomUUID")
    assertStringIncludes(source, "Razorpay")
    assertStringIncludes(source, "payment_mode")
    assertStringIncludes(source, "settlement_status")
    assertStringIncludes(source, "isBookableDepartureDate")
    assertStringIncludes(source, "already_paid")
    assertStringIncludes(source, "key_id")
    assertStringIncludes(source, "payment.failed")
    assertStringIncludes(source, "partial_25")
    assertStringIncludes(source, "payable_now_amount")
    assertStringIncludes(source, "due_amount")
    assertStringIncludes(source, "tax_amount")
    assertStringIncludes(source, "coupon_code")
    assertStringIncludes(source, "BOOKING_ABANDON_LEAD_SOURCE")
    assertStringIncludes(source, "checkout_abandoned_before_payment")
    assertStringIncludes(source, "getStableBookingAbandonId")
    assertStringIncludes(source, "departure_date")
    assertStringIncludes(source, "travellers")
    assertStringIncludes(source, "payment_mode")
    assertStringIncludes(source, "pagehide")
})

Deno.test("obsolete booking modal is absent and the full-page checkout is the only buying flow", async () => {
    let modalExists = true
    try {
        await Deno.stat(new URL("./BookingOverrides.tsx", import.meta.url))
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) modalExists = false
        else throw error
    }
    assertEquals(modalExists, false)
})

Deno.test("status UI renders payment and settlement state from the signed response", async () => {
    const source = await read("BookingStatusOverride.tsx")

    assertStringIncludes(source, "payment_status")
    assertStringIncludes(source, "settlement_status")
    assertStringIncludes(source, "Payment Status: Paid")
    assertStringIncludes(source, "Settlement Status: Fully settled")
    assert(!source.includes('params.get("payment_status")'))
    assert(!source.includes('searchParams.get("payment_status")'))
    assertStringIncludes(source, "AbortController")
    assertStringIncludes(source, "Retry status")
})

Deno.test("all legacy lead routes remain exported and use one guarded submission path", async () => {
    const source = await read("EmailPopupOverride.tsx")

    for (
        const exportName of [
            "withCustomTripTracking",
            "withWaitlistTracking",
            "withWaitlistAbandonTracking",
            "withLeadAbandonTrackingGeneric",
            "withLeadTracking",
            "withFormTracking",
            "withBookingInviteTracking",
            "withTripPageLeadTracking",
            "withTripItineraryFormTracking",
            "withTripItineraryDownloadTracking",
            "withPartialFillTracking",
        ]
    ) {
        assertStringIncludes(source, `export function ${exportName}`)
    }
    assertStringIncludes(source, "submission_id")
    assertStringIncludes(source, "SUBMIT_LOCK_KEY")
    assertStringIncludes(source, "onSubmit={undefined}")
    assertStringIncludes(source, "partial_fill")
    assertStringIncludes(source, "querySelectorAll(selector)")
    assertStringIncludes(source, 'input[name*="company" i]')
    assertStringIncludes(source, 'Company: ${companyName}')
    assertStringIncludes(source, 'custom_trip_lead')
    assertStringIncludes(source, 'twnLeadCaptured')
    assertStringIncludes(source, 'Custom trip enquiry: ${customDestination}')
    assertStringIncludes(source, 'twnBookingInvitePartialCaptured')
    assertStringIncludes(source, 'postLeadWithSource(\n                            form,\n                            "booking_invite",\n                            "partial_fill"')
})

Deno.test("checkout errors use the accessible responsive toast with safe text rendering", async () => {
    const source = await read("CheckoutPageOverrides.tsx")

    assertStringIncludes(source, 'const toastId = "__checkout_validation_toast"')
    assertStringIncludes(source, 'toast.setAttribute("role", "alert")')
    assertStringIncludes(source, 'toast.setAttribute("aria-live", "assertive")')
    assertStringIncludes(source, 'title.textContent = titleText')
    assertStringIncludes(source, 'detail.textContent = detailText')
    assertStringIncludes(source, 'closeButton.setAttribute("aria-label", "Dismiss message")')
    assertStringIncludes(source, "@media (max-width: 767px)")
    assertStringIncludes(source, "@media (prefers-reduced-motion: reduce)")
    assertStringIncludes(source, "window.setTimeout(dismiss, 6000)")
})
