export type LeadLocation = {
    sheetId: string
    tab: string
}

export type LeadSheetEnvironment = {
    original?: string | null
    ntc?: string | null
    tripLeads?: string | null
    // Backward-compatible alias for older callers. New callers should use
    // tripLeads so the booking workbook can never be mistaken for this route.
    trips?: string | null
    custom?: string | null
    general?: string | null
}

function clean(value: unknown): string {
    return String(value ?? "").trim()
}

function location(sheetId: unknown, tab: string): LeadLocation | null {
    const normalizedSheetId = clean(sheetId)
    const normalizedTab = clean(tab)
    return normalizedSheetId && normalizedTab
        ? { sheetId: normalizedSheetId, tab: normalizedTab }
        : null
}

export function targetForLead(
    source: string,
    status: string,
    env: LeadSheetEnvironment,
): LeadLocation | null {
    const normalizedSource = clean(source).toLowerCase()
    const normalizedStatus = clean(status).toLowerCase()
    const isPartial = normalizedStatus === "partial_fill"

    if (normalizedSource === "booking_invite") {
        return location(
            env.ntc || env.original,
            isPartial ? "Abandoned Leads" : "NTC - Invites",
        )
    }

    if (normalizedSource === "trip_page_lead") {
        return location(
            env.tripLeads || env.trips || env.general || env.original,
            isPartial ? "Abandoned Leads" : "Leads",
        )
    }

    // Booking abandonment historically belongs to the general current-contact
    // route. It is an event in Supabase, but it must remain visible to the
    // existing general lead workflow for compatibility.
    if (normalizedSource === "booking_abandoned") {
        return location(env.general || env.original, "Leads")
    }

    if (normalizedSource === "custom_trip_lead" && clean(env.custom)) {
        // This route is enabled only when a configured custom workbook exists.
        // The Sheet helper still validates that the existing tab and headers are
        // present; it never creates them.
        return location(
            env.custom,
            isPartial ? "Abandoned Leads" : "Custom Trip Leads",
        )
    }

    return location(
        env.general || env.original,
        isPartial ? "Abandoned Leads" : "Leads",
    )
}

export function configuredLeadLocations(env: LeadSheetEnvironment): LeadLocation[] {
    const candidates = [
        location(env.ntc, "NTC - Invites"),
        location(env.ntc, "Abandoned Leads"),
        location(env.tripLeads || env.trips, "Leads"),
        location(env.tripLeads || env.trips, "Abandoned Leads"),
        location(env.custom, "Custom Trip Leads"),
        location(env.custom, "Abandoned Leads"),
        location(env.general, "Leads"),
        location(env.general, "Abandoned Leads"),
        location(env.original, "Leads"),
    ]
    return candidates.filter((candidate, index, all): candidate is LeadLocation =>
        Boolean(candidate) && all.findIndex((item) =>
            item?.sheetId === candidate?.sheetId && item?.tab === candidate?.tab
        ) === index
    )
}
