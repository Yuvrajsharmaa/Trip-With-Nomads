import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    buildWebsiteTripPricingRows,
    buildWebsiteCommercialSnapshot,
    mapWebsiteTripCatalogRow,
    resolveWebsiteFinanceIssuer,
    validateWebsiteDepartureSelection,
    resolveWebsiteTripCatalog,
} from "./crm_trip_catalog.ts"
import { computeBasePricing, normalizeSharing } from "./pricing.ts"

Deno.test("legacy website IDs resolve only through an explicit CRM mapping", () => {
    const publicTrip = { id: "website-id", active: true }
    const mappedTrip = {
        id: "crm-id",
        website_trip_id: "website-id",
        is_active: true,
    }

    assertEquals(resolveWebsiteTripCatalog(publicTrip, [mappedTrip]), mappedTrip)
    assertEquals(
        resolveWebsiteTripCatalog(publicTrip, [{ ...mappedTrip, website_trip_id: null }]),
        null,
    )
    assertEquals(
        resolveWebsiteTripCatalog(publicTrip, [
            mappedTrip,
            { ...mappedTrip, id: "second-crm-id" },
        ]),
        null,
    )
})

Deno.test("new website trips resolve by the shared ID when no legacy mapping exists", () => {
    const publicTrip = { id: "shared-id", active: true }
    const catalogTrip = { id: "shared-id", website_trip_id: null, is_active: true }

    assertEquals(resolveWebsiteTripCatalog(publicTrip, [catalogTrip]), catalogTrip)
    assertEquals(
        resolveWebsiteTripCatalog(publicTrip, [{ ...catalogTrip, is_active: false }]),
        null,
    )
    assertEquals(
        resolveWebsiteTripCatalog({ ...publicTrip, active: false }, [catalogTrip]),
        null,
    )
    assertEquals(
        resolveWebsiteTripCatalog(publicTrip, [{ ...catalogTrip, is_custom: true }]),
        null,
    )
})

Deno.test("database catalog mapping keeps active state for live website pricing", () => {
    const catalogTrip = mapWebsiteTripCatalogRow({
        id: "shared-id",
        website_trip_id: null,
        is_active: true,
        title: "Mapped trip",
        slug: "mapped-trip",
        trip_type: "domestic",
        region: "domestic",
        billing_entity: "TWN",
        is_custom: false,
    })

    assertEquals(catalogTrip.is_active, true)
    assertEquals(buildWebsiteTripPricingRows({
        publicTripId: "shared-id",
        today: "2026-10-26",
        catalogTrip,
        departures: [{
            id: "departure-id",
            departure_date: "2026-11-22",
            status: "open",
            capacity: 12,
            reserved_count: 0,
            unverified_booking_count: 0,
            pricing_options: [{ sharing: "Double", transport: "Ex. Delhi", price: 17499 }],
        }],
    }).map((row) => [row.departure_id, row.price]), [["departure-id", 17499]])
})

Deno.test("custom CRM-only trips cannot be sold through public website checkout", () => {
    assertEquals(buildWebsiteTripPricingRows({
        publicTripId: "website-id",
        today: "2026-10-26",
        catalogTrip: {
            id: "crm-id",
            website_trip_id: "website-id",
            is_active: true,
            is_custom: true,
        },
        departures: [{
            departure_date: "2026-11-20",
            status: "open",
            capacity: 12,
            reserved_count: 0,
            pricing_options: [{ sharing: "Double", transport: "SUV", price: 10000 }],
        }],
    }), [])
})

Deno.test("website billing issuer comes from the CRM trip classification", () => {
    assertEquals(resolveWebsiteFinanceIssuer({ billing_entity: "NTC", region: "domestic" }), "NTC")
    assertEquals(resolveWebsiteFinanceIssuer({ billing_entity: null, region: "international" }), "NTC")
    assertEquals(resolveWebsiteFinanceIssuer({ billing_entity: null, trip_type: "domestic" }), "TWN")
    assertEquals(resolveWebsiteFinanceIssuer({ billing_entity: null, region: "unclassified" }), null)
})

Deno.test("pricing exposes only open future capacity with safe transport and sharing rates", () => {
    const rows = buildWebsiteTripPricingRows({
        publicTripId: "website-id",
        today: "2026-10-26",
        catalogTrip: {
            id: "crm-id",
            website_trip_id: "website-id",
            is_active: true,
        },
        departures: [
            {
                id: "past",
                departure_date: "2026-10-25",
                status: "open",
                capacity: 12,
                reserved_count: 0,
                pricing_options: [{ sharing: "Double", transport: "SUV", price: 10000 }],
            },
            {
                id: "paused",
                departure_date: "2026-11-01",
                status: "paused",
                capacity: 12,
                reserved_count: 0,
                pricing_options: [{ sharing: "Double", transport: "SUV", price: 10000 }],
            },
            {
                id: "full",
                departure_date: "2026-11-02",
                status: "open",
                capacity: 2,
                reserved_count: 2,
                pricing_options: [{ sharing: "Double", transport: "SUV", price: 10000 }],
            },
            {
                id: "available",
                departure_date: "2026-11-20",
                status: "open",
                capacity: 12,
                reserved_count: 2,
                pricing_options: [
                    { sharing: "Double", transport: "SUV", price: 10000 },
                    {
                        sharing: "Single",
                        transport: "Tempo Traveller",
                        price: 12000,
                        earlyBirdPrice: 11000,
                        earlyBirdEndsOn: "2026-11-15",
                    },
                    { sharing: "Triple", transport: "SUV", price: 0 },
                ],
            },
        ],
    })

    assertEquals(rows.length, 2)
    assertEquals(rows.map((row) => [row.start_date, row.sharing, row.vehicle, row.price]), [
        ["2026-11-20", "Double", "SUV", 10000],
        ["2026-11-20", "Single", "Tempo Traveller", 12000],
    ])
    assertEquals(rows[1].early_bird_enabled, true)
    assertEquals(rows[1].early_bird_discount_type, "fixed")
    assertEquals(rows[1].early_bird_discount_value, 1000)
    assertEquals(rows[1].early_bird_ends_at, "2026-11-15T18:29:59.999Z")
})

Deno.test("single sharing is priced from the selected CRM departure option", () => {
    const pricingRows = buildWebsiteTripPricingRows({
        publicTripId: "website-id",
        today: "2026-10-26",
        catalogTrip: {
            id: "crm-id",
            website_trip_id: "website-id",
            is_active: true,
        },
        departures: [{
            id: "departure-id",
            departure_date: "2026-11-20",
            status: "open",
            capacity: 12,
            reserved_count: 0,
            pricing_options: [{
                sharing: "Single",
                transport: "SUV",
                price: 12000,
            }],
        }],
    })

    assertEquals(normalizeSharing("Single"), "Single")
    assertEquals(computeBasePricing({
        pricingRows,
        departureDate: "2026-11-20",
        fallbackTransport: "SUV",
        travellers: [{ id: 1, sharing: "Single", transport: "SUV" }],
    }).subtotal, 12000)
})

Deno.test("ambiguous duplicate catalogue prices are excluded rather than guessed", () => {
    const rows = buildWebsiteTripPricingRows({
        publicTripId: "website-id",
        today: "2026-10-26",
        catalogTrip: {
            id: "crm-id",
            website_trip_id: "website-id",
            is_active: true,
        },
        departures: [{
            id: "departure-id",
            departure_date: "2026-11-20",
            status: "open",
            capacity: 12,
            reserved_count: 0,
            pricing_options: [
                { sharing: "Double", transport: "SUV", price: 10000 },
                { sharing: " Double ", transport: "SUV", price: 9000 },
                { sharing: "Single", transport: "SUV", price: 12000 },
            ],
        }],
    })

    assertEquals(rows.map((row) => [row.sharing, row.price]), [["Single", 12000]])
})

Deno.test("a date with more than one CRM departure is hidden from website checkout", () => {
    const rows = buildWebsiteTripPricingRows({
        publicTripId: "website-id",
        today: "2026-10-26",
        catalogTrip: { id: "crm-id", website_trip_id: "website-id", is_active: true },
        departures: [
            { id: "morning", departure_date: "2026-11-20", status: "open", capacity: 12, reserved_count: 0, pricing_options: [{ sharing: "Double", transport: "SUV", price: 10000 }] },
            { id: "evening", departure_date: "2026-11-20", status: "open", capacity: 12, reserved_count: 0, pricing_options: [{ sharing: "Double", transport: "SUV", price: 11000 }] },
            { id: "unique", departure_date: "2026-12-20", status: "open", capacity: 12, reserved_count: 0, pricing_options: [{ sharing: "Double", transport: "SUV", price: 12000 }] },
        ],
    })

    assertEquals(rows.map((row) => row.departure_id), ["unique"])
})

Deno.test("selected departure is revalidated for uniqueness and passenger capacity", () => {
    const rows = [
        { departure_id: "only", departure_date: "2026-12-20", remaining_capacity: 3 },
        { departure_id: "only", departure_date: "2026-12-20", remaining_capacity: 3 },
    ]

    assertEquals(validateWebsiteDepartureSelection(rows, "2026-12-20", 3), {
        valid: true,
        departureId: "only",
    })
    assertEquals(validateWebsiteDepartureSelection(rows, "2026-12-20", 4), {
        valid: false,
        reason: "capacity",
    })
    assertEquals(validateWebsiteDepartureSelection([
        ...rows,
        { departure_id: "second", departure_date: "2026-12-20", remaining_capacity: 3 },
    ], "2026-12-20", 1), {
        valid: false,
        reason: "ambiguous",
    })
    assertEquals(validateWebsiteDepartureSelection(rows, "2026-12-21", 1), {
        valid: false,
        reason: "unavailable",
    })
})

Deno.test("website booking snapshot records Operations rates and early-bird discount", () => {
    const snapshot = buildWebsiteCommercialSnapshot({
        departureDate: "2026-12-20",
        lineItems: [
            { traveller_id: 1, sharing: "Double", transport: "SUV", unit_price: 10000 },
            { traveller_id: 2, sharing: "Double", transport: "SUV", unit_price: 10000 },
        ],
        pricingRows: [{
            departure_date: "2026-12-20",
            sharing: "Double",
            transport: "SUV",
            price: 10000,
            early_bird_enabled: true,
            early_bird_discount_type: "fixed",
            early_bird_discount_value: 1000,
            early_bird_ends_at: "2026-11-30T23:59:59.999Z",
        }],
        nowMs: Date.parse("2026-10-26T12:00:00.000Z"),
    })

    assertEquals(snapshot, {
        version: 1,
        source: "operations_departure",
        currency: "INR",
        departureDate: "2026-12-20",
        options: [{
            transport: "SUV",
            sharing: "Double",
            travellerCount: 2,
            unitPriceMinor: 1_000_000,
            discountPerTravellerMinor: 100_000,
            subtotalBeforeDiscountMinor: 2_000_000,
            discountAmountMinor: 200_000,
            subtotalAfterDiscountMinor: 1_800_000,
        }],
        catalogueSubtotalMinor: 1_800_000,
        sellingSubtotalMinor: 1_800_000,
        manualAdjustmentMinor: 0,
    })
})
