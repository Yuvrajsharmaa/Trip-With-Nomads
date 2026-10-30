import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("create-booking persists a checkout request and replays its attempt", async () => {
    const source = await Deno.readTextFile(
        new URL("./index.ts", import.meta.url),
    )

    assertStringIncludes(source, 'from "../../../framer/booking-tax.ts"')
    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "trip_slug")
    assertStringIncludes(source, "canonicalizing trip ID from slug")
    assertStringIncludes(source, "checkout_request_fingerprint")
    assertStringIncludes(source, "fingerprintBookingRequest")
    assertStringIncludes(source, 'from("payment_attempts")')
    assertStringIncludes(source, "IDEMPOTENCY_CONFLICT")
    assertStringIncludes(source, "!replayed")
    assertStringIncludes(source, "gateway: activeProvider")
    assertStringIncludes(source, "todayISTDateKey")
    assertStringIncludes(source, "computeBasePricing")
    assertStringIncludes(source, "loadWebsiteTripCatalogPricing")
    assertStringIncludes(source, "validateWebsiteDepartureSelection")
    assertStringIncludes(source, 'schema("crm").rpc("create_booking_draft"')
    assertStringIncludes(source, 'schema("crm").rpc("reserve_website_booking_payment_attempt"')
    assertStringIncludes(source, "p_expected_booking_updated_at: data.updated_at")
    assertStringIncludes(source, "currentBookingPaymentAmountMinor")
    assertStringIncludes(source, "p_request_key: checkoutRequestId")
    assertStringIncludes(source, "p_booking: insertPayload")
    assertStringIncludes(source, "trip_catalog_id: crmTripCatalogId")
    assertStringIncludes(source, "billing_snapshot: billingSnapshot")
    assertStringIncludes(source, "commercial_snapshot: commercialSnapshot")
    assertStringIncludes(source, "couponCompatibilityPayload")
    const couponWriteStart = source.indexOf("const couponCompatibilityWrite")
    const couponWriteEnd = source.indexOf("data = couponCompatibilityWrite.data", couponWriteStart)
    const couponWrite = source.slice(couponWriteStart, couponWriteEnd)
    assertStringIncludes(couponWrite, '.eq("updated_at", data.updated_at)')
    assertStringIncludes(couponWrite, '.select("*")')
    assertStringIncludes(couponWrite, ".maybeSingle()")
    assertStringIncludes(source, "if (!couponCompatibilityWrite.data)")
    assertStringIncludes(source, 'sqlState === "23514"')
    assertStringIncludes(source, '"PAYMENT_ATTEMPT_CONFLICT"')
    assertStringIncludes(source, '}, conflict ? 409 : 500)')
    assertStringIncludes(source, "Enter a name for every traveller")
    if (source.includes("Enter a name and gender for every traveller")) {
        throw new Error("Website booking must not require gender at checkout")
    }
    const travellerValidationStart = source.indexOf(
        "if (!existingBooking && canonicalTravellers.some",
    )
    const travellerValidationEnd = source.indexOf("let billingSnapshot", travellerValidationStart)
    const travellerValidation = source.slice(travellerValidationStart, travellerValidationEnd)
    assertStringIncludes(travellerValidation, "(traveller) => !traveller.name")
    if (travellerValidation.includes("gender")) {
        throw new Error("Website booking validation must leave gender for CRM follow-up")
    }
    assertStringIncludes(source, "gender: String(source?.gender || \"\").trim()")
    const localBreakdownSource = source.slice(
        source.indexOf("function buildLocalPricingBreakdown"),
        source.indexOf("function isInviteOnlyTrip"),
    )
    assertStringIncludes(localBreakdownSource, "gender: String(traveller.gender || \"\").trim()")
    assertStringIncludes(source, "buildWebsiteBillingSnapshot")
    if (source.includes('.from("trip_pricing")')) {
        throw new Error("create-booking must use Operations catalogue rates, not legacy website pricing")
    }
    if (source.includes('.from("bookings")\n                .insert(insertPayload)')) {
        throw new Error("new website bookings must go through the CRM shared booking RPC")
    }
    assertStringIncludes(source, "already_paid")
    assertStringIncludes(source, "PAYMENT_PROVIDER_UNSUPPORTED")
    assertStringIncludes(source, "BOOKING_CALLBACK_SHEET_ID")
    if (source.includes('Deno.env.get("GOOGLE_SHEET_ID_TRIPS")')) {
        throw new Error(
            "create-booking must never use the trip-lead workbook as a booking Sheet fallback",
        )
    }
    assertStringIncludes(source, "key_id: credentials.keyId")
    if (source.includes("key: credentials.keyId")) {
        throw new Error(
            "create-booking must return the key_id field consumed by the checkout client",
        )
    }
    if (
        source.includes('activeProvider === "payu"') ||
        source.includes("responsePayload.payu")
    ) {
        throw new Error(
            "create-booking must not emit an unsupported PayU checkout",
        )
    }
})
