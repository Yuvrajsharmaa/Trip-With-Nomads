import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { projectionConfigurationError, projectLeadSheets } from "../_shared/lead_projection.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-lead-sheet-retry-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(payload: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function compact(value: unknown): string {
    return String(value ?? "").trim()
}

const MAX_EXPLICIT_REPLAY_IDS = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseExplicitSubmissionIds(body: any): string[] | null {
    if (!body || typeof body !== "object" || !("submission_ids" in body)) return null

    const supplied = body.submission_ids
    if (
        !Array.isArray(supplied) || supplied.length === 0 ||
        supplied.length > MAX_EXPLICIT_REPLAY_IDS
    ) {
        throw new Error("Invalid submission_ids: provide 1 to 100 submission UUIDs")
    }

    const ids = [...new Set(supplied.map((value) => compact(value).toLowerCase()))]
    if (ids.some((id) => !UUID_PATTERN.test(id))) {
        throw new Error("Invalid submission_ids: every value must be a UUID")
    }
    return ids
}

function isAuthorized(req: Request): boolean {
    const authorization = compact(req.headers.get("authorization"))
    const suppliedSecret = compact(req.headers.get("x-lead-sheet-retry-secret"))
    const serviceRoleKey = compact(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    const retrySecret = compact(Deno.env.get("LEAD_SHEET_RETRY_SECRET"))
    return Boolean(
        (serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) ||
            (retrySecret &&
                (authorization === `Bearer ${retrySecret}` || suppliedSecret === retrySecret)),
    )
}

function limitFromBody(body: any): number {
    const requested = Number(body?.limit)
    if (!Number.isFinite(requested)) return 25
    return Math.min(100, Math.max(1, Math.floor(requested)))
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
    if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401)

    const supabaseUrl = compact(Deno.env.get("SUPABASE_URL"))
    const serviceRoleKey = compact(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: "Supabase environment not configured" }, 500)
    }

    try {
        let body: any
        try {
            body = await req.json()
        } catch (_) {
            return json({ error: "Invalid JSON body" }, 400)
        }

        let explicitSubmissionIds: string[] | null
        try {
            explicitSubmissionIds = parseExplicitSubmissionIds(body)
        } catch (error: any) {
            return json({ error: compact(error?.message || error) }, 400)
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)
        const submissionQuery = supabase
            .from("lead_submissions")
            .select("*")
            .order("created_at", { ascending: true })
        const pending = explicitSubmissionIds === null
            ? await submissionQuery
                .in("sheet_sync_status", ["pending", "failed", "configuration_missing"])
                .limit(limitFromBody(body))
            : await submissionQuery.in("submission_id", explicitSubmissionIds)
        if (pending.error) throw pending.error

        const foundSubmissionIds = new Set(
            (pending.data || []).map((row: any) => compact(row?.submission_id)),
        )
        const missingSubmissionIds = explicitSubmissionIds?.filter((id) =>
            !foundSubmissionIds.has(id)
        ) || []
        if (missingSubmissionIds.length) {
            return json({
                error: "One or more requested lead submissions were not found",
                missing_submission_ids: missingSubmissionIds,
            }, 404)
        }

        const results: Array<Record<string, unknown>> = []
        let synced = 0
        let failed = 0
        let configurationMissing = 0

        for (const submission of pending.data || []) {
            const submissionId = compact(submission?.submission_id)
            try {
                let lead: any | null = null
                const leadId = compact(submission?.lead_id)
                if (leadId) {
                    const leadResult = await supabase.from("leads").select("*").eq("id", leadId)
                        .maybeSingle()
                    if (leadResult.error) throw leadResult.error
                    lead = leadResult.data
                }
                const payload = submission?.payload && typeof submission.payload === "object"
                    ? submission.payload
                    : {}
                if (!lead && compact(payload?.email)) {
                    const normalizedEmail = compact(
                        submission?.normalized_email || payload.email,
                    ).toLowerCase()
                    const leadResult = await supabase
                        .from("leads")
                        .select("*")
                        .eq("normalized_email", normalizedEmail)
                    if (leadResult.error) throw leadResult.error
                    if ((leadResult.data || []).length > 1) {
                        throw new Error(
                            `Multiple lead rows match normalized email ${normalizedEmail}; repair required`,
                        )
                    }
                    lead = leadResult.data?.[0] || null
                }
                const projection = await projectLeadSheets({
                    lead,
                    submission: {
                        ...payload,
                        submission_id: submissionId,
                        captured_at: payload.captured_at || submission.created_at,
                        source: compact(submission.source || payload.source),
                        status: compact(submission.status || payload.status),
                    },
                    submissionId,
                    source: compact(submission.source || payload.source),
                    status: compact(submission.status || payload.status),
                    notes: "",
                    supabase,
                })
                const updated = await supabase.from("lead_submissions").update({
                    sheet_sync_status: projection.sheetStatus,
                    sheet_synced_at: projection.sheetStatus === "synced"
                        ? new Date().toISOString()
                        : null,
                    error_message: projection.errorMessage || null,
                    updated_at: new Date().toISOString(),
                }).eq("submission_id", submissionId)
                if (updated.error) throw updated.error
                if (projection.sheetStatus === "synced") {
                    synced++
                    results.push({
                        submission_id: submissionId,
                        status: "synced",
                        sheet_logged: projection.sheetLogged,
                        master_logged: projection.masterLogged,
                    })
                } else {
                    if (projection.sheetStatus === "configuration_missing") {
                        configurationMissing++
                    } else {
                        failed++
                    }
                    results.push({
                        submission_id: submissionId,
                        status: projection.sheetStatus,
                        sheet_logged: projection.sheetLogged,
                        master_logged: projection.masterLogged,
                        error: projection.errorMessage || "Sheet projection failed",
                    })
                }
            } catch (error: any) {
                const status = projectionConfigurationError(error?.message || error)
                if (status === "configuration_missing") configurationMissing++
                else failed++
                const message = compact(error?.message || error).slice(0, 500)
                const updated = await supabase.from("lead_submissions").update({
                    sheet_sync_status: status,
                    error_message: message,
                    updated_at: new Date().toISOString(),
                }).eq("submission_id", submissionId)
                if (updated.error) {
                    console.error("[retry-lead-sheets] status update failed", updated.error)
                }
                results.push({ submission_id: submissionId, status, error: message })
            }
        }

        return json({
            ok: true,
            processed: results.length,
            synced,
            failed,
            configuration_missing: configurationMissing,
            results,
        })
    } catch (error: any) {
        console.error("[retry-lead-sheets] error", error)
        return json({ error: compact(error?.message || error) || "Retry failed" }, 500)
    }
})
