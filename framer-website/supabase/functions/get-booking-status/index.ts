import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    listBookingStatusSecrets,
    verifyBookingStatusToken,
} from "../_shared/booking_status_token.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
}

function jsonResponse(payload: Record<string, any>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
        },
    })
}

function normalizeText(value: unknown): string {
    return String(value || "").trim()
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalizeText(value)
    )
}

function isMissingColumnError(error: any, columnName: string): boolean {
    const needle = normalizeText(columnName).toLowerCase()
    const message = String(error?.message || error?.details || error?.hint || error || "")
        .trim()
        .toLowerCase()
    return message.includes("column") && message.includes(needle)
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST" && req.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405)
    }

    try {
        const url = new URL(req.url)
        let bookingId = normalizeText(url.searchParams.get("booking_id"))
        let statusToken = normalizeText(url.searchParams.get("status_token"))

        if (req.method === "POST") {
            const body = await req.json().catch(() => ({}))
            bookingId = normalizeText(body?.booking_id || bookingId)
            statusToken = normalizeText(body?.status_token || statusToken)
        }

        if (!isUuid(bookingId)) {
            return jsonResponse({ error: "Invalid booking_id format" }, 400)
        }
        if (!statusToken) {
            return jsonResponse({ error: "Missing status token" }, 401)
        }

        const secrets = listBookingStatusSecrets()
        if (secrets.length === 0) {
            return jsonResponse({ error: "Status token secret not configured" }, 500)
        }

        let isTokenValid = false
        for (const secret of secrets) {
            if (await verifyBookingStatusToken(statusToken, bookingId, secret)) {
                isTokenValid = true
                break
            }
        }
        if (!isTokenValid) {
            return jsonResponse({ error: "Invalid or expired status token" }, 403)
        }

        const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"))
        const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
        if (!supabaseUrl || !serviceRoleKey) {
            return jsonResponse({ error: "Missing Supabase configuration" }, 500)
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)
        let supportsBalanceDueNote = true
        let { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, trip_id, departure_date, transport, travellers, payment_breakdown, subtotal_amount, discount_amount, coupon_code, coupon_snapshot, tax_amount, total_amount, currency, payment_status, payment_mode, payable_now_amount, paid_amount, due_amount, settlement_status, balance_due_note, payu_txnid, name, email, phone, created_at"
            )
            .eq("id", bookingId)
            .single()

        if (bookingError && isMissingColumnError(bookingError, "balance_due_note")) {
            supportsBalanceDueNote = false
            const fallback = await supabase
                .from("bookings")
                .select(
                    "id, booking_ref, trip_id, departure_date, transport, travellers, payment_breakdown, subtotal_amount, discount_amount, coupon_code, coupon_snapshot, tax_amount, total_amount, currency, payment_status, payment_mode, payable_now_amount, paid_amount, due_amount, settlement_status, payu_txnid, name, email, phone, created_at"
                )
                .eq("id", bookingId)
                .single()
            booking = fallback.data as any
            bookingError = fallback.error
        }

        if (bookingError || !booking) {
            return jsonResponse({ error: "Booking not found" }, 404)
        }

        let tripTitle = ""
        if (booking?.trip_id) {
            const tripRes = await supabase
                .from("trips")
                .select("title")
                .eq("id", booking.trip_id)
                .maybeSingle()
            if (!tripRes.error && tripRes.data) {
                tripTitle = String(tripRes.data.title || "").trim()
            }
        }

        return jsonResponse({
            booking: {
                ...booking,
                trip_title: tripTitle || null,
                balance_due_note: supportsBalanceDueNote
                    ? (booking as any)?.balance_due_note ?? null
                    : null,
            },
        })
    } catch (err: any) {
        return jsonResponse({ error: String(err?.message || "Internal server error") }, 500)
    }
})
