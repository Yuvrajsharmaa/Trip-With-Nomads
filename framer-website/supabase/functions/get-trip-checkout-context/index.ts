import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts"

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
            ? await client.queryObject<{ id: string; slug: string; title: string | null }>`
                  select id, slug, title
                  from public.trips
                  where id = ${params.tripId}
                  limit 1
              `
            : await client.queryObject<{ id: string; slug: string; title: string | null }>`
                  select id, slug, title
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
            .select("id, slug, title")
            .limit(1)

        const tripResult = tripId
            ? await tripQuery.eq("id", tripId)
            : await tripQuery.eq("slug", slug)

        let trip = Array.isArray(tripResult.data) ? tripResult.data[0] : null
        if (tripResult.error) {
            console.warn(
                "[get-trip-checkout-context] trip lookup API error, trying direct DB",
                tripResult.error
            )
            const fallbackTrip = await fetchTripViaDirectDb({ tripId, slug })
            if (fallbackTrip.error) {
                console.error(
                    "[get-trip-checkout-context] trip lookup direct DB error",
                    fallbackTrip.error
                )
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
                "[get-trip-checkout-context] pricing lookup API error, trying direct DB",
                pricingResult.error
            )
            const fallbackPricing = await fetchPricingViaDirectDb(normalizeText(trip.id))
            if (fallbackPricing.error) {
                console.error(
                    "[get-trip-checkout-context] pricing lookup direct DB error",
                    fallbackPricing.error
                )
                return json({ error: "Pricing lookup failed" }, 500)
            }
            pricingRows = Array.isArray(fallbackPricing.data) ? fallbackPricing.data : []
        }

        return json({
            trip: {
                id: normalizeText(trip.id),
                slug: normalizeText(trip.slug),
                title: normalizeText(trip.title),
            },
            pricing_rows: pricingRows,
            engine_version: "checkout-v1",
        })
    } catch (err: any) {
        console.error("[get-trip-checkout-context] fatal", err)
        return json({ error: err?.message || "Internal server error" }, 500)
    }
})
