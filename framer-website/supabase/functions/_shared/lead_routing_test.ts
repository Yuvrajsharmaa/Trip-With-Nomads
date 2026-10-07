import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { configuredLeadLocations, targetForLead } from "./lead_routing.ts"

const env = {
    original: "original-sheet",
    ntc: "ntc-sheet",
    tripLeads: "trip-leads-sheet",
    trips: "legacy-trip-leads-sheet",
    custom: "custom-sheet",
    general: "general-sheet",
    booking: "booking-sheet",
}

Deno.test("lead routing preserves existing destinations and partial history", () => {
    assertEquals(targetForLead("booking_invite", "submitted", env), {
        sheetId: "ntc-sheet",
        tab: "NTC - Invites",
    })
    assertEquals(targetForLead("booking_invite", "partial_fill", env), {
        sheetId: "ntc-sheet",
        tab: "Abandoned Leads",
    })
    assertEquals(targetForLead("trip_page_lead", "submitted", env), {
        sheetId: "trip-leads-sheet",
        tab: "Leads",
    })
    assertEquals(targetForLead("custom_trip_lead", "submitted", env), {
        sheetId: "custom-sheet",
        tab: "Custom Trip Leads",
    })
    assertEquals(targetForLead("custom_trip_lead", "partial_fill", env), {
        sheetId: "custom-sheet",
        tab: "Abandoned Leads",
    })
    assertEquals(targetForLead("booking_abandoned", "abandoned_booking", env), {
        sheetId: "booking-sheet",
        tab: "Abandoned Bookings",
    })
})

Deno.test("custom route is not guessed when its workbook is not configured", () => {
    assertEquals(
        targetForLead("custom_trip_lead", "submitted", {
            original: "original-sheet",
            general: "general-sheet",
        }),
        {
            sheetId: "general-sheet",
            tab: "Leads",
        },
    )
})

Deno.test("configured lead locations are unique and never invent tabs", () => {
    assertEquals(configuredLeadLocations(env), [
        { sheetId: "ntc-sheet", tab: "NTC - Invites" },
        { sheetId: "ntc-sheet", tab: "Abandoned Leads" },
        { sheetId: "trip-leads-sheet", tab: "Leads" },
        { sheetId: "trip-leads-sheet", tab: "Abandoned Leads" },
        { sheetId: "custom-sheet", tab: "Custom Trip Leads" },
        { sheetId: "custom-sheet", tab: "Abandoned Leads" },
        { sheetId: "general-sheet", tab: "Leads" },
        { sheetId: "general-sheet", tab: "Abandoned Leads" },
        { sheetId: "booking-sheet", tab: "Abandoned Bookings" },
        { sheetId: "original-sheet", tab: "Leads" },
    ])
})

Deno.test("trip-page leads fall back to the legacy trip-leads alias, never the booking route", () => {
    assertEquals(
        targetForLead("trip_page_lead", "submitted", {
            original: "booking-sheet",
            trips: "legacy-trip-leads-sheet",
            general: "general-sheet",
        }),
        {
            sheetId: "legacy-trip-leads-sheet",
            tab: "Leads",
        },
    )
})
