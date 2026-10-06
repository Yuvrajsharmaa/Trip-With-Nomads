const LEAD_TIMEZONE = "Asia/Kolkata"

export const LEAD_HEADERS = [
    "Lead ID",
    "First Seen At",
    "Last Seen At",
    "Name",
    "Email",
    "Phone",
    "Instagram ID",
    "Latest Source",
    "Latest Page URL",
    "Latest Trip ID",
    "Latest Trip Slug",
    "Latest UTM Source",
    "Latest UTM Medium",
    "Latest UTM Campaign",
    "Latest UTM Term",
    "Latest UTM Content",
    "Submission Count",
    "Current Status",
    "Latest Submission ID",
    "Notes",
]

// NTC - Invites predates the normalized Leads contract. Keep that existing
// route and its human-readable columns intact while making its row writes
// idempotent by email.
export const NTC_INVITE_HEADERS = [
    "Lead ID",
    "Created At",
    "Name",
    "Email",
    "Phone",
    "Country Code",
    "Instagram ID",
    "Reason",
    "Source",
    "Page URL",
    "Trip ID",
    "Trip Slug",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "Status",
]

// Existing cross-route destination retained from the historical lead flow.
// Routed current tabs use LEAD_HEADERS; Master Leads keeps its established
// human-readable contract and is updated idempotently when configured.
export const MASTER_LEAD_HEADERS = [
    "Lead ID",
    "Created At",
    "Name",
    "Email",
    "Phone",
    "Country Code",
    "Source",
    "Status",
    "Page URL",
    "Trip ID",
    "Trip Slug",
]

export const ABANDONED_LEAD_HEADERS = [
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
]

function compact(value: any): string {
    return String(value ?? "").trim()
}

function formatTimestampIST(value?: string): string {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) return compact(value)
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: LEAD_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`
}

export function buildLeadSheetRow(params: {
    lead: Record<string, any>
    latestSubmissionId?: string
    notes?: string | null
}) {
    const lead = params.lead || {}
    return [
        compact(lead.id),
        formatTimestampIST(lead.first_seen_at || lead.created_at),
        formatTimestampIST(lead.last_seen_at || lead.updated_at || lead.created_at),
        compact(lead.name),
        compact(lead.email).toLowerCase(),
        compact(lead.phone),
        compact(lead.instagram_id),
        compact(lead.latest_source || lead.source),
        compact(lead.latest_page_url || lead.page_url),
        compact(lead.latest_trip_id || lead.trip_id),
        compact(lead.latest_trip_slug || lead.trip_slug),
        compact(lead.latest_utm_source || lead.utm_source),
        compact(lead.latest_utm_medium || lead.utm_medium),
        compact(lead.latest_utm_campaign || lead.utm_campaign),
        compact(lead.latest_utm_term || lead.utm_term),
        compact(lead.latest_utm_content || lead.utm_content),
        Math.max(0, Number(lead.submission_count || 0)),
        compact(lead.current_status || lead.status || "submitted"),
        compact(params.latestSubmissionId || lead.latest_submission_id),
        compact(params.notes || lead.notes),
    ]
}

export function buildAbandonedLeadSheetRow(params: {
    submission: Record<string, any>
    capturedAt?: string
}) {
    const submission = params.submission || {}
    return [
        compact(submission.submission_id),
        compact(submission.lead_id),
        formatTimestampIST(params.capturedAt || submission.captured_at),
        compact(submission.name),
        compact(submission.email).toLowerCase(),
        compact(submission.phone),
        compact(submission.source),
        compact(submission.page_url),
        compact(submission.trip_id),
        compact(submission.trip_slug),
        compact(submission.status || "partial_fill"),
        compact(submission.reason),
    ]
}

export function buildInviteLeadSheetRow(params: {
    lead: Record<string, any>
    submission: Record<string, any>
    notes?: string | null
}) {
    const lead = params.lead || {}
    const submission = params.submission || {}
    return [
        compact(lead.id),
        formatTimestampIST(lead.first_seen_at || lead.created_at),
        compact(lead.name),
        compact(lead.email).toLowerCase(),
        compact(lead.phone),
        compact(lead.country_code || submission.country_code),
        compact(lead.instagram_id || submission.instagram_id),
        compact(submission.reason || params.notes),
        compact(lead.latest_source || lead.source || submission.source),
        compact(lead.latest_page_url || lead.page_url || submission.page_url),
        compact(lead.latest_trip_id || lead.trip_id || submission.trip_id),
        compact(lead.latest_trip_slug || lead.trip_slug || submission.trip_slug),
        compact(lead.latest_utm_source || lead.utm_source || submission.utm_source),
        compact(lead.latest_utm_medium || lead.utm_medium || submission.utm_medium),
        compact(lead.latest_utm_campaign || lead.utm_campaign || submission.utm_campaign),
        compact(lead.current_status || lead.status || submission.status || "submitted"),
    ]
}

export function buildMasterLeadSheetRow(params: {
    lead: Record<string, any>
    status?: string
}) {
    const lead = params.lead || {}
    return [
        compact(lead.id),
        formatTimestampIST(lead.first_seen_at || lead.created_at),
        compact(lead.name),
        compact(lead.email).toLowerCase(),
        compact(lead.phone),
        compact(lead.country_code),
        compact(lead.latest_source || lead.source),
        compact(params.status || lead.current_status || lead.status || "submitted"),
        compact(lead.latest_page_url || lead.page_url),
        compact(lead.latest_trip_id || lead.trip_id),
        compact(lead.latest_trip_slug || lead.trip_slug),
    ]
}
