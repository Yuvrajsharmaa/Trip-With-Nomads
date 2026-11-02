import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { bookingStatusCopy } from "./booking_status_presentation_state.ts"

const source = await Deno.readTextFile(new URL("./BookingStatusOverride.tsx", import.meta.url))
const statusEndpoint = await Deno.readTextFile(
    new URL("../supabase/functions/get-booking-status/index.ts", import.meta.url),
)

Deno.test("booking status copy starts with a neutral verified-loading state", () => {
    assert(source.includes('function statusTextForState('), "status text state mapper is missing")
    assert(source.includes('if (state === "loading" || state === "pending") return options.loadingText'), "loading and pending are not handled explicitly")
    assert(source.includes('bookingStatusCopy("loading").title'), "status heading does not use the shared loading copy")
    assert(source.includes('bookingStatusCopy("loading").description'), "status subheading does not use the shared loading copy")
    const loadingCopy = bookingStatusCopy("loading")
    assertEquals(loadingCopy.title, "Your trip is getting ready")
    assertStringIncludes(loadingCopy.description, "confirming your payment with the bank")
    assertStringIncludes(loadingCopy.description, "booking details will appear here once it’s confirmed")
    assertStringIncludes(loadingCopy.description, "don’t try again yet")
    assert(source.includes('"We couldn\'t verify this booking."'), "error copy is not generic")
    assert(source.includes('statusTextForState(state, {'), "visible copy does not use the state mapper")
})

Deno.test("status loading replaces outcome content with the checkout-style full-screen loader", () => {
    const start = source.indexOf("if (!shouldShowBookingStatusContent(started, view)) {")
    const end = source.indexOf("return <Component {...props} />", start)
    const loader = source.slice(start, end)

    assert(start >= 0 && end > start, "full-screen status loader boundary is missing")
    assert(loader.includes('position: "fixed"'), "status content can show behind the loader")
    assert(loader.includes('justifyContent: "center"'), "loader is not centered in the viewport")
    assert(loader.includes('flexDirection: "column"'), "loader content is not stacked clearly")
    assert(!loader.includes("<Component"), "success/failure page renders before status is verified")
    const status = loader.slice(loader.indexOf('role="status"'), loader.indexOf("(view === \"pending\""))
    assert(status.includes('textAlign: "center"'), "loader copy is not centered under the spinner")
    assert(
        status.includes('display: "flex", flexDirection: "column", gap: 16'),
        "spinner is not arranged above the loader copy",
    )
    assert(
        loader.indexOf('className="twnPaymentStatusSpinner"') < loader.indexOf("<h1"),
        "payment spinner should appear before the status heading",
    )
})

Deno.test("unverified booking state cannot show a success icon", () => {
    assert(source.includes('function statusIconForState('), "status icon state mapper is missing")
    assert(source.includes('if (state === "loading" || state === "pending") return "checking"'), "loading and pending can show a payment icon")
    assert(source.includes('if (state === "error") return "unavailable"'), "errors can show a payment icon")
    assert(source.includes('statusIconForState(state, data?.payment_status)'), "icon does not use verified state")
    assert(source.includes('iconState === "success"'), "verified paid success icon is missing")
})

Deno.test("verified status animations bypass Framer's opaque video transcode", () => {
    const start = source.indexOf("export function withStatusIcon")
    const end = source.indexOf("// --- Retry button", start)
    const implementation = source.slice(start, end)

    assert(start >= 0 && end > start, "status icon override boundaries could not be found")
    assertStringIncludes(implementation, "shouldRenderStatusAnimation(iconState, pathname)")
    assertStringIncludes(implementation, "STATUS_ANIMATIONS[iconState]")
    assertStringIncludes(
        source,
        'success: "https://framerusercontent.com/images/JqlipMvB3Ep71YHLcH2zMA0poJM.gif"',
    )
    assertStringIncludes(
        source,
        'failed: "https://framerusercontent.com/images/htuHYQJnFALBNXmy6NMMmBMtYg.gif"',
    )
    assertStringIncludes(implementation, "<img")
    assert(!implementation.includes("<Component"), "Framer's opaque Video output is still rendered")
    assertStringIncludes(implementation, 'background: "transparent"')
    assertStringIncludes(implementation, 'objectFit: "contain"')
    assert(
        implementation.includes('"Booking status unavailable"'),
        "unavailable status mark is missing its accessible label",
    )
})

Deno.test("status animation only plays for the matching verified outcome route", () => {
    const start = source.indexOf("function shouldRenderStatusAnimation(")
    const end = source.indexOf("export function withStatusIcon", start)
    const implementation = source.slice(start, end)

    assert(start >= 0 && end > start, "status animation route guard is missing")
    assertStringIncludes(implementation, 'iconState === "success"')
    assertStringIncludes(implementation, 'route === "/payment-success"')
    assertStringIncludes(implementation, 'iconState === "failed"')
    assertStringIncludes(implementation, 'route === "/payment-failed"')
})

Deno.test("success confetti is only rendered for a server-verified paid booking", () => {
    const start = source.indexOf("export function withVerifiedSuccessDecoration")
    const end = source.indexOf("// --- Page heading", start)
    const implementation = source.slice(start, end)

    assert(start >= 0 && end > start, "success decoration visibility override is missing")
    assert(
        implementation.includes('statusIconForState(state, data?.payment_status) !== "success"'),
        "success decoration is not gated by verified payment status",
    )
    assert(implementation.includes("return null"), "success decoration remains visible while payment is unverified")
})

Deno.test("payment summary stays hidden until verification and hides failures", () => {
    assert(source.includes('function shouldShowPaymentSummary('), "summary visibility mapper is missing")
    assert(source.includes('return state === "ready" && paymentStatus === "paid"'), "summary is not limited to verified payments")
    assert(source.includes('shouldShowPaymentSummary(state, data?.payment_status)'), "summary visibility does not use verified state")
    assert(!source.includes('from "./booking_status_presentation.ts"'))
})

Deno.test("booking status response includes the saved GST and TCS snapshot for both query paths", () => {
    const selectFields = [...statusEndpoint.matchAll(/\.select\(\s*"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((fields) => fields.includes("payment_breakdown"))
    assertEquals(selectFields.length, 2, "primary and legacy balance-note queries should both be covered")
    for (const fields of selectFields) {
        assert(!fields.includes("finance_issuer"), "public booking lookup must not depend on a staging-only column")
        assert(!fields.includes("gst_amount"), "public bookings does not own the GST snapshot fields")
        assert(!fields.includes("tcs_amount"), "public bookings does not own the TCS snapshot fields")
    }
    assertStringIncludes(statusEndpoint, '.schema("crm")')
    assertStringIncludes(statusEndpoint, '.from("booking_details")')
    assertStringIncludes(statusEndpoint, '.select("billing_snapshot, finance_issuer")')
    assertStringIncludes(statusEndpoint, 'billing_snapshot: billingSnapshot')
    assertStringIncludes(statusEndpoint, 'const financeIssuer = detailsResult.data?.finance_issuer || null')
})

Deno.test("status tax label and confirmation copy reflect the booking outcome", () => {
    const taxLabel = source.slice(
        source.indexOf("export function withTaxLabel"),
        source.indexOf("export function withTotalAmount"),
    )
    const outcome = source.slice(
        source.indexOf("export function withPaymentOutcomeTag"),
        source.indexOf("export function withHeadingText"),
    )
    const subheading = source.slice(
        source.indexOf("export function withSubheadingText"),
        source.indexOf("// --- Status icon"),
    )

    assertStringIncludes(taxLabel, "billing_snapshot")
    assertStringIncludes(taxLabel, "finance_issuer")
    assertStringIncludes(taxLabel, "websiteTaxLabelForIssuer")
    assertStringIncludes(outcome, "Paid in full")
    assertStringIncludes(outcome, "Advance received")
    assertStringIncludes(subheading, "remains to be paid before departure")
    assert(!subheading.includes("Booking confirmed."), "subheading repeats the outcome badge and heading")
    assert(!subheading.includes("due on-site"), "copy must not promise an on-site payment option")
})

Deno.test("retry button supports failed payments and expired order setup", () => {
    const retry = source.slice(source.indexOf("export function withRetryButton"))
    assertStringIncludes(retry, "data.payment_retry_available !== true")
    assertStringIncludes(statusEndpoint, "payment_retry_available: paymentRetryAvailable")
})
