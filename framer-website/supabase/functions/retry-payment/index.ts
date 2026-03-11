import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

        const isTest = Deno.env.get("PAYU_TEST_MODE") === "true"
        const payuKey = isTest
            ? Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY")
            : Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY")
        const payuSalt = isTest
            ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
            : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")
        if (!payuKey || !payuSalt) {
            throw new Error("Missing PayU Secrets")
        }

        const { booking_id } = await req.json()
        const bookingId = String(booking_id || "").trim()
        if (!bookingId) throw new Error("booking_id is required")

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: booking, error } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, total_amount, payable_now_amount, payment_mode, payment_status, settlement_status, name, email, phone"
            )
            .eq("id", bookingId)
            .single()
        if (error || !booking) throw new Error("Booking not found")

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
        const firstname = String(booking.name || "").trim().split(" ")[0] || "Guest"
        const email = String(booking.email || "").trim()
        const phone = String(booking.phone || "").trim()
        const amount = amountToRetry.toFixed(2)

        const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${booking.id}||||||||||${payuSalt}`
        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        await supabase
            .from("bookings")
            .update({
                payu_txnid: txnid,
                payment_status: "pending",
                settlement_status: "pending",
            })
            .eq("id", booking.id)

        const payuBase = isTest ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"
        const callbackUrl =
            Deno.env.get("PAYMENT_CALLBACK_URL") || `${supabaseUrl}/functions/v1/handle-payment`

        return new Response(
            JSON.stringify({
                booking_id: booking.id,
                payment_mode: mode,
                payable_now_amount: payableNow,
                total_amount: totalAmount,
                payu: {
                    action: payuBase,
                    key: payuKey,
                    txnid,
                    amount,
                    productinfo,
                    firstname,
                    email,
                    phone,
                    surl: callbackUrl,
                    furl: callbackUrl,
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
