import {
    assert,
    assertEquals,
    assertFalse,
    assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"

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
    assertStringIncludes(formatAmount, "Loading price…")
    assertStringIncludes(formatAmount, "Price unavailable")

    const payButtonStart = source.indexOf(
        "export function withCheckoutPayButton(Component)",
    )
    const payButton = source.slice(payButtonStart)
    assertStringIncludes(payButton, "const isPricingReady")
    assertStringIncludes(payButton, 'store?.loading')
    assertStringIncludes(payButton, '"Loading price…"')
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

Deno.test("pricing requests time out and direct checkout routes explain missing context", () => {
    assertStringIncludes(source, "CHECKOUT_DATA_REQUEST_TIMEOUT_MS")
    assertStringIncludes(source, "AbortController")
    assertStringIncludes(source, "Loading trip details…")
    assertStringIncludes(source, "Choose a trip to continue")
    assertStringIncludes(source, "Open checkout from a trip page")

    assertStringIncludes(tripPriceSource, "TRIP_PRICE_REQUEST_TIMEOUT_MS")
    assertStringIncludes(tripPriceSource, "AbortController")
})
