import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    ABANDONED_LEAD_HEADERS,
    buildAbandonedLeadSheetRow,
    buildInviteLeadSheetRow,
    buildLeadSheetRow,
    buildMasterLeadSheetRow,
    LEAD_HEADERS,
    MASTER_LEAD_HEADERS,
    NTC_INVITE_HEADERS,
} from "./lead_sheets.ts"

const SALES_LEAD_HEADERS = [
    "Captured At",
    "Last Activity",
    "Name",
    "Email",
    "Phone",
    "Company / Group",
    "Trip / Itinerary",
    "Reason / Activity",
    "Source",
    "Status",
    "Notes",
]

Deno.test("lead tabs expose only the human-readable sales contract", () => {
    assertEquals(LEAD_HEADERS, SALES_LEAD_HEADERS)
    assertEquals(MASTER_LEAD_HEADERS, SALES_LEAD_HEADERS)
    assertEquals(NTC_INVITE_HEADERS, [
        "Captured At",
        "Last Activity",
        "Name",
        "Email",
        "Phone",
        "Instagram",
        "Why They Want To Travel",
        "Trip / Itinerary",
        "Status",
        "Notes",
    ])
    assertEquals(ABANDONED_LEAD_HEADERS, [
        "Captured At",
        "Name",
        "Email",
        "Phone",
        "Trip / Itinerary",
        "Source",
        "Reason / Activity",
        "Status",
        "Notes",
    ])
})

Deno.test("lead rows preserve meaningful fields without technical identifiers", () => {
    const leadRow = buildLeadSheetRow({
        lead: {
            id: "lead-1",
            first_seen_at: "2026-03-01T00:00:00.000Z",
            last_seen_at: "2026-03-02T00:00:00.000Z",
            name: "Guest",
            email: "GUEST@example.com",
            phone: "9999999999",
            country_code: "+91",
            company_name: "Nomads Pvt Ltd",
            latest_trip_name: "Vietnam",
            latest_activity: "Downloaded itinerary",
            submission_count: 2,
            current_status: "submitted",
            notes: "Legacy country code: +91 | Lead ID: old-id | Keep this note",
        },
        latestSubmissionId: "submission-1",
        latestSubmission: {
            source: "trip_itinerary_download",
            reason: "Wants a small group",
            status: "submitted",
            itinerary_name: "Vietnam",
            page_url: "https://tripwithnomads.com/upcoming-trips?utm_source=instagram&utm_campaign=test",
        },
        notes: "Route context",
    })

    assertEquals(leadRow.length, LEAD_HEADERS.length)
    assertEquals(leadRow[0], "1 Mar 2026, 5:30 AM IST")
    assertEquals(leadRow[1], "2 Mar 2026, 5:30 AM IST")
    assertEquals(leadRow[2], "Guest")
    assertEquals(leadRow[3], "guest@example.com")
    assertEquals(leadRow[4], "+91 9999999999")
    assertEquals(leadRow[5], "Nomads Pvt Ltd")
    assertEquals(leadRow[6], "Vietnam")
    assertMatch(String(leadRow[7]), /Wants a small group/)
    assertMatch(String(leadRow[7]), /Downloaded itinerary/)
    assertEquals(leadRow[8], "Itinerary download")
    assertEquals(leadRow[9], "Submitted")
    assertEquals(leadRow[10], "Keep this note | Route context")
    assert(!leadRow.some((value) => /uuid|utm_|https?:\/\/|lead id|submission-1/i.test(String(value))))

    const abandonedRow = buildAbandonedLeadSheetRow({
        submission: {
            submission_id: "submission-2",
            lead_id: "lead-1",
            name: "Guest",
            email: "GUEST@example.com",
            phone: "9999999999",
            country_code: "+91",
            source: "trip_itinerary_download",
            status: "partial_fill",
            reason: "Downloaded itinerary",
            itinerary_name: "Japan",
            page_url: "https://tripwithnomads.com/upcoming-trips/japan?utm_source=instagram",
        },
        capturedAt: "2026-03-02T00:00:00.000Z",
    })
    assertEquals(abandonedRow.length, ABANDONED_LEAD_HEADERS.length)
    assertEquals(abandonedRow[2], "guest@example.com")
    assertEquals(abandonedRow[3], "+91 9999999999")
    assertEquals(abandonedRow[4], "Japan")
    assertEquals(abandonedRow[5], "Itinerary download")
    assertEquals(abandonedRow[6], "Downloaded itinerary")
    assertEquals(abandonedRow[7], "Partially filled")
    assert(!abandonedRow.some((value) => /https?:\/\/|submission-2|lead-1/i.test(String(value))))

    const inviteRow = buildInviteLeadSheetRow({
        lead: {
            id: "lead-1",
            first_seen_at: "2026-03-01T00:00:00.000Z",
            email: "GUEST@example.com",
            phone: "9999999999",
            country_code: "+91",
            instagram_id: "@guest",
        },
        submission: {
            source: "booking_invite",
            status: "submitted",
            reason: "Meet curious travellers",
        },
    })
    assertEquals(inviteRow.length, NTC_INVITE_HEADERS.length)
    assertEquals(inviteRow[3], "guest@example.com")
    assertEquals(inviteRow[4], "+91 9999999999")
    assertEquals(inviteRow[5], "@guest")
    assertEquals(inviteRow[6], "Meet curious travellers")
    assert(!inviteRow.some((value) => /lead-1|booking_invite/i.test(String(value))))

    const masterRow = buildMasterLeadSheetRow({
        lead: { id: "lead-1", first_seen_at: "2026-03-01T00:00:00.000Z", email: "GUEST@example.com" },
        status: "submitted",
    })
    assertEquals(masterRow.length, MASTER_LEAD_HEADERS.length)
    assertEquals(masterRow[3], "guest@example.com")
})
