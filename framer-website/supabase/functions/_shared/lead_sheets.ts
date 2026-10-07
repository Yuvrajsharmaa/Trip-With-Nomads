const LEAD_TIMEZONE = "Asia/Kolkata"

// The first columns are the fields a person operating the workbook needs to
// read. Reconciliation keys and campaign plumbing stay in the same row at the
// end of the contract so retries can remain idempotent without cluttering the
// working view. sheets.ts hides the technical columns when it formats a tab.
export const LEAD_HEADERS = [
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
]

// NTC Invites is an invite-specific working list. Keep the question that the
// invite form asks visible instead of folding it into an opaque notes string.
export const NTC_INVITE_HEADERS = [
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
]

// Master Leads uses the same compact current-contact view as the routed lead
// tabs. This prevents the master from becoming a second, differently named
// database while retaining all captured fields in hidden technical columns.
export const MASTER_LEAD_HEADERS = [...LEAD_HEADERS]

export const ABANDONED_LEAD_HEADERS = [
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
]

function compact(value: any): string {
    return String(value ?? "").trim()
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = compact(value)
        if (next) return next
    }
    return ""
}

function formatTimestampIST(value?: string): string {
    if (!compact(value)) return ""
    const date = new Date(value as string)
    if (Number.isNaN(date.getTime())) return compact(value)
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: LEAD_TIMEZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
    const period = get("dayPeriod").toUpperCase()
    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${period} IST`
}

function humanize(value: unknown, fallback = ""): string {
    const text = compact(value)
    if (!text) return fallback
    return text
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function humanizeLeadSource(value: unknown): string {
    const source = compact(value).toLowerCase()
    const labels: Record<string, string> = {
        waitlist_popup: "Waitlist form",
        booking_invite: "NTC invite",
        trip_page_lead: "Trip page form",
        general_lead: "General enquiry",
        custom_trip_lead: "Custom trip enquiry",
        booking_abandoned: "Checkout abandoned",
    }
    return labels[source] ||
        (source ? `Unknown source: ${humanize(source)}` : "")
}

export function humanizeLeadStatus(value: unknown): string {
    const status = compact(value).toLowerCase()
    const labels: Record<string, string> = {
        submitted: "Submitted",
        partial_fill: "Partially filled",
        abandoned_booking: "Checkout abandoned",
        converted: "Converted",
        booked: "Booked",
        paid: "Paid",
        customer: "Customer",
        closed_won: "Closed won",
        closed_lost: "Closed lost",
        won: "Won",
        lost: "Lost",
    }
    return labels[status] || (status ? humanize(status) : "")
}

export function humanizeTrip(value: unknown): string {
    const raw = compact(value)
    if (!raw) return ""
    return humanize(raw.replace(/-twn$/i, ""))
}

function humanizePage(value: unknown): string {
    const raw = compact(value)
    if (!raw) return ""
    try {
        const parsed = new URL(raw)
        return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "") || parsed.host
    } catch {
        return raw.split(/[?#]/, 1)[0].replace(/\/$/, "")
    }
}

function cleanNotes(value: unknown): string {
    const text = compact(value)
    if (!text) return ""
    // Older repair rows put internal keys and defaults into Notes. Do not
    // carry those strings into the human-facing contract.
    return text
        .split("|")
        .map((part) => part.trim())
        .filter((part) => !/^legacy\s+(country code|utm|reason)/i.test(part))
        .filter((part) => !/^lead id\s*:/i.test(part))
        .filter((part) => !/^country code\s*:/i.test(part))
        .filter((part) => !/^utm\s+(source|medium|campaign|term|content)\s*:/i.test(part))
        .filter(Boolean)
        .join(" | ")
}

function leadFields(params: {
    lead: Record<string, any>
    latestSubmissionId?: string
    latestSubmission?: Record<string, any>
    notes?: string | null
    status?: string
}) {
    const lead = params.lead || {}
    const submission = params.latestSubmission || {}
    const sourceKey = firstNonEmpty(
        lead.latest_source,
        lead.source,
        submission.source,
    )
    const statusKey = firstNonEmpty(
        params.status,
        lead.current_status,
        lead.status,
        submission.status,
        "submitted",
    )
    const reason = firstNonEmpty(
        submission.reason,
        lead.latest_reason,
        lead.reason,
    )
    const tripKey = firstNonEmpty(
        lead.latest_trip_slug,
        lead.trip_slug,
        submission.trip_slug,
    )
    const page = firstNonEmpty(
        lead.latest_page_url,
        lead.page_url,
        submission.page_url,
    )

    return {
        firstSeen: formatTimestampIST(
            firstNonEmpty(lead.first_seen_at, lead.created_at),
        ),
        lastSeen: formatTimestampIST(
            firstNonEmpty(lead.last_seen_at, lead.updated_at, lead.created_at),
        ),
        name: firstNonEmpty(lead.name, submission.name),
        email: firstNonEmpty(lead.email, submission.email).toLowerCase(),
        phone: firstNonEmpty(lead.phone, submission.phone),
        countryCode: firstNonEmpty(lead.country_code, submission.country_code),
        instagram: firstNonEmpty(lead.instagram_id, submission.instagram_id),
        source: humanizeLeadSource(sourceKey),
        sourceKey,
        page: humanizePage(page),
        trip: humanizeTrip(tripKey),
        tripKey,
        reason,
        submissions: Math.max(0, Number(lead.submission_count || 0)),
        status: humanizeLeadStatus(statusKey),
        statusKey,
        notes: cleanNotes([lead.notes, params.notes].filter(Boolean).join(" | ")),
        leadKey: compact(lead.id),
        latestSubmissionKey: firstNonEmpty(
            params.latestSubmissionId,
            lead.latest_submission_id,
        ),
        utmSource: firstNonEmpty(
            lead.latest_utm_source,
            lead.utm_source,
            submission.utm_source,
        ),
        utmMedium: firstNonEmpty(
            lead.latest_utm_medium,
            lead.utm_medium,
            submission.utm_medium,
        ),
        utmCampaign: firstNonEmpty(
            lead.latest_utm_campaign,
            lead.utm_campaign,
            submission.utm_campaign,
        ),
        utmTerm: firstNonEmpty(
            lead.latest_utm_term,
            lead.utm_term,
            submission.utm_term,
        ),
        utmContent: firstNonEmpty(
            lead.latest_utm_content,
            lead.utm_content,
            submission.utm_content,
        ),
    }
}

export function buildLeadSheetRow(params: {
    lead: Record<string, any>
    latestSubmissionId?: string
    latestSubmission?: Record<string, any>
    notes?: string | null
}) {
    const fields = leadFields(params)
    return [
        fields.firstSeen,
        fields.lastSeen,
        fields.name,
        fields.email,
        fields.phone,
        fields.countryCode,
        fields.instagram,
        fields.source,
        fields.page,
        fields.trip,
        fields.reason,
        fields.submissions,
        fields.status,
        fields.notes,
        fields.leadKey,
        fields.latestSubmissionKey,
        fields.tripKey,
        fields.sourceKey,
        fields.statusKey,
        fields.utmSource,
        fields.utmMedium,
        fields.utmCampaign,
        fields.utmTerm,
        fields.utmContent,
    ]
}

export function buildAbandonedLeadSheetRow(params: {
    submission: Record<string, any>
    capturedAt?: string
}) {
    const submission = params.submission || {}
    const sourceKey = compact(submission.source)
    const statusKey = compact(submission.status || "partial_fill")
    return [
        formatTimestampIST(params.capturedAt || submission.captured_at),
        compact(submission.name),
        compact(submission.email).toLowerCase(),
        compact(submission.phone),
        compact(submission.country_code),
        compact(submission.instagram_id),
        humanizeLeadSource(sourceKey),
        humanizePage(submission.page_url),
        humanizeTrip(submission.trip_slug),
        humanizeLeadStatus(statusKey),
        compact(submission.reason),
        cleanNotes(submission.notes),
        compact(submission.submission_id),
        compact(submission.lead_id),
        compact(submission.trip_id),
        sourceKey,
        statusKey,
        compact(submission.utm_source),
        compact(submission.utm_medium),
        compact(submission.utm_campaign),
        compact(submission.utm_term),
        compact(submission.utm_content),
    ]
}

export function buildInviteLeadSheetRow(params: {
    lead: Record<string, any>
    submission: Record<string, any>
    latestSubmissionId?: string
    notes?: string | null
}) {
    const fields = leadFields({
        lead: params.lead,
        latestSubmissionId: params.latestSubmissionId,
        latestSubmission: params.submission,
        notes: params.notes,
    })
    return [
        fields.firstSeen,
        fields.lastSeen,
        fields.name,
        fields.email,
        fields.phone,
        fields.countryCode,
        fields.instagram,
        fields.reason,
        fields.source,
        fields.page,
        fields.trip,
        fields.submissions,
        fields.status,
        fields.notes,
        fields.leadKey,
        fields.latestSubmissionKey,
        fields.tripKey,
        fields.sourceKey,
        fields.statusKey,
        fields.utmSource,
        fields.utmMedium,
        fields.utmCampaign,
        fields.utmTerm,
        fields.utmContent,
    ]
}

export function buildMasterLeadSheetRow(params: {
    lead: Record<string, any>
    status?: string
    latestSubmissionId?: string
    latestSubmission?: Record<string, any>
    notes?: string | null
}) {
    const row = buildLeadSheetRow({
        lead: params.lead,
        latestSubmissionId: params.latestSubmissionId,
        latestSubmission: params.latestSubmission,
        notes: params.notes,
    })
    if (params.status) row[12] = humanizeLeadStatus(params.status)
    if (params.status) row[18] = compact(params.status)
    return row
}
