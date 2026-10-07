import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    buildPaymentAttemptInsert,
    canStartPaymentRetry,
    isUuid,
    isStalePaymentAttempt,
    nextPaymentAttemptNumber,
    normalizeIdempotencyKey,
} from "../_shared/payment_idempotency.ts"
import {
    createRazorpayOrder,
    paymentCallbackUrl,
    razorpayCredentials,
} from "../_shared/razorpay.ts"
import {
    issueBookingStatusToken,
    resolveBookingStatusSecret,
} from "../_shared/booking_status_token.ts"
import {
    deliverInternalBookingNotification,
} from "../_shared/internal_booking_notifications.ts"
import { buildInternalNotificationEventKey } from "../_shared/internal_booking_email.ts"
import type { PaymentEmailBooking } from "../_shared/payment_email.ts"

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

function isUniqueViolation(error: any): boolean {
    return String(error?.code || "").trim() === "23505"
}

function responseJson(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
    })
}

async function buildRazorpayPayload(params: {
    supabase: any
    attempt: any
    booking: any
    supabaseUrl: string
    statusToken?: string | null
}) {
    const credentials = razorpayCredentials()
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }
    let orderId = String(params.attempt?.provider_order_id || params.booking?.payment_gateway_order_or_ref_id || "").trim()
    if (!orderId) {
        const order = await createRazorpayOrder({
            amount: Math.max(0, toNumber(params.attempt?.amount_minor) / 100),
            currency: params.booking?.currency || "INR",
            receipt: `twn_${String(params.attempt?.id || Date.now()).replace(/-/g, "").slice(0, 32)}`,
            notes: {
                booking_id: String(params.booking.id),
                attempt_id: String(params.attempt.id),
            },
        })
        orderId = String(order.id)
        const attemptUpdate = await params.supabase
            .from("payment_attempts")
            .update({ provider: "razorpay", provider_order_id: orderId, updated_at: new Date().toISOString() })
            .eq("id", params.attempt.id)
        if (attemptUpdate.error) throw attemptUpdate.error
        params.attempt = { ...params.attempt, provider: "razorpay", provider_order_id: orderId }
    }
    const bookingUpdate = await params.supabase
        .from("bookings")
        .update({
            payment_provider: "razorpay",
            payment_gateway_order_or_ref_id: orderId,
            active_payment_attempt_id: params.attempt.id,
            payment_attempt_number: params.attempt.attempt_no,
        })
        .eq("id", params.booking.id)
    if (bookingUpdate.error && !String(bookingUpdate.error.message || "").toLowerCase().includes("payment_gateway_order_or_ref_id")) {
        throw bookingUpdate.error
    }
    return {
        key_id: credentials.keyId,
        order_id: orderId,
        amount: Math.max(1, Math.round(Math.max(0, toNumber(params.attempt.amount_minor) / 100) * 100)),
        currency: String(params.booking.currency || "INR").toUpperCase(),
        callback_url: paymentCallbackUrl({
            bookingId: String(params.booking.id),
            statusToken: params.statusToken,
            supabaseUrl: params.supabaseUrl,
        }),
        notes: { booking_id: String(params.booking.id), attempt_id: String(params.attempt.id) },
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    let notificationSupabase: any = null
    let notificationBooking: PaymentEmailBooking | null = null
    let notificationAttempt: Record<string, unknown> | null = null
    let notificationRequestId = ""

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase Secrets (URL/RoleKey)")
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
        notificationRequestId = retryRequestId

        if (!isUuid(bookingId)) {
            return responseJson({ error: "Invalid booking_id format" }, 400)
        }
        if (!providedEmail) {
            return responseJson({ error: "Email is required for retry" }, 400)
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        notificationSupabase = supabase
        const { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select("*")
            .eq("id", bookingId)
            .single()
        if (bookingError || !booking) throw new Error("Booking not found")

        const bookingEmail = normalizeEmail(booking.email)
        if (!bookingEmail || bookingEmail !== providedEmail) {
            return responseJson({ error: "Booking not found" }, 404)
        }
        notificationBooking = booking as PaymentEmailBooking

        const notifyRetryStarted = async (attempt: any, orderId: string) => {
            notificationAttempt = attempt
            const bookingForNotification = {
                ...booking,
                payment_status: "pending",
                settlement_status: "pending",
                payment_provider: attempt.provider || "razorpay",
                payment_gateway_order_or_ref_id: orderId || booking.payment_gateway_order_or_ref_id,
                active_payment_attempt_id: attempt.id,
                payment_attempt_number: attempt.attempt_no,
            }
            const status = await deliverInternalBookingNotification({
                supabase,
                eventType: "payment_retry_started",
                eventKey: buildInternalNotificationEventKey({
                    eventType: "payment_retry_started",
                    bookingId: String(booking.id),
                    attemptId: String(attempt.id),
                }),
                booking: bookingForNotification as PaymentEmailBooking,
                attempt,
                eventName: "payment.retry_started",
                eventId: notificationRequestId,
                occurredAt: new Date().toISOString(),
            })
            if (status === "failed") {
                console.error("[retry-payment] internal retry-started email failed", {
                    bookingId: booking.id,
                    attemptId: attempt.id,
                })
            }
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

            const statusSecret = resolveBookingStatusSecret(String(
                Deno.env.get("PAYMENT_STATUS_SECRET") ||
                Deno.env.get("RAZORPAY_LIVE_KEY_SECRET") ||
                Deno.env.get("RAZORPAY_TEST_KEY_SECRET") ||
                Deno.env.get("RAZORPAY_KEY_SECRET") ||
                "",
            ))
            const statusToken = statusSecret
                ? await issueBookingStatusToken(booking.id, statusSecret)
                : null
            const existingProvider = String(existingRequest.data.provider || booking.payment_provider || "razorpay").toLowerCase()
            if (existingProvider !== "razorpay") {
                return responseJson({
                    error: `Unsupported payment provider: ${existingProvider}`,
                    code: "PAYMENT_PROVIDER_UNSUPPORTED",
                }, 409)
            }
            notificationAttempt = existingRequest.data
            const existingGateway = await buildRazorpayPayload({
                supabase,
                attempt: existingRequest.data,
                booking,
                supabaseUrl,
                statusToken: statusToken?.token,
            })
            await notifyRetryStarted(existingRequest.data, String(existingGateway.order_id || ""))
            return responseJson({
                booking_id: booking.id,
                retry_request_id: retryRequestId,
                replayed: true,
                attempt_id: existingRequest.data.id,
                attempt_no: existingRequest.data.attempt_no,
                gateway: existingProvider,
                payment_provider: existingRequest.data.provider,
                payment_status: booking.payment_status,
                payment_mode: booking.payment_mode,
                payable_now_amount: round2(toNumber(booking.payable_now_amount)),
                total_amount: round2(toNumber(booking.total_amount)),
                status_token: statusToken?.token || null,
                status_token_expires_at: statusToken?.expiresAt || null,
                [existingProvider]: existingGateway,
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
        let latestState: any = latestAttempt || { status: booking.payment_status }
        if (latestAttempt && isStalePaymentAttempt({
            status: latestAttempt.status,
            expiresAt: latestAttempt.expires_at,
        })) {
            const expired = await supabase
                .from("payment_attempts")
                .update({
                    status: "expired",
                    error_code: "ATTEMPT_EXPIRED",
                    error_message: "Payment attempt expired before retry",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", latestAttempt.id)
                .in("status", ["creating", "pending"])
                .select("*")
                .maybeSingle()
            if (expired.error) throw new Error(expired.error.message || "Could not expire payment attempt")
            if (expired.data) latestState = expired.data
            else {
                const refreshed = await supabase
                    .from("payment_attempts")
                    .select("*")
                    .eq("id", latestAttempt.id)
                    .single()
                if (refreshed.error) throw new Error(refreshed.error.message || "Could not refresh payment attempt")
                latestState = refreshed.data
            }
        }
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

        const attemptNo = nextPaymentAttemptNumber(Array.isArray(attempts) ? attempts : [])
        const paymentProvider = String(
            booking.payment_provider || Deno.env.get("PAYMENT_PROVIDER") || "razorpay",
        ).trim().toLowerCase()
        if (paymentProvider !== "razorpay") {
            return responseJson({
                error: `Unsupported payment provider: ${paymentProvider}`,
                code: "PAYMENT_PROVIDER_UNSUPPORTED",
            }, 409)
        }
        const attemptPayload = buildPaymentAttemptInsert({
            bookingId: booking.id,
            attemptNo,
            idempotencyKey: retryRequestId,
            provider: paymentProvider,
            amount: amountToRetry,
            currency: booking.currency || "INR",
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
        notificationAttempt = paymentAttempt

        const bookingUpdate = await supabase
            .from("bookings")
            .update({
                payment_status: "pending",
                settlement_status: "pending",
                active_payment_attempt_id: paymentAttempt.id,
                payment_attempt_number: paymentAttempt.attempt_no,
                payment_provider: paymentAttempt.provider || paymentProvider,
            })
            .eq("id", booking.id)
        if (bookingUpdate.error) throw new Error(bookingUpdate.error.message || "Could not update booking retry state")

        const statusSecret = resolveBookingStatusSecret(String(
            Deno.env.get("PAYMENT_STATUS_SECRET") ||
            Deno.env.get("RAZORPAY_LIVE_KEY_SECRET") ||
            Deno.env.get("RAZORPAY_TEST_KEY_SECRET") ||
            Deno.env.get("RAZORPAY_KEY_SECRET") ||
            "",
        ))
        const statusToken = statusSecret
            ? await issueBookingStatusToken(booking.id, statusSecret)
            : null
        let gateway: any
        if (paymentProvider === "razorpay") {
            gateway = await buildRazorpayPayload({
                supabase,
                attempt: paymentAttempt,
                booking: { ...booking, payment_provider: "razorpay" },
                supabaseUrl,
                statusToken: statusToken?.token,
            })
        } else {
            throw new Error(`Unsupported payment provider: ${paymentProvider}`)
        }
        await notifyRetryStarted(paymentAttempt, String(gateway.order_id || ""))

        return responseJson({
            booking_id: booking.id,
            retry_request_id: retryRequestId,
            replayed,
            attempt_id: paymentAttempt.id,
            attempt_no: paymentAttempt.attempt_no,
            gateway: paymentProvider,
            payment_provider: paymentAttempt.provider || paymentProvider,
            payment_status: "pending",
            payment_mode: mode,
            payable_now_amount: payableNow,
            total_amount: totalAmount,
            status_token: statusToken?.token || null,
            status_token_expires_at: statusToken?.expiresAt || null,
            [paymentProvider]: gateway,
        })
    } catch (error: any) {
        if (notificationBooking && notificationAttempt) {
            const status = await deliverInternalBookingNotification({
                supabase: notificationSupabase,
                eventType: "payment_retry_failed",
                eventKey: buildInternalNotificationEventKey({
                    eventType: "payment_retry_failed",
                    bookingId: String(notificationBooking.id || ""),
                    attemptId: String(notificationAttempt.id || ""),
                }),
                booking: notificationBooking,
                attempt: notificationAttempt,
                eventName: "payment.retry_failed",
                eventId: notificationRequestId,
                errorMessage: String(error?.message || "Payment retry failed"),
                occurredAt: new Date().toISOString(),
            })
            if (status === "failed") {
                console.error("[retry-payment] internal retry-failed email failed", {
                    bookingId: notificationBooking.id,
                    attemptId: notificationAttempt.id,
                })
            }
        }
        return responseJson({ error: error?.message || "Retry failed" }, 400)
    }
})
