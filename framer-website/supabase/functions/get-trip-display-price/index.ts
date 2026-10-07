import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts"
import {
    getDateValue,
    getTransportValue,
    normalizeSharing,
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

function normalizeText(value: unknown): string {
    return String(value || "").trim()
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function getTodayDateKey(now = new Date()): string {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
        .toISOString()
        .slice(0, 10)
}

let dbPool: Pool | null = null

function getDbPool(): Pool | null {
    const dbUrl = normalizeText(Deno.env.get("SUPABASE_DB_URL"))
    if (!dbUrl) return null
    if (!dbPool) {
        dbPool = new Pool(dbUrl, 3, true)
    }
    return dbPool
}

async function fetchTripViaDirectDb(params: { tripId: string; slug: string }) {
    const pool = getDbPool()
    if (!pool) return { data: null, error: new Error("Missing SUPABASE_DB_URL") }

    const client = await pool.connect()
    try {
        const result = params.tripId
            ? await client.queryObject<{ id: string; slug: string }>`
                  select id, slug
                  from public.trips
                  where id = ${params.tripId}
                  limit 1
              `
            : await client.queryObject<{ id: string; slug: string }>`
                  select id, slug
                  from public.trips
                  where slug = ${params.slug}
                  limit 1
              `

        return { data: result.rows[0] || null, error: null }
    } catch (error) {
        return { data: null, error }
    } finally {
        client.release()
    }
}

async function fetchPricingViaDirectDb(tripId: string) {
    const pool = getDbPool()
    if (!pool) return { data: null, error: new Error("Missing SUPABASE_DB_URL") }

    const client = await pool.connect()
    try {
        const result = await client.queryObject<any>`
            select *
            from public.trip_pricing
            where trip_id = ${tripId}
        `
        return { data: result.rows, error: null }
    } catch (error) {
        return { data: null, error }
    } finally {
        client.release()
    }
}

function computeEarlyBirdDiscountForRow(row: any, unitPrice: number, nowMs: number): number {
    const enabled = Boolean(row?.early_bird_enabled)
    if (!enabled || unitPrice <= 0) return 0

    const startsAtRaw = normalizeText(row?.early_bird_starts_at)
    const endsAtRaw = normalizeText(row?.early_bird_ends_at)
    const startsAt = startsAtRaw ? Date.parse(startsAtRaw) : null
    const endsAt = endsAtRaw ? Date.parse(endsAtRaw) : null

    if (startsAt != null && Number.isFinite(startsAt) && nowMs < startsAt) return 0
    if (endsAt != null && Number.isFinite(endsAt) && nowMs > endsAt) return 0

    const discountType = normalizeText(row?.early_bird_discount_type).toLowerCase()
    const discountValue = toNumber(row?.early_bird_discount_value)
    if (discountValue <= 0) return 0

    let discount = 0
    if (discountType === "percent") {
        discount = unitPrice * (discountValue / 100)
    } else {
        discount = discountValue
    }

    const maxDiscount =
        row?.early_bird_max_discount != null ? toNumber(row?.early_bird_max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) {
        discount = Math.min(discount, maxDiscount)
    }

    return round2(Math.max(0, Math.min(discount, unitPrice)))
}

function buildDisplaySummary(row: any, nowMs: number) {
    const basePrice = round2(Math.max(0, toNumber(row?.price)))
    const saveAmount = computeEarlyBirdDiscountForRow(row, basePrice, nowMs)
    const payablePrice = round2(Math.max(0, basePrice - saveAmount))

    return {
        base_price: basePrice,
        payable_price: payablePrice,
        save_amount: saveAmount,
        has_discount: saveAmount > 0,
    }
}

function pickCheapestDisplayRow(rows: any[], nowMs: number): any | null {
    let best: { row: any; payablePrice: number; basePrice: number } | null = null

    for (const row of rows) {
        const basePrice = round2(Math.max(0, toNumber(row?.price)))
        if (basePrice <= 0) continue

        const saveAmount = computeEarlyBirdDiscountForRow(row, basePrice, nowMs)
        const payablePrice = round2(Math.max(0, basePrice - saveAmount))

        if (!best) {
            best = { row, payablePrice, basePrice }
            continue
        }

        if (payablePrice < best.payablePrice) {
            best = { row, payablePrice, basePrice }
            continue
        }

        if (payablePrice === best.payablePrice && basePrice < best.basePrice) {
            best = { row, payablePrice, basePrice }
        }
    }

    return best?.row || null
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        if (req.method !== "GET") {
            return json({ error: "Method not allowed" }, 405)
        }

        const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"))
        const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
        if (!supabaseUrl || !serviceRoleKey) {
            return json({ error: "Missing Supabase environment" }, 500)
        }

        const url = new URL(req.url)
        const tripId = normalizeText(url.searchParams.get("trip_id"))
        const slug = normalizeText(url.searchParams.get("slug"))

        if (!tripId && !slug) {
            return json({ error: "trip_id or slug is required" }, 400)
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)

        const tripQuery = supabase
            .from("trips")
            .select("id, slug")
            .limit(1)

        const tripResult = tripId
            ? await tripQuery.eq("id", tripId)
            : await tripQuery.eq("slug", slug)

        let trip = Array.isArray(tripResult.data) ? tripResult.data[0] : null
        if (tripResult.error) {
            console.warn("[get-trip-display-price] trip lookup API error, trying direct DB", tripResult.error)
            const fallbackTrip = await fetchTripViaDirectDb({ tripId, slug })
            if (fallbackTrip.error) {
                console.error("[get-trip-display-price] trip lookup direct DB error", fallbackTrip.error)
                return json({ error: "Trip lookup failed" }, 500)
            }
            trip = fallbackTrip.data
        }

        if (!trip?.id) {
            return json({ error: "Trip not found" }, 404)
        }

        const pricingResult = await supabase
            .from("trip_pricing")
            .select("*")
            .eq("trip_id", trip.id)

        let pricingRows = Array.isArray(pricingResult.data) ? pricingResult.data : []
        if (pricingResult.error) {
            console.warn(
                "[get-trip-display-price] pricing lookup API error, trying direct DB",
                pricingResult.error
            )
            const fallbackPricing = await fetchPricingViaDirectDb(normalizeText(trip.id))
            if (fallbackPricing.error) {
                console.error("[get-trip-display-price] pricing lookup direct DB error", fallbackPricing.error)
                return json({ error: "Pricing lookup failed" }, 500)
            }
            pricingRows = Array.isArray(fallbackPricing.data) ? fallbackPricing.data : []
        }

        const todayKey = getTodayDateKey()
        const nowMs = Date.now()

        const futureRows = pricingRows.filter((row) => {
            const dateKey = getDateValue(row)
            return Boolean(dateKey) && dateKey >= todayKey && toNumber(row?.price) > 0
        })

        if (futureRows.length === 0) {
            return json({ error: "No future pricing found" }, 404)
        }

        let nextBatchDate = ""
        for (const row of futureRows) {
            const dateKey = getDateValue(row)
            if (!dateKey) continue
            if (!nextBatchDate || dateKey < nextBatchDate) nextBatchDate = dateKey
        }

        const displayRow = pickCheapestDisplayRow(futureRows, nowMs)
        if (!displayRow) {
            return json({ error: "No display pricing found" }, 404)
        }

        const displaySummary = buildDisplaySummary(displayRow, nowMs)
        const sharing = normalizeSharing(displayRow?.sharing || displayRow?.variant_name) || null
        const transport = normalizeText(getTransportValue(displayRow)) || null

        return json({
            trip_id: normalizeText(trip.id),
            slug: normalizeText(trip.slug) || slug || null,
            next_batch_date: nextBatchDate || null,
            display_summary: displaySummary,
            context: {
                departure_date: getDateValue(displayRow) || null,
                sharing,
                transport,
            },
            engine_version: "v3",
        })
    } catch (err: any) {
        console.error("[get-trip-display-price] fatal", err)
        return json({ error: err?.message || "Internal server error" }, 500)
    }
})
