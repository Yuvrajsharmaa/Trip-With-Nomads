import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
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

Deno.test("lead current and abandoned contracts are stable", () => {
    assertEquals(LEAD_HEADERS, [
        "First Seen",
        "Last Seen",
        "Name",
        "Email",
        "Phone",
        "Country Code",
        "Instagram",
        "Source",
        "Page",
        "Trip",
        "Reason",
        "Submissions",
        "Status",
        "Notes",
        "Lead Key",
        "Latest Submission Key",
        "Trip Key",
        "Source Key",
        "Status Key",
        "UTM Source",
        "UTM Medium",
        "UTM Campaign",
        "UTM Term",
        "UTM Content",
    ])
    assertEquals(ABANDONED_LEAD_HEADERS, [
        "Captured At",
        "Name",
        "Email",
        "Phone",
        "Country Code",
        "Instagram",
        "Source",
        "Page",
        "Trip",
        "Status",
        "Reason",
        "Notes",
        "Submission Key",
        "Lead Key",
        "Trip Key",
        "Source Key",
        "Status Key",
        "UTM Source",
        "UTM Medium",
        "UTM Campaign",
        "UTM Term",
        "UTM Content",
    ])
    assertEquals(NTC_INVITE_HEADERS, [
        "First Seen",
        "Last Seen",
        "Name",
        "Email",
        "Phone",
        "Country Code",
        "Instagram",
        "Why They Want To Travel",
        "Source",
        "Page",
        "Trip",
        "Submissions",
        "Status",
        "Notes",
        "Lead Key",
        "Latest Submission Key",
        "Trip Key",
        "Source Key",
        "Status Key",
        "UTM Source",
        "UTM Medium",
        "UTM Campaign",
        "UTM Term",
        "UTM Content",
    ])
    assertEquals(MASTER_LEAD_HEADERS, LEAD_HEADERS)
})

Deno.test("lead builders preserve latest identity and submission fields", () => {
    const leadRow = buildLeadSheetRow({
        lead: {
            id: "lead-1",
            first_seen_at: "2026-03-01T00:00:00.000Z",
            last_seen_at: "2026-03-02T00:00:00.000Z",
            name: "Guest",
            email: "GUEST@example.com",
            submission_count: 2,
            current_status: "submitted",
            notes: "Legacy country code: +91 | Lead ID: old-id | Keep this note",
        },
        latestSubmissionId: "submission-1",
        latestSubmission: {
            source: "trip_page_lead",
            reason: "Wants a small group",
            status: "submitted",
            page_url: "https://tripwithnomads.com/upcoming-trips?utm_source=instagram&utm_campaign=test",
        },
        notes: "Route context",
    })
    const abandonedRow = buildAbandonedLeadSheetRow({
        submission: {
            submission_id: "submission-2",
            lead_id: "",
            name: "Guest",
            email: "GUEST@example.com",
            source: "trip_page_lead",
            status: "partial_fill",
            reason: "email_missing",
            page_url: "https://tripwithnomads.com/upcoming-trips/vietnam-twn?utm_source=instagram",
        },
        capturedAt: "2026-03-02T00:00:00.000Z",
    })
    assertEquals(leadRow.length, LEAD_HEADERS.length)
    assertEquals(leadRow[3], "guest@example.com")
    assertEquals(leadRow[10], "Wants a small group")
    assertEquals(leadRow[11], 2)
    assertEquals(leadRow[12], "Submitted")
    assertEquals(leadRow[13], "Keep this note | Route context")
    assertEquals(leadRow[8], "tripwithnomads.com/upcoming-trips")
    assertEquals(leadRow[15], "submission-1")
    assertEquals(abandonedRow.length, ABANDONED_LEAD_HEADERS.length)
    assertEquals(abandonedRow[9], "Partially filled")
    assertEquals(abandonedRow[10], "email_missing")
    assertEquals(abandonedRow[7], "tripwithnomads.com/upcoming-trips/vietnam-twn")

    const inviteRow = buildInviteLeadSheetRow({
        lead: { id: "lead-1", first_seen_at: "2026-03-01T00:00:00.000Z", email: "GUEST@example.com" },
        submission: { source: "booking_invite", status: "submitted", reason: "friend", country_code: "+91" },
    })
    assertEquals(inviteRow.length, NTC_INVITE_HEADERS.length)
    assertEquals(inviteRow[3], "guest@example.com")
    assertEquals(inviteRow[5], "+91")
    assertEquals(inviteRow[7], "friend")

    const masterRow = buildMasterLeadSheetRow({
        lead: { id: "lead-1", first_seen_at: "2026-03-01T00:00:00.000Z", email: "GUEST@example.com" },
        status: "submitted",
    })
    assertEquals(masterRow.length, MASTER_LEAD_HEADERS.length)
    assertEquals(masterRow[3], "guest@example.com")
})
