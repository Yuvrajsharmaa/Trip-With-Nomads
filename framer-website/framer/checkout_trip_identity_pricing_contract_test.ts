import {
    assert,
    assertEquals,
    assertFalse,
    assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import { getCheckoutEntryState } from "./checkout_entry_state.ts"

const source = await Deno.readTextFile(
    new URL("./CheckoutPageOverrides.tsx", import.meta.url),
)
const tripPriceSource = await Deno.readTextFile(
    new URL("./TripPriceOverrides.tsx", import.meta.url),
)

Deno.test("checkout links and display pricing are ID-first", () => {
    const bookNowStart = source.indexOf("export function withBookNowToCheckout")
    const checkoutIdStart = source.indexOf(
        "export function withCheckoutTripId",
        bookNowStart,
    )
    const bookNow = source.slice(bookNowStart, checkoutIdStart)

    assert(bookNowStart >= 0, "Book now override should exist")
    assertStringIncludes(bookNow, "const currentSlug = normalizeSlug")
    assertStringIncludes(bookNow, "fetchTripIdBySlug(currentSlug)")
    assertStringIncludes(bookNow, "const slug = currentSlug ||")
    assertStringIncludes(bookNow, "getPageScopedTripId")
    assertStringIncludes(bookNow, 'if (tripId) next.set("tripId", tripId)')
    assertStringIncludes(bookNow, 'if (slug) next.set("slug", slug)')
    assertStringIncludes(bookNow, "const sameTrip = Boolean")
    assertFalse(
        bookNow.includes(
            "|| normalizeTripId(store.tripId) || getPageScopedTripId()",
        ),
    )

    const displayStart = source.indexOf("function useTripDisplayData")
    const displayEnd = source.indexOf(
        "export function withTripPrimaryPrice",
        displayStart,
    )
    const display = source.slice(displayStart, displayEnd)
    assertStringIncludes(display, "await resolveTripDisplayIdentity")
    assertStringIncludes(display, "pathname: window.location.pathname")
    assertStringIncludes(display, "query: new URLSearchParams(window.location.search)")
    assertStringIncludes(display, "const [locationKey, setLocationKey]")

    const bootstrapStart = source.indexOf(
        "export function withCheckoutBootstrap",
    )
    const bootstrapEnd = source.indexOf(
        "export function withBookNowToCheckout",
        bootstrapStart,
    )
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd)
    assertStringIncludes(bootstrap, "if (ctx.tripId && !tripContext)")
    assertStringIncludes(bootstrap, "slug = tripId")
    assertStringIncludes(bootstrap, 'String(tripContext?.slug || "").trim()')
})

Deno.test("trip page pricing effect starts its asynchronous lookup", () => {
    const displayStart = source.indexOf("function useTripDisplayData")
    const displayEnd = source.indexOf(
        "export function withTripPrimaryPrice",
        displayStart,
    )
    const display = source.slice(displayStart, displayEnd)

    assertStringIncludes(display, "const run = async () => {")
    assertStringIncludes(display, "await fetchTripDisplayPrice(identity)")
    assertStringIncludes(display, "run()")
    assertStringIncludes(
        source,
        "async function resolveTripDisplayIdentity(params: {",
    )
    assertEquals(
        source.match(/function readBrowserLocationKey\(\)/g)?.length || 0,
        1,
    )
    assertEquals(
        display.match(/window\.setInterval\(refreshLocationKey, 500\)/g)?.length || 0,
        1,
    )
})

Deno.test("Total trip cost is pre-tax while payable now remains final", () => {
    const totalStart = source.indexOf(
        "export function withCheckoutGrandTotal(Component)",
    )
    const totalEnd = source.indexOf(
        "export function withCheckoutPayableNowLabel",
        totalStart,
    )
    const totalOverride = source.slice(totalStart, totalEnd)

    assertStringIncludes(totalOverride, "computeTotals(store).subtotal")
    assertFalse(totalOverride.includes("computeTotals(store).total"))
})

Deno.test("trip and checkout price labels distinguish loading from zero price", () => {
    const tripPriceStart = source.indexOf(
        "export function withTripPrimaryPrice",
    )
    const tripPriceEnd = source.indexOf(
        "export function withTripStrikePrice",
        tripPriceStart,
    )
    const tripPrice = source.slice(tripPriceStart, tripPriceEnd)
    assertStringIncludes(tripPrice, 'status === "loading"')
    assertStringIncludes(tripPrice, "Loading price…")
    assertStringIncludes(tripPrice, "Price unavailable")
    assertFalse(tripPrice.includes(': "₹0"'))

    const checkoutSubtotalStart = source.indexOf(
        "export function withCheckoutSubtotal(Component)",
    )
    const checkoutPayableEnd = source.indexOf(
        "export function withCheckoutHideWhenNoDue",
        checkoutSubtotalStart,
    )
    const checkoutAmounts = source.slice(checkoutSubtotalStart, checkoutPayableEnd)
    assertStringIncludes(checkoutAmounts, "formatCheckoutAmount(store,")
    const formatAmountStart = source.indexOf("function formatCheckoutAmount")
    const formatAmountEnd = source.indexOf(
        "function formatNextBatchDate",
        formatAmountStart,
    )
    const formatAmount = source.slice(formatAmountStart, formatAmountEnd)
    assertStringIncludes(formatAmount, 'if (entryState === "loading") return ""')
    assertStringIncludes(formatAmount, "Price unavailable")

    const payButtonStart = source.indexOf(
        "export function withCheckoutPayButton(Component)",
    )
    const payButtonEnd = source.indexOf("function readBrowserLocationKey", payButtonStart)
    const payButton = source.slice(payButtonStart, payButtonEnd)
    assertStringIncludes(payButton, "const isPricingReady")
    assertFalse(payButton.includes('"Loading price…"'))
    assertStringIncludes(payButton, '"Price unavailable"')
    assertStringIncludes(payButton, "Trip pricing is still loading")
    assertStringIncludes(payButton, "store?.pricingUnavailable || !isPricingReady")

    const standaloneTripPriceStart = tripPriceSource.indexOf(
        "export function withTripPrimaryPrice",
    )
    const standaloneTripPriceEnd = tripPriceSource.indexOf(
        "export function withTripStrikePrice",
        standaloneTripPriceStart,
    )
    const standaloneTripPrice = tripPriceSource.slice(
        standaloneTripPriceStart,
        standaloneTripPriceEnd,
    )
    assertStringIncludes(standaloneTripPrice, 'status === "loading"')
    assertStringIncludes(standaloneTripPrice, "Loading price…")
    assertStringIncludes(standaloneTripPrice, "Price unavailable")
    assertFalse(standaloneTripPrice.includes(': "₹0"'))
})

Deno.test("missing trip context cannot leave the checkout amount stuck loading", () => {
    const formatStart = source.indexOf("function formatCheckoutAmount")
    const formatEnd = source.indexOf("\n}", formatStart) + 2
    const formatter = source.slice(formatStart, formatEnd)
    assertStringIncludes(formatter, "readCheckoutRouteContext()")
    assertStringIncludes(formatter, "getCheckoutEntryState")
    assertStringIncludes(formatter, 'entryState === "missing-trip"')
    assertStringIncludes(formatter, '"Price unavailable"')
})

Deno.test("checkout recovery uses the blue primary action and a compact unavailable amount", () => {
    const recoveryStart = source.indexOf(
        'if (checkoutState === "missing-trip" || checkoutState === "unavailable")',
    )
    const recoveryEnd = source.indexOf("export function withBookNowToCheckout", recoveryStart)
    const recovery = source.slice(recoveryStart, recoveryEnd)
    assertStringIncludes(recovery, 'background: "#1b91c9"')
    assertStringIncludes(recovery, 'color: "#fff"')
    assertStringIncludes(recovery, "Browse upcoming trips")

    const payableStart = source.indexOf("export function withCheckoutPayableNow")
    const payableEnd = source.indexOf("export function withCheckoutDueAmount", payableStart)
    assertStringIncludes(source.slice(payableStart, payableEnd), '"Unavailable"')
})

Deno.test("pricing requests time out and direct checkout routes explain missing context", () => {
    assertStringIncludes(source, "CHECKOUT_DATA_REQUEST_TIMEOUT_MS")
    assertStringIncludes(source, "AbortController")
    assertStringIncludes(source, "Loading trip details…")
    assertStringIncludes(source, "Choose a trip to continue")
    assertStringIncludes(source, "Open checkout from a trip page")

    assertStringIncludes(tripPriceSource, "TRIP_PRICE_REQUEST_TIMEOUT_MS")
    assertStringIncludes(tripPriceSource, "AbortController")
})

Deno.test("checkout without a valid trip replaces the form and disables payment accessibly", () => {
    const bootstrapStart = source.indexOf(
        "export function withCheckoutBootstrap",
    )
    const bootstrapEnd = source.indexOf(
        "export function withBookNowToCheckout",
        bootstrapStart,
    )
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd)
    const payButtonStart = source.indexOf(
        "export function withCheckoutPayButton(Component)",
    )
    const payButton = source.slice(payButtonStart)

    assertStringIncludes(bootstrap, "getCheckoutEntryState")
    assertStringIncludes(bootstrap, 'checkoutState === "missing-trip"')
    assertStringIncludes(bootstrap, 'checkoutState === "unavailable"')
    assertStringIncludes(source, "Browse upcoming trips")
    assertStringIncludes(payButton, "aria-disabled={isPaymentBlocked}")
    assertStringIncludes(payButton, "preventDefault")
})

Deno.test("checkout keeps the form behind a clear full-page loading state", () => {
    const bootstrapStart = source.indexOf("export function withCheckoutBootstrap")
    const bootstrapEnd = source.indexOf(
        "export function withBookNowToCheckout",
        bootstrapStart,
    )
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd)

    assertStringIncludes(bootstrap, 'checkoutState === "loading"')
    assertStringIncludes(bootstrap, 'aria-busy="true"')
    assertStringIncludes(bootstrap, 'role="status"')
    assertStringIncludes(bootstrap, "Preparing your checkout")
    assertStringIncludes(bootstrap, "Checking trip availability and current pricing.")
    assert(bootstrap.indexOf('checkoutState === "loading"') < bootstrap.indexOf("return <Component {...props} />"))
})

Deno.test("checkout clearly discloses its two reminder emails beside the email field", () => {
    const emailStart = source.indexOf("export function withCheckoutContactEmail")
    const emailEnd = source.indexOf("export function withCouponCodeInput", emailStart)
    const emailField = source.slice(emailStart, emailEnd)

    assert(emailStart >= 0 && emailEnd > emailStart, "checkout email field override is missing")
    assertStringIncludes(emailField, "aria-describedby=\"checkout-reminder-disclosure\"")
    assertStringIncludes(emailField, 'id="checkout-reminder-disclosure"')
    assertStringIncludes(emailField, "If you leave before paying, we may email up to two checkout reminders: one after 20 minutes and one the next day.")
    assertStringIncludes(emailField, "Unsubscribe anytime.")
})

Deno.test("checkout loading state covers the full viewport", () => {
    const bootstrapStart = source.indexOf("export function withCheckoutBootstrap(Component)")
    const bootstrapEnd = source.indexOf("export function withBookNowToCheckout", bootstrapStart)
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd)
    const loadingStart = bootstrap.indexOf('if (checkoutState === "loading")')
    const loadingEnd = bootstrap.indexOf("return <Component {...props} />", loadingStart)
    const loading = bootstrap.slice(loadingStart, loadingEnd)

    assertStringIncludes(loading, 'position: "fixed"')
    assertStringIncludes(loading, "inset: 0")
    assertStringIncludes(loading, "zIndex: 9999")
})

Deno.test("Pay now shows an accessible in-button loader while secure payment starts", () => {
    const payButtonStart = source.indexOf(
        "export function withCheckoutPayButton(Component)",
    )
    const payButtonEnd = source.indexOf("function readBrowserLocationKey", payButtonStart)
    const payButton = source.slice(payButtonStart, payButtonEnd)

    assertStringIncludes(payButton, 'aria-label={store?.submitting ? "Starting secure payment"')
    assertStringIncludes(payButton, 'testId="checkout-payment-spinner"')
    assertStringIncludes(payButton, 'aria-busy={Boolean(store?.submitting)}')
    assertStringIncludes(payButton, "aria-disabled={isPaymentBlocked}")
    assertStringIncludes(payButton, "onClick={handleClick}")

    const razorpayStart = payButton.indexOf('if (data?.gateway === "razorpay"')
    const razorpayEnd = payButton.indexOf("const payu = data?.payu", razorpayStart)
    const razorpayBranch = payButton.slice(razorpayStart, razorpayEnd)
    assert(razorpayStart >= 0 && razorpayEnd > razorpayStart)
    assert(razorpayBranch.indexOf("await openRazorpayCheckout") < razorpayBranch.indexOf("setStore({ submitting: false })"))
})

Deno.test("Pay now centers the spinner and hides button copy while payment starts", () => {
    const payButtonStart = source.indexOf("export function withCheckoutPayButton(Component)")
    const payButtonEnd = source.indexOf("function readBrowserLocationKey", payButtonStart)
    const payButton = source.slice(payButtonStart, payButtonEnd)

    assertStringIncludes(payButton, '$control__pnMgUuoPi={store?.submitting')
    assertFalse(payButton.includes('text={store?.submitting'))
    assertStringIncludes(payButton, 'aria-label={store?.submitting ? "Starting secure payment"')
    assertStringIncludes(payButton, 'insetInlineStart: "50%"')
    assertStringIncludes(payButton, 'transform: "translate(-50%, -50%)"')
    assertFalse(payButton.includes('insetInlineStart: 16'))
})

Deno.test("payment setup and Razorpay loading both fail instead of spinning forever", () => {
    const requestStart = source.indexOf("async function fetchCheckoutRequest")
    const requestEnd = source.indexOf("async function loadRazorpayScript", requestStart)
    const request = source.slice(requestStart, requestEnd)
    const gatewayStart = source.indexOf("async function loadRazorpayScript")
    const gatewayEnd = source.indexOf("async function openRazorpayCheckout", gatewayStart)
    const gateway = source.slice(gatewayStart, gatewayEnd)

    assertStringIncludes(request, "CHECKOUT_PAYMENT_REQUEST_TIMEOUT_MS")
    assertStringIncludes(request, "AbortController")
    assertStringIncludes(gateway, "CHECKOUT_RAZORPAY_SCRIPT_TIMEOUT_MS")
    assertStringIncludes(gateway, "clearTimeout")
})

Deno.test("pay button prevents the Framer link from navigating on every click", () => {
    const payButtonStart = source.indexOf(
        "export function withCheckoutPayButton(Component)",
    )
    const payButton = source.slice(payButtonStart)
    const handleClickStart = payButton.indexOf("const handleClick = (e: any) => {")
    const handleClickEnd = payButton.indexOf("const handleKeyDown", handleClickStart)
    const handleClick = payButton.slice(handleClickStart, handleClickEnd)

    assert(handleClickStart >= 0, "Pay button click handler should exist")
    assert(handleClickEnd > handleClickStart, "Click handler boundary should exist")
    assert(
        handleClick.indexOf("e?.preventDefault?.()") < handleClick.indexOf("if (!isValid)"),
        "Prevent link navigation before handling either valid or invalid clicks",
    )
    assert(
        handleClick.indexOf("e?.preventDefault?.()") < handleClick.indexOf("void submit()"),
        "A valid click should submit without following the Framer link",
    )
})

Deno.test("checkout route state follows the URL context instead of stale stored trip data", () => {
    assertEquals(getCheckoutEntryState({
        loading: false,
        pricingData: [{ id: "stale-trip" }],
    }), "missing-trip")
})

Deno.test("checkout field errors wait for a submit attempt and the toast avoids repeating them", () => {
    const storeStart = source.indexOf("const useStore = createStore({")
    const storeEnd = source.indexOf("\n})", storeStart)
    assertStringIncludes(
        source.slice(storeStart, storeEnd),
        "validationAttempted: false",
    )

    const fieldErrorStart = source.indexOf("function checkoutFieldError(")
    const travellerErrorStart = source.indexOf("function travellerFieldError(")
    const fieldError = source.slice(fieldErrorStart, travellerErrorStart)
    const travellerErrorEnd = source.indexOf("function withTravellerFieldError(", travellerErrorStart)
    const travellerError = source.slice(travellerErrorStart, travellerErrorEnd)
    assertStringIncludes(fieldError, "if (!store?.validationAttempted) return \"\"")
    assertStringIncludes(travellerError, "if (!store?.validationAttempted) return \"\"")

    const payButtonStart = source.indexOf("export function withCheckoutPayButton(Component)")
    const payButtonEnd = source.indexOf("function readBrowserLocationKey", payButtonStart)
    const payButton = source.slice(payButtonStart, payButtonEnd)
    assertStringIncludes(payButton, "setStore({ validationAttempted: true })")
    assertStringIncludes(payButton, "const isPaymentBlocked = Boolean(")
    assertStringIncludes(
        payButton,
        "store?.loading || store?.pricingUnavailable || !isPricingReady ||",
    )
    assertStringIncludes(payButton, "isPaymentLocked,")
    assertStringIncludes(payButton, "aria-disabled={isPaymentBlocked}")
    assertStringIncludes(payButton, 'cursor: isPaymentBlocked ? "wait" : "pointer"')
    const toastStart = source.indexOf("function showInlineError(")
    const toastEnd = source.indexOf("function firstNonEmpty", toastStart)
    const toast = source.slice(toastStart, toastEnd)
    assertStringIncludes(toast, "const isFieldValidation = Array.isArray(errors)")
    assertStringIncludes(toast, '"A few details need attention"')
    assertStringIncludes(toast, '"See the highlighted fields below."')

    const bootstrapStart = source.indexOf("export function withCheckoutBootstrap(Component)")
    const bootstrapEnd = source.indexOf("export function withBookNowToCheckout", bootstrapStart)
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd)
    assertStringIncludes(bootstrap, "validationAttempted: false")
})

Deno.test("checkout payable amount override closes before the next export", () => {
    const payableStart = source.indexOf("export function withCheckoutPayableNow(")
    const dueStart = source.indexOf("export function withCheckoutDueAmount(", payableStart)
    assert(payableStart >= 0 && dueStart > payableStart)
    assertStringIncludes(source.slice(payableStart, dueStart).trimEnd(), "\n}")
})

Deno.test("a paid idempotency replay renews the checkout key before showing success", () => {
    const payButtonStart = source.indexOf("export function withCheckoutPayButton(Component)")
    const payButtonEnd = source.indexOf("function readBrowserLocationKey", payButtonStart)
    const payButton = source.slice(payButtonStart, payButtonEnd)
    const replayStart = payButton.indexOf(
        "if (res.ok && data?.already_paid && data?.replayed)",
    )
    const successStart = payButton.indexOf(
        'if (data?.already_paid || data?.payment_status === "paid")',
    )

    assert(replayStart >= 0 && successStart > replayStart)
    const replay = payButton.slice(replayStart, successStart)
    assertStringIncludes(replay, "checkout_request_id = createUuid()")
    assertStringIncludes(replay, "payload.checkout_request_id = checkout_request_id")
    assertStringIncludes(replay, "window.sessionStorage.setItem(")
    assertStringIncludes(replay, "await createBooking()")
    assertEquals(payButton.match(/await createBooking\(\)/g)?.length, 2)
})
