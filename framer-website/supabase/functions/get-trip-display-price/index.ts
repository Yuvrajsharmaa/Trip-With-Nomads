import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    getDateValue,
    getTransportValue,
    getVariantValue,
} from "../_shared/pricing.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
}

function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function toDateMs(value: unknown): number | null {
    if (!value) return null
    const ms = Date.parse(String(value))
    return Number.isFinite(ms) ? ms : null
}

function computeNextBatchDate(rows: any[], todayMs: number): string | null {
    if (!Array.isArray(rows) || rows.length === 0) return null

    let bestDate: string | null = null
    let bestMs: number | null = null
    for (const row of rows) {
        const dateValue = String(getDateValue(row) || "").trim()
        if (!dateValue) continue
        const ms = toDateMs(dateValue)
        if (ms == null || ms < todayMs) continue
        if (bestMs == null || ms < bestMs) {
            bestMs = ms
            bestDate = dateValue
        }
    }

    return bestDate
}

function computeEarlyBirdDiscount(row: any, price: number, nowMs: number): number {
    if (!row?.early_bird_enabled || price <= 0) return 0

    const startsAt = toDateMs(row?.early_bird_starts_at)
    const endsAt = toDateMs(row?.early_bird_ends_at)
    if (startsAt != null && nowMs < startsAt) return 0
    if (endsAt != null && nowMs > endsAt) return 0

    const discountType = String(row?.early_bird_discount_type || "").toLowerCase()
    const discountValue = toNumber(row?.early_bird_discount_value)
    if (discountValue <= 0) return 0

    let discount = discountType === "percent" ? price * (discountValue / 100) : discountValue
    const maxDiscount = row?.early_bird_max_discount != null ? toNumber(row?.early_bird_max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) discount = Math.min(discount, maxDiscount)

    return round2(Math.max(0, Math.min(discount, price)))
}

function groupKey(row: any): string {
    const date = String(getDateValue(row) || "")
    const sharing = String(getVariantValue(row) || "")
    const vehicle = String(getTransportValue(row) || "")
    return `${date}__${sharing}__${vehicle}`
}

function pickBestForGroup(rows: any[]): any {
    return rows.reduce((best, row) => {
        if (!best) return row
        const bestPrice = toNumber(best?.price)
        const nextPrice = toNumber(row?.price)
        if (nextPrice < bestPrice) return row
        if (nextPrice > bestPrice) return best

        const bestCreated = Date.parse(String(best?.created_at || ""))
        const nextCreated = Date.parse(String(row?.created_at || ""))
        if (Number.isFinite(nextCreated) && Number.isFinite(bestCreated) && nextCreated > bestCreated) {
            return row
        }
        return best
    }, rows[0])
}

function isFutureOrUndated(row: any, todayMs: number): boolean {
    const dateValue = getDateValue(row)
    if (!dateValue) return true
    const dateMs = toDateMs(dateValue)
    return dateMs == null ? true : dateMs >= todayMs
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    if (req.method !== "GET") {
        return json({ error: "Method not allowed" }, 405)
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        if (!supabaseUrl || !serviceRole) {
            return json({ error: "Missing Supabase environment" }, 500)
        }

        const url = new URL(req.url)
        const slug = String(url.searchParams.get("slug") || "").trim()
        let tripId = String(url.searchParams.get("trip_id") || "").trim()

        if (!slug && !tripId) {
            return json({ error: "slug or trip_id is required" }, 400)
        }

        const supabase = createClient(supabaseUrl, serviceRole)

        let tripRow: Record<string, unknown> | null = null
        if (!tripId && slug) {
            const { data: trips, error } = await supabase
                .from("trips")
                .select("id,slug")
                .eq("slug", slug)
                .limit(1)
            if (error) return json({ error: "Trip lookup failed" }, 500)
            tripRow = (trips?.[0] as Record<string, unknown>) || null
            tripId = String(tripRow?.id || "")
        } else if (tripId) {
            const { data: trips, error } = await supabase
                .from("trips")
                .select("id,slug")
                .eq("id", tripId)
                .limit(1)
            if (error) return json({ error: "Trip lookup failed" }, 500)
            tripRow = (trips?.[0] as Record<string, unknown>) || null
        }

        if (!tripId) return json({ error: "Trip not found" }, 404)

        const { data: pricingRows, error: pricingError } = await supabase
            .from("trip_pricing")
            .select("*")
            .eq("trip_id", tripId)

        if (pricingError) return json({ error: "Could not load pricing" }, 500)

        const rows = Array.isArray(pricingRows) ? pricingRows : []
        const nowMs = Date.now()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayMs = today.getTime()

        const activeRows = rows
            .filter((row) => toNumber(row?.price) > 0)
            .filter((row) => isFutureOrUndated(row, todayMs))

        if (activeRows.length === 0) {
            const fallbackRow = pickBestForGroup(
                rows.filter((row) => toNumber(row?.price) > 0)
            )
            const tripLevelPrice = round2(toNumber(fallbackRow?.price))
            return json({
                trip_id: tripId,
                slug: slug || String(tripRow?.slug || ""),
                next_batch_date: null,
                display_summary: {
                    base_price: tripLevelPrice,
                    payable_price: tripLevelPrice,
                    save_amount: 0,
                    has_discount: false,
                },
                context: {
                    departure_date: null,
                    sharing: null,
                    transport: null,
                },
                engine_version: "v3",
            })
        }

        // Deduplicate duplicates per date + sharing + vehicle.
        const grouped = new Map<string, any[]>()
        for (const row of activeRows) {
            const key = groupKey(row)
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)!.push(row)
        }
        const deduped = Array.from(grouped.values()).map((bucket) => pickBestForGroup(bucket))

        let bestRow = deduped[0]
        let bestBase = toNumber(bestRow?.price)
        let bestPayable = round2(Math.max(0, bestBase - computeEarlyBirdDiscount(bestRow, bestBase, nowMs)))
        let bestSave = round2(Math.max(0, bestBase - bestPayable))
        const nextBatchDate = computeNextBatchDate(activeRows, todayMs)

        for (const row of deduped.slice(1)) {
            const base = toNumber(row?.price)
            const save = computeEarlyBirdDiscount(row, base, nowMs)
            const payable = round2(Math.max(0, base - save))
            if (payable < bestPayable) {
                bestRow = row
                bestBase = round2(base)
                bestPayable = payable
                bestSave = round2(save)
            }
        }

        return json(
            {
                trip_id: tripId,
                slug: slug || String(tripRow?.slug || ""),
                next_batch_date: nextBatchDate,
                display_summary: {
                    base_price: round2(bestBase),
                    payable_price: round2(bestPayable),
                    save_amount: round2(bestSave),
                    has_discount: bestSave > 0,
                },
                context: {
                    departure_date: getDateValue(bestRow) || null,
                    sharing: getVariantValue(bestRow) || null,
                    transport: getTransportValue(bestRow) || null,
                },
                engine_version: "v3",
            },
            200
        )
    } catch (err: any) {
        console.error("[get-trip-display-price] fatal", err)
        return json({ error: err?.message || "Internal server error" }, 500)
    }
})
