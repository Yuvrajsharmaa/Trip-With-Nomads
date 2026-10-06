import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    ABANDONED_LEAD_HEADERS,
    buildAbandonedLeadSheetRow,
    buildLeadSheetRow,
    buildMasterLeadSheetRow,
    LEAD_HEADERS,
    MASTER_LEAD_HEADERS,
    NTC_INVITE_HEADERS,
    buildInviteLeadSheetRow,
} from "./lead_sheets.ts"

Deno.test("lead current and abandoned contracts are stable", () => {
    assertEquals(LEAD_HEADERS[0], "Lead ID")
    assertEquals(LEAD_HEADERS.at(-1), "Notes")
    assertEquals(ABANDONED_LEAD_HEADERS, [
        "Submission ID",
        "Lead ID",
        "Captured At",
        "Name",
        "Email",
        "Phone",
        "Source",
        "Page URL",
        "Trip ID",
        "Trip Slug",
        "Status",
        "Reason",
    ])
    assertEquals(NTC_INVITE_HEADERS[1], "Created At")
    assertEquals(NTC_INVITE_HEADERS[5], "Country Code")
    assertEquals(NTC_INVITE_HEADERS.at(-1), "Status")
    assertEquals(MASTER_LEAD_HEADERS, [
        "Lead ID", "Created At", "Name", "Email", "Phone", "Country Code",
        "Source", "Status", "Page URL", "Trip ID", "Trip Slug",
    ])
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
        },
        latestSubmissionId: "submission-1",
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
        },
        capturedAt: "2026-03-02T00:00:00.000Z",
    })
    assertEquals(leadRow.length, LEAD_HEADERS.length)
    assertEquals(leadRow[4], "guest@example.com")
    assertEquals(leadRow[16], 2)
    assertEquals(leadRow[18], "submission-1")
    assertEquals(abandonedRow.length, ABANDONED_LEAD_HEADERS.length)
    assertEquals(abandonedRow[10], "partial_fill")

    const inviteRow = buildInviteLeadSheetRow({
        lead: { id: "lead-1", first_seen_at: "2026-03-01T00:00:00.000Z", email: "GUEST@example.com" },
        submission: { source: "booking_invite", status: "submitted", reason: "friend", country_code: "+91" },
    })
    assertEquals(inviteRow.length, NTC_INVITE_HEADERS.length)
    assertEquals(inviteRow[3], "guest@example.com")
    assertEquals(inviteRow[5], "+91")

    const masterRow = buildMasterLeadSheetRow({
        lead: { id: "lead-1", first_seen_at: "2026-03-01T00:00:00.000Z", email: "GUEST@example.com" },
        status: "submitted",
    })
    assertEquals(masterRow.length, MASTER_LEAD_HEADERS.length)
    assertEquals(masterRow[3], "guest@example.com")
})
