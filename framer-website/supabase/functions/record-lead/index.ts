import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    appendHistoryRowOnce,
    sheetsEnabled,
    upsertCurrentRow,
} from "../_shared/sheets.ts"
import {
    ABANDONED_LEAD_HEADERS,
    buildAbandonedLeadSheetRow,
    buildInviteLeadSheetRow,
    buildLeadSheetRow,
    LEAD_HEADERS,
    NTC_INVITE_HEADERS,
} from "../_shared/lead_sheets.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(payload: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function compact(value: any): string {
    return String(value ?? "").trim()
}

function normalizeEmail(value: unknown): string {
    return compact(value).toLowerCase()
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(compact(value))
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeSource(value: unknown): string {
    return compact(value) || "unknown"
}

function isTerminalStatus(value: unknown): boolean {
    return new Set([
        "converted",
        "booked",
        "paid",
        "customer",
        "closed_won",
        "won",
        "lost",
        "closed_lost",
    ]).has(compact(value).toLowerCase())
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = compact(value)
        if (next) return next
    }
    return ""
}

function stableObject(value: any): any {
    if (Array.isArray(value)) return value.map(stableObject)
    if (!value || typeof value !== "object") return value
    return Object.keys(value).sort().reduce((result: Record<string, any>, key) => {
        result[key] = stableObject(value[key])
        return result
    }, {})
}

async function payloadHash(value: any): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(stableObject(value)))
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function routeForLead(source: string, status: string): { sheetId: string; tab: string; note: string } {
    const ntcSheetId = compact(Deno.env.get("GOOGLE_SHEET_ID_NTC"))
    const tripsSheetId = compact(Deno.env.get("GOOGLE_SHEET_ID_TRIPS"))
    const generalSheetId = compact(Deno.env.get("GOOGLE_SHEET_ID_GENERAL") || Deno.env.get("GOOGLE_SHEET_ID"))
    const isPartial = status === "partial_fill"
    const knownSource = new Set(["waitlist_popup", "booking_invite", "trip_page_lead", "general_lead"])
    const sourceNote = knownSource.has(source) ? "" : `unknown_source:${source}`

    if (source === "booking_invite") {
        return {
            sheetId: ntcSheetId,
            tab: isPartial ? "Abandoned Leads" : "NTC - Invites",
            note: sourceNote,
        }
    }
    if (source === "trip_page_lead") {
        return {
            sheetId: tripsSheetId,
            tab: isPartial ? "Abandoned Leads" : "Leads",
            note: sourceNote,
        }
    }
    return {
        sheetId: generalSheetId,
        tab: isPartial ? "Abandoned Leads" : "Leads",
        note: sourceNote,
    }
}

async function findExistingLead(supabase: any, normalizedEmail: string): Promise<any | null> {
    if (!normalizedEmail) return null
    const pageSize = 1000
    let offset = 0
    let match: any | null = null

    while (true) {
        const result = await supabase
            .from("leads")
            .select("*")
            .not("email", "is", null)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1)
        if (result.error) throw result.error

        const page = Array.isArray(result.data) ? result.data : []
        for (const lead of page) {
            if (normalizeEmail(lead?.email) !== normalizedEmail) continue
            if (match) {
                throw new Error(`Multiple lead rows match normalized email ${normalizedEmail}; repair required`)
            }
            match = lead
        }

        if (page.length < pageSize) break
        offset += pageSize
    }

    return match
}

async function resolveLeadIdentity(params: {
    supabase: any
    normalizedEmail: string
    suppliedLeadId: string
}): Promise<{ leadId: string; existingLead: any | null }> {
    const { supabase, normalizedEmail, suppliedLeadId } = params
    if (suppliedLeadId && !isUuid(suppliedLeadId)) throw new Error("lead_id must be a UUID")

    if (suppliedLeadId) {
        const supplied = await supabase.from("leads").select("*").eq("id", suppliedLeadId).maybeSingle()
        if (supplied.error) throw supplied.error
        if (supplied.data && normalizedEmail && normalizeEmail(supplied.data.email) !== normalizedEmail) {
            throw new Error("lead_id does not belong to the supplied normalized email")
        }
    }

    const existingLead = await findExistingLead(supabase, normalizedEmail)
    if (existingLead && suppliedLeadId && String(existingLead.id) !== suppliedLeadId) {
        throw new Error("lead_id conflicts with the existing normalized email identity")
    }

    if (!normalizedEmail) return { leadId: suppliedLeadId, existingLead: null }

    const identity = await supabase
        .from("lead_identities")
        .select("*")
        .eq("normalized_email", normalizedEmail)
        .maybeSingle()
    if (identity.error) throw identity.error
    if (identity.data) {
        const identityLeadId = compact(identity.data.lead_id)
        if (suppliedLeadId && identityLeadId !== suppliedLeadId) {
            throw new Error("lead_id conflicts with the existing normalized email identity")
        }
        if (existingLead && String(existingLead.id) !== identityLeadId) {
            throw new Error(`Duplicate lead identity rows require repair for ${normalizedEmail}`)
        }
        return { leadId: identityLeadId, existingLead }
    }

    const requestedLeadId = suppliedLeadId || String(existingLead?.id || "")
    const leadId = requestedLeadId || crypto.randomUUID()
    const inserted = await supabase
        .from("lead_identities")
        .insert({ normalized_email: normalizedEmail, lead_id: leadId })
        .select("*")
        .maybeSingle()
    if (inserted.error && String(inserted.error.code || "") !== "23505") throw inserted.error
    if (inserted.data) {
        const insertedLeadId = compact(inserted.data.lead_id)
        if (suppliedLeadId && insertedLeadId !== suppliedLeadId) {
            throw new Error("lead_id conflicts with the existing normalized email identity")
        }
        if (existingLead && String(existingLead.id) !== insertedLeadId) {
            throw new Error(`Duplicate lead identity rows require repair for ${normalizedEmail}`)
        }
        return { leadId: insertedLeadId, existingLead }
    }
    if (inserted.error) {
        const concurrent = await supabase
            .from("lead_identities")
            .select("*")
            .eq("normalized_email", normalizedEmail)
            .single()
        if (concurrent.error) throw concurrent.error
        const concurrentLeadId = compact(concurrent.data?.lead_id)
        if (suppliedLeadId && concurrentLeadId !== suppliedLeadId) {
            throw new Error("lead_id conflicts with the existing normalized email identity")
        }
        if (existingLead && String(existingLead.id) !== concurrentLeadId) {
            throw new Error(`Duplicate lead identity rows require repair for ${normalizedEmail}`)
        }
        return { leadId: concurrentLeadId, existingLead }
    }
    return { leadId, existingLead }
}

async function updateCurrentLead(params: {
    supabase: any
    leadId: string
    existingLead: any | null
    body: any
    normalizedEmail: string
    source: string
    status: string
    submissionId: string
    now: string
}) {
    const { supabase, leadId, existingLead, body, normalizedEmail, source, status, submissionId, now } = params
    if (!leadId) return null
    const existingStatus = firstNonEmpty(existingLead?.current_status, existingLead?.status, "submitted")
    const currentStatus = isTerminalStatus(existingStatus) ? existingStatus : status
    const submissionCountLookup = await supabase
        .from("lead_submissions")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
    if (submissionCountLookup.error) throw submissionCountLookup.error
    const submissionCount = Number.isFinite(Number(submissionCountLookup.count))
        ? Number(submissionCountLookup.count)
        : Math.max(0, Number(existingLead?.submission_count || 0)) + 1
    const current = {
        id: leadId,
        email: normalizedEmail || compact(existingLead?.email) || null,
        name: firstNonEmpty(body?.name, existingLead?.name) || null,
        phone: firstNonEmpty(body?.phone, existingLead?.phone) || null,
        instagram_id: firstNonEmpty(body?.instagram_id, existingLead?.instagram_id) || null,
        source,
        latest_source: source,
        page_url: firstNonEmpty(body?.page_url, existingLead?.page_url) || null,
        latest_page_url: firstNonEmpty(body?.page_url, existingLead?.latest_page_url, existingLead?.page_url) || null,
        trip_id: firstNonEmpty(body?.trip_id, existingLead?.trip_id) || null,
        latest_trip_id: firstNonEmpty(body?.trip_id, existingLead?.latest_trip_id, existingLead?.trip_id) || null,
        trip_slug: firstNonEmpty(body?.trip_slug, existingLead?.trip_slug) || null,
        latest_trip_slug: firstNonEmpty(body?.trip_slug, existingLead?.latest_trip_slug, existingLead?.trip_slug) || null,
        utm_source: firstNonEmpty(body?.utm_source, existingLead?.utm_source) || null,
        latest_utm_source: firstNonEmpty(body?.utm_source, existingLead?.latest_utm_source, existingLead?.utm_source) || null,
        utm_medium: firstNonEmpty(body?.utm_medium, existingLead?.utm_medium) || null,
        latest_utm_medium: firstNonEmpty(body?.utm_medium, existingLead?.latest_utm_medium, existingLead?.utm_medium) || null,
        utm_campaign: firstNonEmpty(body?.utm_campaign, existingLead?.utm_campaign) || null,
        latest_utm_campaign: firstNonEmpty(body?.utm_campaign, existingLead?.latest_utm_campaign, existingLead?.utm_campaign) || null,
        utm_term: firstNonEmpty(body?.utm_term, existingLead?.utm_term) || null,
        latest_utm_term: firstNonEmpty(body?.utm_term, existingLead?.latest_utm_term, existingLead?.utm_term) || null,
        utm_content: firstNonEmpty(body?.utm_content, existingLead?.utm_content) || null,
        latest_utm_content: firstNonEmpty(body?.utm_content, existingLead?.latest_utm_content, existingLead?.utm_content) || null,
        first_seen_at: firstNonEmpty(existingLead?.first_seen_at, existingLead?.created_at, now),
        last_seen_at: now,
        submission_count: submissionCount,
        current_status: currentStatus,
        status: currentStatus,
        latest_submission_id: submissionId,
        updated_at: now,
    }
    const result = await supabase.from("leads").upsert(current, { onConflict: "id" }).select("*").single()
    if (result.error) throw result.error
    const reconciledCount = await supabase.rpc("reconcile_lead_submission_count", {
        target_lead_id: leadId,
    })
    if (reconciledCount.error) throw reconciledCount.error
    if (Number.isFinite(Number(reconciledCount.data))) {
        result.data.submission_count = Number(reconciledCount.data)
    }
    return result.data
}

async function projectLead(params: {
    lead: any | null
    submission: any
    submissionId: string
    source: string
    status: string
    notes: string
}) {
    if (!sheetsEnabled()) return { sheetLogged: false, sheetStatus: "not_required" }
    const route = routeForLead(params.source, params.status)
    if (!route.sheetId) return { sheetLogged: false, sheetStatus: "not_required" }

    if (params.status === "partial_fill") {
        const values = buildAbandonedLeadSheetRow({
            submission: {
                ...params.submission,
                submission_id: params.submissionId,
                lead_id: params.lead?.id || "",
                reason: params.submission.reason || "partial_fill",
            },
        })
        await appendHistoryRowOnce(
            route.sheetId,
            route.tab,
            "Submission ID",
            params.submissionId,
            values,
            ABANDONED_LEAD_HEADERS,
        )
    } else {
        if (!params.lead) throw new Error("Current lead row is missing before Sheet projection")
        const routeNotes = [route.note, params.notes].filter(Boolean).join(" | ")
        const isInviteRoute = route.tab === "NTC - Invites"
        const values = isInviteRoute
            ? buildInviteLeadSheetRow({ lead: params.lead, submission: params.submission, notes: routeNotes })
            : buildLeadSheetRow({
                lead: params.lead,
                latestSubmissionId: params.submissionId,
                notes: routeNotes,
            })
        await upsertCurrentRow(
            route.sheetId,
            route.tab,
            "Email",
            normalizeEmail(params.lead.email),
            values,
            isInviteRoute ? NTC_INVITE_HEADERS : LEAD_HEADERS,
        )
    }
    return { sheetLogged: true, sheetStatus: "synced" }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    try {
        const body = await req.json().catch(() => ({}))
        const submissionId = compact(body?.submission_id)
        if (!isUuid(submissionId)) return json({ error: "submission_id must be a UUID" }, 400)

        const status = compact(body?.status || "submitted").toLowerCase()
        const partialFill = status === "partial_fill"
        const normalizedEmail = normalizeEmail(body?.email)
        if (!normalizedEmail && !partialFill) return json({ error: "Email is required" }, 400)
        if (normalizedEmail && !isValidEmail(normalizedEmail)) return json({ error: "Email is invalid" }, 400)

        const source = normalizeSource(body?.source)
        const now = new Date().toISOString()
        const submissionPayload = {
            submission_id: submissionId,
            lead_id: compact(body?.lead_id) || null,
            normalized_email: normalizedEmail || null,
            source,
            status,
            name: compact(body?.name),
            email: normalizedEmail,
            phone: compact(body?.phone),
            instagram_id: compact(body?.instagram_id),
            page_url: compact(body?.page_url),
            trip_id: compact(body?.trip_id),
            trip_slug: compact(body?.trip_slug),
            utm_source: compact(body?.utm_source),
            utm_medium: compact(body?.utm_medium),
            utm_campaign: compact(body?.utm_campaign),
            utm_term: compact(body?.utm_term),
            utm_content: compact(body?.utm_content),
            reason: compact(body?.reason || (partialFill ? "partial_fill" : "")),
        }
        const hash = await payloadHash(submissionPayload)

        const supabaseUrl = compact(Deno.env.get("SUPABASE_URL"))
        const serviceRoleKey = compact(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
        if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase environment not configured" }, 500)
        const supabase = createClient(supabaseUrl, serviceRoleKey)

        const existingSubmission = await supabase
            .from("lead_submissions")
            .select("*")
            .eq("submission_id", submissionId)
            .maybeSingle()
        if (existingSubmission.error) throw existingSubmission.error
        if (existingSubmission.data && existingSubmission.data.payload_hash !== hash) {
            return json({ error: "submission_id was already used with different lead data", code: "IDEMPOTENCY_CONFLICT" }, 409)
        }

        let lead: any | null = null
        let leadId = compact(existingSubmission.data?.lead_id || body?.lead_id)
        if (leadId && !isUuid(leadId)) return json({ error: "lead_id must be a UUID" }, 400)
        if (!partialFill || normalizedEmail) {
            const identity = await resolveLeadIdentity({
                supabase,
                normalizedEmail,
                suppliedLeadId: leadId,
            })
            leadId = identity.leadId
        }

        if (!existingSubmission.data) {
            const inserted = await supabase
                .from("lead_submissions")
                .insert({
                    submission_id: submissionId,
                    lead_id: leadId || null,
                    normalized_email: normalizedEmail || null,
                    source,
                    status,
                    payload_hash: hash,
                    payload: submissionPayload,
                    sheet_sync_status: "pending",
                })
                .select("*")
                .single()
            if (inserted.error && String(inserted.error.code || "") === "23505") {
                return json({ error: "Submission is being processed; retry with the same submission_id" }, 409)
            }
            if (inserted.error) throw inserted.error
        }

        if (!partialFill || normalizedEmail) {
            if (existingSubmission.data) {
                const existing = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle()
                if (existing.error) throw existing.error
                lead = existing.data
                if (!lead && leadId) {
                    const storedPayload = existingSubmission.data.payload || submissionPayload
                    lead = await updateCurrentLead({
                        supabase,
                        leadId,
                        existingLead: null,
                        body: storedPayload,
                        normalizedEmail: normalizeEmail(existingSubmission.data.normalized_email || storedPayload.email),
                        source: compact(existingSubmission.data.source || storedPayload.source) || source,
                        status: compact(existingSubmission.data.status || storedPayload.status) || status,
                        submissionId,
                        now,
                    })
                }
            } else {
                const identity = await resolveLeadIdentity({
                    supabase,
                    normalizedEmail,
                    suppliedLeadId: leadId,
                })
                lead = await updateCurrentLead({
                    supabase,
                    leadId,
                    existingLead: identity.existingLead,
                    body,
                    normalizedEmail,
                    source,
                    status,
                    submissionId,
                    now,
                })
            }
        }

        const routeNotes = ""
        try {
            const projection = await projectLead({
                lead,
                submission: submissionPayload,
                submissionId,
                source,
                status,
                notes: routeNotes,
            })
            await supabase.from("lead_submissions").update({
                sheet_sync_status: projection.sheetStatus,
                sheet_synced_at: projection.sheetStatus === "synced" ? new Date().toISOString() : null,
                error_message: null,
                updated_at: new Date().toISOString(),
            }).eq("submission_id", submissionId)
            return json({
                ok: true,
                lead_id: leadId || null,
                submission_id: submissionId,
                sheet_logged: projection.sheetLogged,
                replayed: Boolean(existingSubmission.data),
            })
        } catch (sheetError: any) {
            await supabase.from("lead_submissions").update({
                sheet_sync_status: "failed",
                error_message: compact(sheetError?.message || sheetError).slice(0, 500),
                updated_at: new Date().toISOString(),
            }).eq("submission_id", submissionId)
            return json({
                ok: false,
                error: "Lead saved; Sheet projection failed and can be retried",
                code: "SHEET_SYNC_FAILED",
                lead_id: leadId || null,
                submission_id: submissionId,
            }, 503)
        }
    } catch (err: any) {
        console.error("[record-lead] error", err)
        const message = compact(err?.message || err)
        const conflict = /conflict|duplicate|different normalized email|repair required/i.test(message)
        return json({ error: message || "Internal Server Error" }, conflict ? 409 : 500)
    }
})
