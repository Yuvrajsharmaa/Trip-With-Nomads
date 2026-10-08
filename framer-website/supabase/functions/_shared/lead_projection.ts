import {
    appendHistoryRowOnceByFingerprint,
    sheetsEnabled,
    upsertCurrentRow,
} from "./sheets.ts"
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
import { targetForLead } from "./lead_routing.ts"

export type LeadProjectionParams = {
    lead: any | null
    submission: any
    submissionId: string
    source: string
    status: string
    notes?: string
    supabase?: any
}

export type LeadProjectionResult = {
    sheetLogged: boolean
    masterLogged: boolean
    sheetStatus: "synced"
}

function compact(value: unknown): string {
    return String(value ?? "").trim()
}

function normalizeEmail(value: unknown): string {
    return compact(value).toLowerCase()
}

function routeForLead(source: string, status: string) {
    const route = targetForLead(source, status, {
        ntc: Deno.env.get("GOOGLE_SHEET_ID_NTC"),
        tripLeads: Deno.env.get("GOOGLE_SHEET_ID_TRIP_LEADS"),
        custom: Deno.env.get("GOOGLE_SHEET_ID_CUSTOM_TRIPS") ||
            Deno.env.get("CUSTOM_TRIPS_SHEET_ID"),
        general: Deno.env.get("GOOGLE_SHEET_ID_GENERAL") ||
            Deno.env.get("GOOGLE_SHEET_ID_LEADS"),
        booking: Deno.env.get("GOOGLE_SHEET_ID_BOOKINGS") ||
            Deno.env.get("GOOGLE_SHEET_ID"),
    })
    if (!route) {
        throw new Error(`Sheet route configuration missing for source=${source}, status=${status}`)
    }
    return route
}

function projectionFingerprintColumns(): string[] {
    return [
        "Captured At",
        "Email",
        "Phone",
        "Trip / Itinerary",
        "Source",
        "Reason / Activity",
    ]
}

function projectionFingerprint(values: (string | number | null)[]): string {
    return values.map((value) => String(value ?? "").trim()).join("\u001f")
}

async function saveProjectionAttempt(params: {
    supabase?: any
    submissionId: string
    sheetId: string
    tab: string
    projectionType: "current" | "history" | "master"
    projectionKey: string
    values: (string | number | null)[]
    status: "pending" | "synced" | "failed" | "configuration_missing"
    errorMessage?: string
}) {
    if (!params.supabase) return
    try {
        const existing = await params.supabase
            .from("lead_sheet_projection_attempts")
            .select("attempt_count")
            .match({
                submission_id: params.submissionId,
                sheet_id: params.sheetId,
                tab: params.tab,
                projection_type: params.projectionType,
            })
            .maybeSingle()
        if (existing.error) throw existing.error
        const now = new Date().toISOString()
        const attemptCount = Number(existing.data?.attempt_count || 0) + 1
        const row = {
            submission_id: params.submissionId,
            sheet_id: params.sheetId,
            tab: params.tab,
            projection_type: params.projectionType,
            projection_key: params.projectionKey,
            status: params.status,
            row_fingerprint: projectionFingerprint(params.values),
            attempt_count: attemptCount,
            last_attempt_at: now,
            synced_at: params.status === "synced" ? now : null,
            error_message: compact(params.errorMessage).slice(0, 500) || null,
            updated_at: now,
        }
        const result = await params.supabase
            .from("lead_sheet_projection_attempts")
            .upsert(row, { onConflict: "submission_id,sheet_id,tab,projection_type" })
        if (result.error) throw result.error
    } catch (error) {
        // The lead submission status remains the authoritative retry flag. A
        // projection-attempt row is supplemental state, so an unavailable
        // table must not prevent the actual Sheet projection from succeeding.
        console.error("[lead-projection] attempt state unavailable", error)
    }
}

async function runProjectionAttempt(params: {
    projection: LeadProjectionParams
    sheetId: string
    tab: string
    projectionType: "current" | "history" | "master"
    projectionKey: string
    values: (string | number | null)[]
    action: () => Promise<unknown>
}) {
    await saveProjectionAttempt({
        supabase: params.projection.supabase,
        submissionId: params.projection.submissionId,
        sheetId: params.sheetId,
        tab: params.tab,
        projectionType: params.projectionType,
        projectionKey: params.projectionKey,
        values: params.values,
        status: "pending",
    })
    try {
        const result = await params.action()
        await saveProjectionAttempt({
            supabase: params.projection.supabase,
            submissionId: params.projection.submissionId,
            sheetId: params.sheetId,
            tab: params.tab,
            projectionType: params.projectionType,
            projectionKey: params.projectionKey,
            values: params.values,
            status: "synced",
        })
        return result
    } catch (error: any) {
        const status = projectionConfigurationError(error?.message || error)
        await saveProjectionAttempt({
            supabase: params.projection.supabase,
            submissionId: params.projection.submissionId,
            sheetId: params.sheetId,
            tab: params.tab,
            projectionType: params.projectionType,
            projectionKey: params.projectionKey,
            values: params.values,
            status,
            errorMessage: error?.message || String(error),
        })
        throw error
    }
}

export async function projectLeadSheets(
    params: LeadProjectionParams,
): Promise<LeadProjectionResult> {
    if (!sheetsEnabled()) {
        throw new Error("Sheet configuration missing: SHEETS_WRITE_ENABLED is not enabled")
    }

    const route = routeForLead(params.source, params.status)
    const isHistoryEvent = params.status === "partial_fill" ||
        params.source === "booking_abandoned"

    if (isHistoryEvent) {
        const values = buildAbandonedLeadSheetRow({
            submission: {
                ...params.submission,
                submission_id: params.submissionId,
                lead_id: params.lead?.id || "",
                reason: params.submission.reason || params.status || "partial_fill",
            },
        })
        await runProjectionAttempt({
            projection: params,
            sheetId: route.sheetId,
            tab: route.tab,
            projectionType: "history",
            projectionKey: params.submissionId,
            values,
            action: () => appendHistoryRowOnceByFingerprint(
                route.sheetId,
                route.tab,
                values,
                ABANDONED_LEAD_HEADERS,
                projectionFingerprintColumns(),
            ),
        })
    } else {
        if (!params.lead) {
            throw new Error("Current lead row is missing before Sheet projection")
        }
        const isInviteRoute = route.tab === "NTC - Invites"
        const values = isInviteRoute
            ? buildInviteLeadSheetRow({
                lead: params.lead,
                submission: params.submission,
                latestSubmissionId: params.submissionId,
                notes: params.notes,
            })
            : buildLeadSheetRow({
                lead: params.lead,
                latestSubmissionId: params.submissionId,
                latestSubmission: params.submission,
                notes: params.notes,
            })
        await runProjectionAttempt({
            projection: params,
            sheetId: route.sheetId,
            tab: route.tab,
            projectionType: "current",
            projectionKey: normalizeEmail(params.lead.email),
            values,
            action: () => upsertCurrentRow(
                route.sheetId,
                route.tab,
                "Email",
                normalizeEmail(params.lead.email),
                values,
                isInviteRoute ? NTC_INVITE_HEADERS : LEAD_HEADERS,
            ),
        })
    }

    let masterLogged = false
    const masterSheetId = compact(Deno.env.get("GOOGLE_SHEET_ID_MASTER"))
    if (params.lead && params.source !== "booking_abandoned") {
        if (!masterSheetId) {
            throw new Error("Sheet route configuration missing: GOOGLE_SHEET_ID_MASTER")
        }
        const masterValues = buildMasterLeadSheetRow({
                lead: params.lead,
                status: params.status,
                latestSubmissionId: params.submissionId,
                latestSubmission: params.submission,
            })
        await runProjectionAttempt({
            projection: params,
            sheetId: masterSheetId,
            tab: "Master Leads",
            projectionType: "master",
            projectionKey: normalizeEmail(params.lead.email),
            values: masterValues,
            action: () => upsertCurrentRow(
                masterSheetId,
                "Master Leads",
                "Email",
                normalizeEmail(params.lead.email),
                masterValues,
                MASTER_LEAD_HEADERS,
            ),
        })
        masterLogged = true
    }

    return { sheetLogged: true, masterLogged, sheetStatus: "synced" }
}

export function projectionConfigurationError(
    message: unknown,
): "failed" | "configuration_missing" {
    const text = compact(message)
    return /configuration missing|not enabled|route configuration/i.test(text)
        ? "configuration_missing"
        : "failed"
}
