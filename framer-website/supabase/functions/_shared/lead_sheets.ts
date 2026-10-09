import { timestampToSheetSerial } from "./sheet_dates.ts"

export const LEAD_HEADERS = [
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

export const NTC_INVITE_HEADERS = [
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
]

export const MASTER_LEAD_HEADERS = [...LEAD_HEADERS]

export const ABANDONED_LEAD_HEADERS = [
    "Captured At",
    "Name",
    "Email",
    "Phone",
    "Trip / Itinerary",
    "Source",
    "Reason / Activity",
    "Status",
    "Notes",
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

function uniqueStrings(values: unknown[]): string[] {
    const output: string[] = []
    const seen = new Set<string>()
    for (const value of values) {
        const text = compact(value)
        if (!text) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        output.push(text)
    }
    return output
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
        trip_itinerary_download: "Itinerary download",
        general_lead: "General enquiry",
        generic_form: "General enquiry",
        corporate_lead: "Corporate enquiry",
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

function formatPhone(countryCode: unknown, phone: unknown): string {
    const rawPhone = compact(phone)
    if (!rawPhone) return ""
    if (rawPhone.startsWith("+")) return rawPhone
    const country = compact(countryCode)
    if (!country) return rawPhone
    const prefix = country.startsWith("+") ? country : `+${country.replace(/\D/g, "")}`
    return prefix === "+" ? rawPhone : `${prefix} ${rawPhone}`
}

function cleanNotes(value: unknown): string {
    const text = compact(value)
    if (!text) return ""
    return text
        .split("|")
        .map((part) => part.trim())
        .filter((part) => !/^legacy\s+(country code|utm|reason)/i.test(part))
        .filter((part) => !/^(lead|submission|trip|source|status)\s+id\s*:/i.test(part))
        .filter((part) => !/^country code\s*:/i.test(part))
        .filter((part) => !/^utm\s+(source|medium|campaign|term|content)\s*:/i.test(part))
        .filter(Boolean)
        .join(" | ")
}

function companyName(lead: Record<string, any>, submission: Record<string, any>): string {
    const fromNotes = [lead.notes, submission.notes]
        .map((value) => compact(value).match(/(?:^|\|)\s*company\s*:\s*([^|]+)/i)?.[1] || "")
    return firstNonEmpty(
        lead.company_name,
        lead.company,
        lead.group_name,
        submission.company_name,
        submission.company,
        ...fromNotes,
    )
}

function itineraryNames(lead: Record<string, any>, submission: Record<string, any>): string {
    const arrayValues = [
        ...(Array.isArray(lead.downloaded_itineraries) ? lead.downloaded_itineraries : []),
        ...(Array.isArray(submission.downloaded_itineraries)
            ? submission.downloaded_itineraries
            : []),
    ]
    const values = uniqueStrings([
        ...arrayValues,
        lead.latest_itinerary_name,
        submission.itinerary_name,
        lead.latest_trip_name,
        submission.trip_name,
        lead.latest_trip_slug,
        lead.trip_slug,
        submission.trip_slug,
    ])
    return uniqueStrings(values.map(humanizeTrip)).join(", ")
}

function activityText(lead: Record<string, any>, submission: Record<string, any>): string {
    const source = compact(submission.source || lead.latest_source).toLowerCase()
    const reason = firstNonEmpty(
        submission.reason,
        lead.latest_reason,
        lead.reason,
    )
    const activity = firstNonEmpty(
        submission.activity_label,
        submission.activity,
        lead.latest_activity,
    )
    const values = uniqueStrings([
        reason === "partial_fill" ? "" : reason,
        activity,
        source === "trip_itinerary_download" ? "Downloaded itinerary" : "",
    ])
    return values.join(" | ")
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
    const sourceKey = firstNonEmpty(lead.latest_source, lead.source, submission.source)
    const statusKey = firstNonEmpty(
        params.status,
        lead.current_status,
        lead.status,
        submission.status,
        "submitted",
    )
    const company = companyName(lead, submission)
    const source = sourceKey === "general_lead" && company
        ? "Corporate enquiry"
        : humanizeLeadSource(sourceKey)
    const notes = cleanNotes(
        [lead.notes, submission.notes, params.notes]
            .filter(Boolean)
            .join(" | ")
            .replace(/(?:^|\|)\s*company\s*:\s*[^|]+/gi, ""),
    )

    return {
        capturedAt: timestampToSheetSerial(firstNonEmpty(
            lead.first_seen_at,
            lead.created_at,
            submission.captured_at,
            submission.created_at,
        )),
        lastActivity: timestampToSheetSerial(firstNonEmpty(
            lead.last_seen_at,
            lead.updated_at,
            lead.created_at,
            submission.captured_at,
            submission.created_at,
        )),
        name: firstNonEmpty(lead.name, submission.name),
        email: firstNonEmpty(lead.email, submission.email).toLowerCase(),
        phone: formatPhone(
            firstNonEmpty(lead.country_code, submission.country_code),
            firstNonEmpty(lead.phone, submission.phone),
        ),
        company,
        trip: itineraryNames(lead, submission),
        activity: activityText(lead, submission),
        source,
        status: humanizeLeadStatus(statusKey),
        notes,
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
        fields.capturedAt,
        fields.lastActivity,
        fields.name,
        fields.email,
        fields.phone,
        fields.company,
        fields.trip,
        fields.activity,
        fields.source,
        fields.status,
        fields.notes,
    ]
}

export function buildAbandonedLeadSheetRow(params: {
    submission: Record<string, any>
    capturedAt?: string
}) {
    const submission = params.submission || {}
    const sourceKey = compact(submission.source)
    const fields = leadFields({
        lead: {},
        latestSubmission: submission,
    })
    return [
        timestampToSheetSerial(params.capturedAt || submission.captured_at || submission.created_at),
        fields.name,
        fields.email,
        fields.phone,
        fields.trip,
        fields.source,
        fields.activity ||
        (sourceKey === "booking_abandoned"
            ? "Checkout abandoned before payment"
            : "Partially filled form"),
        humanizeLeadStatus(submission.status || "partial_fill"),
        fields.notes,
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
        fields.capturedAt,
        fields.lastActivity,
        fields.name,
        fields.email,
        fields.phone,
        firstNonEmpty(params.lead.instagram_id, params.submission.instagram_id),
        firstNonEmpty(params.submission.reason, params.lead.latest_reason, params.lead.reason),
        fields.trip,
        fields.status,
        fields.notes,
    ]
}

export function buildMasterLeadSheetRow(params: {
    lead: Record<string, any>
    status?: string
    latestSubmissionId?: string
    latestSubmission?: Record<string, any>
    notes?: string | null
}) {
    const lead = params.lead || {}
    const latestSubmission = params.latestSubmission || {}
    const isBookingAbandonment =
        compact(latestSubmission.source).toLowerCase() === "booking_abandoned"
    let status = params.status
    let projectedLead = lead
    let projectedSubmission = latestSubmission

    if (isBookingAbandonment) {
        // Checkout abandonment is still a follow-up lead in Master Leads.
        // Keep a terminal CRM outcome (paid/converted/closed) from being
        // downgraded, while exposing the latest checkout activity and trip.
        const currentStatus = firstNonEmpty(lead.current_status, lead.status).toLowerCase()
        const terminalStatuses = new Set([
            "paid",
            "booked",
            "converted",
            "customer",
            "closed_won",
            "closed_lost",
            "won",
            "lost",
        ])
        if (terminalStatuses.has(currentStatus)) status = firstNonEmpty(lead.current_status, lead.status)
        projectedLead = { ...lead, latest_source: "booking_abandoned" }
        projectedSubmission = {
            ...latestSubmission,
            source: "booking_abandoned",
            reason: firstNonEmpty(
                latestSubmission.reason,
                "Checkout abandoned before payment",
            ),
            activity_label: firstNonEmpty(
                latestSubmission.activity_label,
                "Checkout abandoned before payment",
            ),
        }
    }

    return buildLeadSheetRow({
        lead: projectedLead,
        latestSubmissionId: params.latestSubmissionId,
        latestSubmission: projectedSubmission,
        notes: params.notes,
    }).map((value, index) =>
        index === 9 && status ? humanizeLeadStatus(status) : value
    )
}
