import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type PaymentGateway = "payu" | "razorpay"

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

function resolvePaymentGateway(): PaymentGateway {
    const raw = String(Deno.env.get("PAYMENT_GATEWAY") || "payu").trim().toLowerCase()
    return raw === "razorpay" ? "razorpay" : "payu"
}

function resolveGatewayTestMode(gateway: PaymentGateway): boolean {
    const explicit = Deno.env.get("PAYMENT_GATEWAY_TEST_MODE")
    if (explicit != null && explicit !== "") return isTruthy(explicit)
    if (gateway === "razorpay") {
        const razorpayMode = Deno.env.get("RAZORPAY_TEST_MODE")
        if (razorpayMode != null && razorpayMode !== "") return isTruthy(razorpayMode)
    }
    return isTruthy(Deno.env.get("PAYU_TEST_MODE"))
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

        const paymentGateway = resolvePaymentGateway()
        const isTest = resolveGatewayTestMode(paymentGateway)

        const payuKey = paymentGateway === "payu"
            ? (isTest
                ? Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY")
                : Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY")) || ""
            : ""
        const payuSalt = paymentGateway === "payu"
            ? (isTest
                ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
                : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")) || ""
            : ""
        const razorpayKeyId = paymentGateway === "razorpay"
            ? (isTest
                ? Deno.env.get("RAZORPAY_TEST_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID")
                : Deno.env.get("RAZORPAY_LIVE_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID")) || ""
            : ""
        const razorpayKeySecret = paymentGateway === "razorpay"
            ? (isTest
                ? Deno.env.get("RAZORPAY_TEST_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET")
                : Deno.env.get("RAZORPAY_LIVE_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET")) || ""
            : ""

        if (paymentGateway === "payu" && (!payuKey || !payuSalt)) {
            throw new Error("Missing PayU Secrets")
        }
        if (paymentGateway === "razorpay" && (!razorpayKeyId || !razorpayKeySecret)) {
            throw new Error("Missing Razorpay Secrets")
        }

        const body = await req.json().catch(() => ({}))
        const bookingId = String(body?.booking_id || "").trim()
        const providedEmail = normalizeEmail(body?.email)

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

        const mode =
            String(booking.payment_mode || "").trim().toLowerCase() === "partial_25"
                ? "partial_25"
                : "full"
        const totalAmount = round2(Math.max(0, toNumber(booking.total_amount)))
        const payableNow = round2(
            Math.max(0, toNumber(booking.payable_now_amount || (mode === "partial_25" ? totalAmount * 0.25 : totalAmount)))
        )
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

        if (paymentGateway === "razorpay") {
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
                })
                .eq("id", booking.id)

            return new Response(
                JSON.stringify({
                    booking_id: booking.id,
                    payment_mode: mode,
                    payable_now_amount: payableNow,
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
        }

        const amount = amountToRetry.toFixed(2)
        const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${booking.id}||||||||||${payuSalt}`
        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        await supabase
            .from("bookings")
            .update({
                payment_gateway_txn_id: txnid,
                payment_status: "pending",
                settlement_status: "pending",
            })
            .eq("id", booking.id)

        const payuBase = isTest ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"

        return new Response(
            JSON.stringify({
                booking_id: booking.id,
                payment_mode: mode,
                payable_now_amount: payableNow,
                total_amount: totalAmount,
                gateway: "payu",
                payu: {
                    action: payuBase,
                    key: payuKey,
                    txnid,
                    amount,
                    productinfo,
                    firstname,
                    email,
                    phone,
                    surl: callbackBaseUrl,
                    furl: callbackBaseUrl,
                    hash,
                    udf1: booking.id,
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
