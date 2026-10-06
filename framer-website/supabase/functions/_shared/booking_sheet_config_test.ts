import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { resolveBookingSheetId } from "./booking_sheet_config.ts"

Deno.test("booking writers prefer the explicit booking sheet", () => {
    assertEquals(
        resolveBookingSheetId({
            BOOKING_CALLBACK_SHEET_ID: "twn-bookings",
            GOOGLE_SHEET_ID: "legacy-bookings",
            GOOGLE_SHEET_ID_TRIPS: "trip-leads",
        }),
        "twn-bookings",
    )
})

Deno.test("booking writers fall back to the original booking sheet", () => {
    assertEquals(
        resolveBookingSheetId({
            GOOGLE_SHEET_ID: "legacy-bookings",
            GOOGLE_SHEET_ID_TRIPS: "trip-leads",
        }),
        "legacy-bookings",
    )
})

Deno.test("trip lead configuration cannot become a booking destination", () => {
    assertEquals(
        resolveBookingSheetId({ GOOGLE_SHEET_ID_TRIPS: "trip-leads" }),
        "",
    )
})
