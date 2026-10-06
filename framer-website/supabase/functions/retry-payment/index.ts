import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    listBookingStatusSecrets,
    verifyBookingStatusToken,
} from "../_shared/booking_status_token.ts"
import { calculatePaymentAmounts, normalizePaymentMode } from "../_shared/payment_amounts.ts"
import { parseRetryRequest } from "../_shared/payment_retry.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim()
    )
}

function normalizeEmail(value: unknown): string {
    return String(value || "").trim().toLowerCase()
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function compactRef(value: any): string {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/^TWN-/, "")
        .replace(/[^A-Z0-9]/g, "")
}

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

function resolveRazorpayTestMode(): boolean {
    const explicit = Deno.env.get("PAYMENT_GATEWAY_TEST_MODE")
    if (explicit != null && explicit !== "") return isTruthy(explicit)
    return isTruthy(Deno.env.get("RAZORPAY_TEST_MODE"))
}

function toPaise(amount: number): number {
    return Math.max(0, Math.round(Math.max(0, toNumber(amount)) * 100))
}

function withQueryParams(baseUrl: string, extra: Record<string, string>): string {
    const url = new URL(baseUrl)
    for (const [key, value] of Object.entries(extra)) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}

function normalizeTripNameForNote(value: unknown, fallback = "Trip Booking"): string {
    const clean = String(value || "").trim().replace(/\s+/g, " ")
    const out = clean || fallback
    return out.length > 120 ? out.slice(0, 120) : out
}

async function createRazorpayOrder(params: {
    keyId: string
    keySecret: string
    amountPaise: number
    currency: string
    receipt: string
    notes?: Record<string, string>
}) {
    const auth = btoa(`${params.keyId}:${params.keySecret}`)
    const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            amount: params.amountPaise,
            currency: params.currency,
            receipt: params.receipt,
            notes: params.notes || {},
        }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.id) {
        const message = data?.error?.description || data?.error?.reason || data?.error || "Razorpay order create failed"
        throw new Error(String(message))
    }
    return data
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase Secrets (URL/RoleKey)")
        }

        const isTest = resolveRazorpayTestMode()
        const razorpayKeyId = isTest
            ? Deno.env.get("RAZORPAY_TEST_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID") || ""
            : Deno.env.get("RAZORPAY_LIVE_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID") || ""
        const razorpayKeySecret = isTest
            ? Deno.env.get("RAZORPAY_TEST_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET") || ""
            : Deno.env.get("RAZORPAY_LIVE_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET") || ""

        if (!razorpayKeyId || !razorpayKeySecret) {
            throw new Error("Missing Razorpay Secrets")
        }

        const body = await req.json().catch(() => ({}))
        let retryRequest: ReturnType<typeof parseRetryRequest>
        try {
            retryRequest = parseRetryRequest(body)
        } catch (requestError: any) {
            return new Response(JSON.stringify({ error: requestError?.message || "Invalid retry request" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401,
            })
        }
        const { bookingId, providedEmail, statusToken } = {
            bookingId: retryRequest.bookingId,
            providedEmail: retryRequest.email,
            statusToken: retryRequest.statusToken,
        }

        if (!isUuid(bookingId)) {
            return new Response(JSON.stringify({ error: "Invalid booking_id format" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            })
        }
        if (!providedEmail) {
            return new Response(JSON.stringify({ error: "Email is required for retry" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            })
        }

        const statusSecrets = listBookingStatusSecrets()
        if (statusSecrets.length === 0) {
            return new Response(JSON.stringify({ error: "Status token secret not configured" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            })
        }
        let validStatusToken = false
        for (const secret of statusSecrets) {
            if (await verifyBookingStatusToken(statusToken, bookingId, secret)) {
                validStatusToken = true
                break
            }
        }
        if (!validStatusToken) {
            return new Response(JSON.stringify({ error: "Invalid or expired status token" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
            })
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: booking, error } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, trip_id, total_amount, payable_now_amount, payment_mode, payment_status, settlement_status, name, email, phone"
            )
            .eq("id", bookingId)
            .single()
        if (error || !booking) throw new Error("Booking not found")

        const bookingEmail = normalizeEmail(booking.email)
        if (!bookingEmail || bookingEmail !== providedEmail) {
            return new Response(JSON.stringify({ error: "Booking not found" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 404,
            })
        }

        if (String(booking.payment_status || "").toLowerCase() === "paid") {
            throw new Error("Booking is already paid. Retry is not allowed.")
        }

        const totalAmount = round2(Math.max(0, toNumber(booking.total_amount)))
        const { paymentMode: mode, payableNowAmount: payableNow, dueAmount } = calculatePaymentAmounts({
            paymentMode: normalizePaymentMode(booking.payment_mode),
            totalAmount,
            storedPayableNowAmount: booking.payable_now_amount,
        })
        const amountToRetry = mode === "partial_25" ? payableNow : totalAmount
        if (amountToRetry <= 0) throw new Error("Invalid payment amount")

        const baseRef = compactRef(booking.booking_ref) || compactRef(booking.id).slice(0, 10)
        const txnid = `${baseRef}-${Date.now().toString().slice(-6)}`
        const productinfo = "Trip Booking"
        const tripDetails = booking.trip_id
            ? await supabase
                .from("trips")
                .select("title")
                .eq("id", booking.trip_id)
                .maybeSingle()
            : { data: null }
        const tripNameForNotes = normalizeTripNameForNote(tripDetails?.data?.title, productinfo)
        const firstname = String(booking.name || "").trim().split(" ")[0] || "Guest"
        const email = String(booking.email || "").trim()
        const phone = String(booking.phone || "").trim()
        const callbackBaseUrl =
            Deno.env.get("PAYMENT_CALLBACK_URL") || `${supabaseUrl}/functions/v1/handle-payment`

        const amountPaise = toPaise(amountToRetry)
        if (amountPaise <= 0) throw new Error("Invalid payment amount")

            const callbackUrl = withQueryParams(callbackBaseUrl, {
                booking_id: booking.id,
                gateway: "razorpay",
            })
            const orderReceipt = String(txnid).slice(0, 40)
            const order = await createRazorpayOrder({
                keyId: razorpayKeyId,
                keySecret: razorpayKeySecret,
                amountPaise,
                currency: "INR",
                receipt: orderReceipt,
                notes: {
                    booking_id: booking.id,
                    trip_name: tripNameForNotes,
                    payment_mode: mode,
                    retry: "true",
                },
            })

            const orderId = String(order.id || "").trim()
            await supabase
                .from("bookings")
                .update({
                    payment_gateway_txn_id: txnid,
                    payment_gateway_order_or_ref_id: orderId || null,
                    payment_status: "pending",
                    settlement_status: "pending",
                    payable_now_amount: payableNow,
                    due_amount: dueAmount,
                })
                .eq("id", booking.id)

        return new Response(
            JSON.stringify({
                booking_id: booking.id,
                payment_mode: mode,
                payable_now_amount: payableNow,
                due_amount: dueAmount,
                total_amount: totalAmount,
                gateway: "razorpay",
                razorpay: {
                    key: razorpayKeyId,
                    order_id: orderId,
                    amount: amountPaise,
                    currency: "INR",
                    name: "Trip With Nomads",
                    description: productinfo,
                    prefill: {
                        name: String(booking.name || "").trim(),
                        email,
                        contact: phone,
                    },
                    notes: {
                        booking_id: booking.id,
                        trip_name: tripNameForNotes,
                        payment_mode: mode,
                        retry: "true",
                    },
                    callback_url: callbackUrl,
                    redirect: true,
                },
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        )
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || "Retry failed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        })
    }
})
