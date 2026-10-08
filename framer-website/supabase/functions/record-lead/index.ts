import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    projectLeadSheets,
    projectionConfigurationError,
} from "../_shared/lead_projection.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const LEAD_SHEET_RETRY_FUNCTION = "retry-lead-sheets"

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
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(compact(value))
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function inferTripSlug(pageUrl: unknown): string {
    const raw = compact(pageUrl)
    if (!raw) return ""
    try {
        const pathname = new URL(raw).pathname
        const segments = pathname.split("/").filter(Boolean)
        const routeIndex = segments.findIndex((segment) =>
            ["upcoming-trips", "domestic-trips", "international-trips"].includes(
                segment.toLowerCase(),
            )
        )
        return routeIndex >= 0 ? compact(segments[routeIndex + 1]) : ""
    } catch {
        return ""
    }
}

function normalizeSource(value: unknown): string {
    const source = compact(value).toLowerCase()
    if (source === "waitlist") return "waitlist_popup"
    if (source === "generic_form") return "general_lead"
    if (source === "corporate" || source === "corporate_enquiry") return "corporate_lead"
    if (source === "itinerary_download") return "trip_itinerary_download"
    return source || "unknown"
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

function uniqueTextValues(...values: unknown[]): string[] {
    const output: string[] = []
    const seen = new Set<string>()
    for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
        const text = compact(value)
        if (!text) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        output.push(text)
    }
    return output
}

function stableObject(value: any): any {
    if (Array.isArray(value)) return value.map(stableObject)
    if (!value || typeof value !== "object") return value
    return Object.keys(value).sort().reduce(
        (result: Record<string, any>, key) => {
            result[key] = stableObject(value[key])
            return result
        },
        {},
    )
}

async function payloadHash(value: any): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(stableObject(value)))
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function findExistingLead(
    supabase: any,
    normalizedEmail: string,
): Promise<any | null> {
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
                throw new Error(
                    `Multiple lead rows match normalized email ${normalizedEmail}; repair required`,
                )
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
    if (suppliedLeadId && !isUuid(suppliedLeadId)) {
        throw new Error("lead_id must be a UUID")
    }

    if (suppliedLeadId) {
        const supplied = await supabase.from("leads").select("*").eq(
            "id",
            suppliedLeadId,
        ).maybeSingle()
        if (supplied.error) throw supplied.error
        if (
            supplied.data && normalizedEmail &&
            normalizeEmail(supplied.data.email) !== normalizedEmail
        ) {
            throw new Error(
                "lead_id does not belong to the supplied normalized email",
            )
        }
    }

    const existingLead = await findExistingLead(supabase, normalizedEmail)
    if (
        existingLead && suppliedLeadId && String(existingLead.id) !== suppliedLeadId
    ) {
        throw new Error(
            "lead_id conflicts with the existing normalized email identity",
        )
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
            throw new Error(
                "lead_id conflicts with the existing normalized email identity",
            )
        }
        if (existingLead && String(existingLead.id) !== identityLeadId) {
            throw new Error(
                `Duplicate lead identity rows require repair for ${normalizedEmail}`,
            )
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
    if (inserted.error && String(inserted.error.code || "") !== "23505") {
        throw inserted.error
    }
    if (inserted.data) {
        const insertedLeadId = compact(inserted.data.lead_id)
        if (suppliedLeadId && insertedLeadId !== suppliedLeadId) {
            throw new Error(
                "lead_id conflicts with the existing normalized email identity",
            )
        }
        if (existingLead && String(existingLead.id) !== insertedLeadId) {
            throw new Error(
                `Duplicate lead identity rows require repair for ${normalizedEmail}`,
            )
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
            throw new Error(
                "lead_id conflicts with the existing normalized email identity",
            )
        }
        if (existingLead && String(existingLead.id) !== concurrentLeadId) {
            throw new Error(
                `Duplicate lead identity rows require repair for ${normalizedEmail}`,
            )
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
    const {
        supabase,
        leadId,
        existingLead,
        body,
        normalizedEmail,
        source,
        status,
        submissionId,
        now,
    } = params
    if (!leadId) return null
    const existingStatus = firstNonEmpty(
        existingLead?.current_status,
        existingLead?.status,
        "submitted",
    )
    const currentStatus = isTerminalStatus(existingStatus) ? existingStatus : status
    const submissionCountLookup = await supabase
        .from("lead_submissions")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
    if (submissionCountLookup.error) throw submissionCountLookup.error
    const submissionCount = Number.isFinite(Number(submissionCountLookup.count))
        ? Number(submissionCountLookup.count)
        : Math.max(0, Number(existingLead?.submission_count || 0)) + 1
    const itineraryName = firstNonEmpty(
        body?.itinerary_name,
        body?.trip_name,
        body?.latest_itinerary_name,
    )
    const downloadedItineraries = uniqueTextValues(
        existingLead?.downloaded_itineraries,
        itineraryName,
    )
    const activity = firstNonEmpty(
        body?.activity_label,
        body?.activity,
        source === "trip_itinerary_download" ? "Downloaded itinerary" : "",
        existingLead?.latest_activity,
    )
    const current = {
        id: leadId,
        email: normalizedEmail || compact(existingLead?.email) || null,
        name: firstNonEmpty(body?.name, existingLead?.name) || null,
        phone: firstNonEmpty(body?.phone, existingLead?.phone) || null,
        country_code: firstNonEmpty(body?.country_code, existingLead?.country_code) || null,
        instagram_id: firstNonEmpty(body?.instagram_id, existingLead?.instagram_id) || null,
        company_name: firstNonEmpty(
            body?.company_name,
            body?.company,
            body?.group_name,
            existingLead?.company_name,
        ) || null,
        latest_reason: firstNonEmpty(
            body?.reason,
            existingLead?.latest_reason,
            existingLead?.reason,
        ) || null,
        notes: firstNonEmpty(body?.notes, existingLead?.notes) || null,
        latest_activity: activity || null,
        latest_itinerary_name: itineraryName || compact(existingLead?.latest_itinerary_name) || null,
        downloaded_itineraries: downloadedItineraries,
        source,
        latest_source: source,
        page_url: firstNonEmpty(body?.page_url, existingLead?.page_url) || null,
        latest_page_url: firstNonEmpty(
            body?.page_url,
            existingLead?.latest_page_url,
            existingLead?.page_url,
        ) || null,
        trip_id: firstNonEmpty(body?.trip_id, existingLead?.trip_id) || null,
        latest_trip_id: firstNonEmpty(
            body?.trip_id,
            existingLead?.latest_trip_id,
            existingLead?.trip_id,
        ) || null,
        trip_slug: firstNonEmpty(body?.trip_slug, existingLead?.trip_slug) || null,
        latest_trip_slug: firstNonEmpty(
            body?.trip_slug,
            existingLead?.latest_trip_slug,
            existingLead?.trip_slug,
        ) || null,
        utm_source: firstNonEmpty(body?.utm_source, existingLead?.utm_source) ||
            null,
        latest_utm_source: firstNonEmpty(
            body?.utm_source,
            existingLead?.latest_utm_source,
            existingLead?.utm_source,
        ) || null,
        utm_medium: firstNonEmpty(body?.utm_medium, existingLead?.utm_medium) ||
            null,
        latest_utm_medium: firstNonEmpty(
            body?.utm_medium,
            existingLead?.latest_utm_medium,
            existingLead?.utm_medium,
        ) || null,
        utm_campaign: firstNonEmpty(body?.utm_campaign, existingLead?.utm_campaign) || null,
        latest_utm_campaign: firstNonEmpty(
            body?.utm_campaign,
            existingLead?.latest_utm_campaign,
            existingLead?.utm_campaign,
        ) || null,
        utm_term: firstNonEmpty(body?.utm_term, existingLead?.utm_term) || null,
        latest_utm_term: firstNonEmpty(
            body?.utm_term,
            existingLead?.latest_utm_term,
            existingLead?.utm_term,
        ) || null,
        utm_content: firstNonEmpty(body?.utm_content, existingLead?.utm_content) ||
            null,
        latest_utm_content: firstNonEmpty(
            body?.utm_content,
            existingLead?.latest_utm_content,
            existingLead?.utm_content,
        ) || null,
        first_seen_at: firstNonEmpty(
            existingLead?.first_seen_at,
            existingLead?.created_at,
            now,
        ),
        last_seen_at: now,
        submission_count: submissionCount,
        current_status: currentStatus,
        status: currentStatus,
        latest_submission_id: submissionId,
        updated_at: now,
    }
    const result = await supabase.from("leads").upsert(current, {
        onConflict: "id",
    }).select("*").single()
    if (result.error) throw result.error
    const reconciledCount = await supabase.rpc(
        "reconcile_lead_submission_count",
        {
            target_lead_id: leadId,
        },
    )
    if (reconciledCount.error) throw reconciledCount.error
    if (Number.isFinite(Number(reconciledCount.data))) {
        result.data.submission_count = Number(reconciledCount.data)
    }
    return result.data
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    try {
        const body = await req.json().catch(() => ({}))
        const submissionId = compact(body?.submission_id)
        if (!isUuid(submissionId)) {
            return json({ error: "submission_id must be a UUID" }, 400)
        }

        const status = compact(body?.status || "submitted").toLowerCase()
        const partialFill = status === "partial_fill"
        const normalizedEmail = normalizeEmail(body?.email)
        if (!normalizedEmail && !partialFill) {
            return json({ error: "Email is required" }, 400)
        }
        if (normalizedEmail && !isValidEmail(normalizedEmail)) {
            return json({ error: "Email is invalid" }, 400)
        }

        const source = normalizeSource(body?.source)
        const now = new Date().toISOString()
        // Trip-page forms do not always receive the CMS trip metadata as URL
        // parameters. Recover the stable slug from the submitted page URL so
        // a real user submission still carries the trip context into Supabase
        // and the human-facing Sheet projection.
        const inferredTripSlug = compact(body?.trip_slug) ||
            inferTripSlug(body?.page_url)
        const enrichedBody = { ...body, trip_slug: inferredTripSlug }
        const submissionPayload = {
            submission_id: submissionId,
            lead_id: compact(body?.lead_id) || null,
            normalized_email: normalizedEmail || null,
            source,
            status,
            name: compact(body?.name),
            email: normalizedEmail,
            phone: compact(body?.phone),
            country_code: compact(body?.country_code),
            instagram_id: compact(body?.instagram_id),
            page_url: compact(body?.page_url),
            trip_id: compact(body?.trip_id),
            trip_slug: inferredTripSlug,
            trip_name: compact(body?.trip_name),
            itinerary_name: compact(body?.itinerary_name),
            activity_type: compact(body?.activity_type),
            activity_label: compact(body?.activity_label || body?.activity),
            company_name: compact(body?.company_name || body?.company || body?.group_name),
            utm_source: compact(body?.utm_source),
            utm_medium: compact(body?.utm_medium),
            utm_campaign: compact(body?.utm_campaign),
            utm_term: compact(body?.utm_term),
            utm_content: compact(body?.utm_content),
            reason: compact(body?.reason || (partialFill ? "partial_fill" : "")),
            notes: compact(body?.notes),
            captured_at: now,
        }
        const hash = await payloadHash(submissionPayload)

        const supabaseUrl = compact(Deno.env.get("SUPABASE_URL"))
        const serviceRoleKey = compact(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
        if (!supabaseUrl || !serviceRoleKey) {
            return json({ error: "Supabase environment not configured" }, 500)
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey)

        const existingSubmission = await supabase
            .from("lead_submissions")
            .select("*")
            .eq("submission_id", submissionId)
            .maybeSingle()
        if (existingSubmission.error) throw existingSubmission.error
        if (
            existingSubmission.data && existingSubmission.data.payload_hash !== hash
        ) {
            return json({
                error: "submission_id was already used with different lead data",
                code: "IDEMPOTENCY_CONFLICT",
            }, 409)
        }

        let lead: any | null = null
        let leadId = compact(existingSubmission.data?.lead_id || body?.lead_id)
        if (leadId && !isUuid(leadId)) {
            return json({ error: "lead_id must be a UUID" }, 400)
        }
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
                    activity_type: compact(body?.activity_type) || null,
                    itinerary_name: compact(body?.itinerary_name) || null,
                    payload_hash: hash,
                    payload: submissionPayload,
                    sheet_sync_status: "pending",
                })
                .select("*")
                .single()
            if (inserted.error && String(inserted.error.code || "") === "23505") {
                return json({
                    error: "Submission is being processed; retry with the same submission_id",
                }, 409)
            }
            if (inserted.error) throw inserted.error
        }

        if (!partialFill || normalizedEmail) {
            if (existingSubmission.data) {
                const existing = await supabase.from("leads").select("*").eq(
                    "id",
                    leadId,
                ).maybeSingle()
                if (existing.error) throw existing.error
                lead = existing.data
                if (!lead && leadId) {
                    const storedPayload = existingSubmission.data.payload ||
                        submissionPayload
                    lead = await updateCurrentLead({
                        supabase,
                        leadId,
                        existingLead: null,
                        body: storedPayload,
                        normalizedEmail: normalizeEmail(
                            existingSubmission.data.normalized_email || storedPayload.email,
                        ),
                        source: compact(existingSubmission.data.source || storedPayload.source) ||
                            source,
                        status: compact(existingSubmission.data.status || storedPayload.status) ||
                            status,
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
                    body: enrichedBody,
                    normalizedEmail,
                    source,
                    status,
                    submissionId,
                    now,
                })
            }
        }

        try {
            const projection = await projectLeadSheets({
                lead,
                submission: submissionPayload,
                submissionId,
                source,
                status,
                notes: "",
                supabase,
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
            const sheetStatus = projectionConfigurationError(sheetError?.message || sheetError)
            const errorCode = sheetStatus === "configuration_missing"
                ? "SHEET_CONFIGURATION_MISSING"
                : "SHEET_SYNC_FAILED"
            await supabase.from("lead_submissions").update({
                sheet_sync_status: sheetStatus,
                error_message: compact(sheetError?.message || sheetError).slice(0, 500),
                updated_at: new Date().toISOString(),
            }).eq("submission_id", submissionId)
            return json({
                ok: false,
                error: "Lead saved; Sheet projection failed and can be retried",
                code: errorCode,
                retry_function: LEAD_SHEET_RETRY_FUNCTION,
                lead_id: leadId || null,
                submission_id: submissionId,
            }, 503)
        }
    } catch (err: any) {
        console.error("[record-lead] error", err)
        const message = compact(err?.message || err)
        const conflict = /conflict|duplicate|different normalized email|does not belong|repair required/i
            .test(message)
        return json(
            conflict
                ? {
                    error: message || "Lead identity conflict",
                    code: "LEAD_ID_CONFLICT",
                }
                : { error: message || "Internal Server Error" },
            conflict ? 409 : 500,
        )
    }
})
