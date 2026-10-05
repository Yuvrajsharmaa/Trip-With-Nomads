import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    buildPaymentAttemptInsert,
    canStartPaymentRetry,
    isUuid,
    nextPaymentAttemptNumber,
    normalizeIdempotencyKey,
} from "../_shared/payment_idempotency.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function isUniqueViolation(error: any): boolean {
    return String(error?.code || "").trim() === "23505"
}

function responseJson(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
    })
}

async function buildPayuPayload(params: {
    attempt: any
    booking: any
    payuKey: string
    payuSalt: string
    isTest: boolean
    supabaseUrl: string
}) {
    const { attempt, booking, payuKey, payuSalt, isTest, supabaseUrl } = params
    const amount = round2(Math.max(0, toNumber(attempt?.amount_minor) / 100)).toFixed(2)
    const txnid = String(
        attempt?.provider_transaction_id || booking?.payu_txnid || `txn_${String(attempt?.id || Date.now()).slice(-16)}`,
    ).trim()
    const productinfo = "Trip Booking"
    const firstname = String(booking?.name || "").trim().split(" ")[0] || "Guest"
    const email = normalizeEmail(booking?.email)
    const phone = String(booking?.phone || "").trim()
    const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${booking.id}||||||||||${payuSalt}`
    const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
    const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

    const callbackUrl =
        Deno.env.get("PAYMENT_CALLBACK_URL") || `${supabaseUrl}/functions/v1/handle-payment`

    return {
        action: isTest ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment",
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
    }
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

        const body = await req.json().catch(() => ({}))
        const bookingId = String(body?.booking_id || "").trim()
        const providedEmail = normalizeEmail(body?.email)
        let retryRequestId = ""
        try {
            retryRequestId = normalizeIdempotencyKey(
                body?.retry_request_id || req.headers.get("idempotency-key"),
                "retry_request_id",
            )
        } catch (error: any) {
            return responseJson({ error: error?.message || "retry_request_id is required" }, 400)
        }

        if (!isUuid(bookingId)) {
            return responseJson({ error: "Invalid booking_id format" }, 400)
        }
        if (!providedEmail) {
            return responseJson({ error: "Email is required for retry" }, 400)
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, total_amount, payable_now_amount, payment_mode, payment_status, settlement_status, name, email, phone, currency, payu_txnid, payment_provider",
            )
            .eq("id", bookingId)
            .single()
        if (bookingError || !booking) throw new Error("Booking not found")

        const bookingEmail = normalizeEmail(booking.email)
        if (!bookingEmail || bookingEmail !== providedEmail) {
            return responseJson({ error: "Booking not found" }, 404)
        }

        const existingRequest = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("idempotency_key", retryRequestId)
            .maybeSingle()
        if (existingRequest.error) throw new Error(existingRequest.error.message || "Could not read retry request")
        if (existingRequest.data) {
            if (String(existingRequest.data.booking_id) !== String(booking.id)) {
                return responseJson({
                    error: "retry_request_id was already used for another booking",
                    code: "IDEMPOTENCY_CONFLICT",
                }, 409)
            }

            const payu = await buildPayuPayload({
                attempt: existingRequest.data,
                booking,
                payuKey,
                payuSalt,
                isTest,
                supabaseUrl,
            })
            return responseJson({
                booking_id: booking.id,
                retry_request_id: retryRequestId,
                replayed: true,
                attempt_id: existingRequest.data.id,
                attempt_no: existingRequest.data.attempt_no,
                payment_provider: existingRequest.data.provider,
                payment_status: booking.payment_status,
                payment_mode: booking.payment_mode,
                payable_now_amount: round2(toNumber(booking.payable_now_amount)),
                total_amount: round2(toNumber(booking.total_amount)),
                payu,
            })
        }

        if (String(booking.payment_status || "").toLowerCase() === "paid") {
            return responseJson({
                error: "Booking is already paid. Retry is not allowed.",
                code: "BOOKING_ALREADY_PAID",
            }, 409)
        }

        const { data: attempts, error: attemptsError } = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("booking_id", booking.id)
            .order("attempt_no", { ascending: false })
        if (attemptsError) throw new Error(attemptsError.message || "Could not read payment attempts")

        const latestAttempt = Array.isArray(attempts) ? attempts[0] : null
        const latestState = latestAttempt || { status: booking.payment_status }
        if (!canStartPaymentRetry({ status: latestState.status, expiresAt: latestState.expires_at })) {
            const status = String(latestState.status || booking.payment_status || "unknown").toLowerCase()
            const message = status === "pending"
                ? "A payment attempt is still pending. Mark it expired before retrying."
                : status === "paid" || status === "succeeded"
                    ? "Booking is already paid. Retry is not allowed."
                    : "This booking is not eligible for a payment retry."
            return responseJson({ error: message, code: "RETRY_NOT_ALLOWED", attempt_status: status }, 409)
        }

        const mode =
            String(booking.payment_mode || "").trim().toLowerCase() === "partial_25"
                ? "partial_25"
                : "full"
        const totalAmount = round2(Math.max(0, toNumber(booking.total_amount)))
        const payableNow = round2(
            Math.max(
                0,
                toNumber(booking.payable_now_amount || (mode === "partial_25" ? totalAmount * 0.25 : totalAmount)),
            ),
        )
        const amountToRetry = mode === "partial_25" ? payableNow : totalAmount
        if (amountToRetry <= 0) throw new Error("Invalid payment amount")

        const baseRef = compactRef(booking.booking_ref) || compactRef(booking.id).slice(0, 10)
        const txnid = `${baseRef}-${Date.now().toString().slice(-6)}`
        const attemptNo = nextPaymentAttemptNumber(Array.isArray(attempts) ? attempts : [])
        const paymentProvider = String(
            booking.payment_provider || Deno.env.get("PAYMENT_PROVIDER") || "payu",
        ).trim().toLowerCase()
        const attemptPayload = buildPaymentAttemptInsert({
            bookingId: booking.id,
            attemptNo,
            idempotencyKey: retryRequestId,
            provider: paymentProvider,
            amount: amountToRetry,
            currency: booking.currency || "INR",
            providerTransactionId: txnid,
            status: "pending",
        })
        attemptPayload.expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

        const attemptInsert = await supabase
            .from("payment_attempts")
            .insert(attemptPayload)
            .select("*")
            .single()
        let paymentAttempt = attemptInsert.data
        let replayed = false

        if (attemptInsert.error && isUniqueViolation(attemptInsert.error)) {
            const concurrentRequest = await supabase
                .from("payment_attempts")
                .select("*")
                .eq("idempotency_key", retryRequestId)
                .maybeSingle()
            if (concurrentRequest.data) {
                if (String(concurrentRequest.data.booking_id) !== String(booking.id)) {
                    return responseJson({
                        error: "retry_request_id was already used for another booking",
                        code: "IDEMPOTENCY_CONFLICT",
                    }, 409)
                }
                paymentAttempt = concurrentRequest.data
                replayed = true
            } else {
                return responseJson({
                    error: "Another payment attempt is already active for this booking",
                    code: "RETRY_IN_PROGRESS",
                }, 409)
            }
        }

        if (attemptInsert.error && !paymentAttempt) {
            throw new Error(attemptInsert.error.message || "Could not create payment attempt")
        }

        const bookingUpdate = await supabase
            .from("bookings")
            .update({
                payu_txnid: txnid,
                payment_gateway_txn_id: txnid,
                payment_status: "pending",
                settlement_status: "pending",
                active_payment_attempt_id: paymentAttempt.id,
                payment_attempt_number: paymentAttempt.attempt_no,
                payment_provider: paymentAttempt.provider || paymentProvider,
            })
            .eq("id", booking.id)
        if (bookingUpdate.error) throw new Error(bookingUpdate.error.message || "Could not update booking retry state")

        const payu = await buildPayuPayload({
            attempt: paymentAttempt,
            booking: { ...booking, payu_txnid: txnid },
            payuKey,
            payuSalt,
            isTest,
            supabaseUrl,
        })

        return responseJson({
            booking_id: booking.id,
            retry_request_id: retryRequestId,
            replayed,
            attempt_id: paymentAttempt.id,
            attempt_no: paymentAttempt.attempt_no,
            payment_provider: paymentAttempt.provider || paymentProvider,
            payment_status: "pending",
            payment_mode: mode,
            payable_now_amount: payableNow,
            total_amount: totalAmount,
            payu,
        })
    } catch (error: any) {
        return responseJson({ error: error?.message || "Retry failed" }, 400)
    }
})
