import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    buildPaymentAttemptInsert,
    canReplayPaymentAttempt,
    canStartPaymentRetry,
    expectedBookingPaymentAmountMinor,
    isUuid,
    isStalePaymentAttempt,
    isCompatiblePaymentAttemptReplay,
    nextPaymentAttemptNumber,
    normalizeIdempotencyKey,
} from "../_shared/payment_idempotency.ts"
import {
    ensurePaymentAttemptOrder,
    isRazorpayOrderConfirmedUnpaid,
    markPaymentAttemptOrderCreating,
    PaymentOrderInProgressError,
    recoverPaymentAttemptForRetry,
    reactivatePayablePaymentAttempt,
} from "../_shared/payment_attempt_order.ts"
import {
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
    mayCreate?: boolean
    credentials?: ReturnType<typeof razorpayCredentials>
}) {
    const credentials = params.credentials || razorpayCredentials()
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }
    let orderId = String(params.attempt?.provider_order_id || "").trim()
    if (!orderId && String(params.booking?.active_payment_attempt_id || "") === String(params.attempt?.id || "")) {
        orderId = String(params.booking?.payment_gateway_order_or_ref_id || "").trim()
    }
    if (!orderId) {
        const resolved = await ensurePaymentAttemptOrder({
            supabase: params.supabase,
            attempt: params.attempt,
            mayCreate: Boolean(params.mayCreate),
            amount: Math.max(0, toNumber(params.attempt?.amount_minor) / 100),
            currency: params.booking?.currency || "INR",
            receipt: `twn_${String(params.attempt?.id || Date.now()).replace(/-/g, "").slice(0, 32)}`,
            notes: {
                booking_id: String(params.booking.id),
                attempt_id: String(params.attempt.id),
            },
            credentials,
        })
        const order = resolved.order
        Object.assign(params.attempt, resolved.attempt)
        orderId = String(order.id)
    }
    const bookingUpdate = await params.supabase
        .from("bookings")
        .update({
            payment_status: "pending",
            settlement_status: "pending",
            payment_provider: "razorpay",
            payment_gateway_order_or_ref_id: orderId,
            active_payment_attempt_id: params.attempt.id,
            payment_attempt_number: params.attempt.attempt_no,
        })
        .eq("id", params.booking.id)
        .or("payment_status.is.null,payment_status.neq.paid")
        .select("id")
        .maybeSingle()
    const legacyOrderColumnMissing = String(bookingUpdate.error?.message || "")
        .toLowerCase()
        .includes("payment_gateway_order_or_ref_id")
    if (bookingUpdate.error && !legacyOrderColumnMissing) {
        throw bookingUpdate.error
    }
    if (!bookingUpdate.error && !bookingUpdate.data) {
        const currentBooking = await params.supabase
            .from("bookings")
            .select("payment_status")
            .eq("id", params.booking.id)
            .maybeSingle()
        if (currentBooking.error) throw currentBooking.error
        if (
            !currentBooking.data ||
            String(currentBooking.data.payment_status || "").toLowerCase() === "paid"
        ) {
            throw new PaymentOrderInProgressError(
                "Payment may already be complete. Refresh its status before retrying.",
            )
        }
        throw new Error("Could not update booking retry state")
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
    if (req.method !== "POST") {
        return responseJson({ error: "Method not allowed" }, 405)
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

        const mode = String(booking.payment_mode || "").trim().toLowerCase() === "partial_25"
            ? "partial_25"
            : "full"
        const totalAmount = round2(Math.max(0, toNumber(booking.total_amount)))
        const payableNow = round2(Math.max(
            0,
            toNumber(booking.payable_now_amount || (mode === "partial_25" ? totalAmount * 0.25 : totalAmount)),
        ))
        const amountToRetry = mode === "partial_25" ? payableNow : totalAmount
        if (amountToRetry <= 0) throw new Error("Invalid payment amount")
        const retryCurrency = String(booking.currency || "INR").trim().toUpperCase()
        const expectedPaymentAmountMinor = expectedBookingPaymentAmountMinor(booking)
        if (
            expectedPaymentAmountMinor === null ||
            Math.round(amountToRetry * 100) !== expectedPaymentAmountMinor
        ) {
            return responseJson({
                error: "The booking price changed after this payment retry started. Refresh before trying again.",
                code: "BOOKING_PRICE_CHANGED",
            }, 409)
        }

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
            if (!isCompatiblePaymentAttemptReplay(existingRequest.data, {
                bookingId: booking.id,
                amount: amountToRetry,
                currency: retryCurrency,
            })) {
                return responseJson({
                    error: "retry_request_id was already used with a different payment amount or currency",
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
            if (
                String(booking.payment_status || "").toLowerCase() === "paid" ||
                ["paid", "succeeded"].includes(String(existingRequest.data.status || "").toLowerCase())
            ) {
                return responseJson({
                    error: "Payment is already complete or is being reconciled. Check the booking status before retrying.",
                    code: "PAYMENT_RECONCILIATION_PENDING",
                }, 409)
            }
            const replayCredentials = razorpayCredentials()
            if (!replayCredentials.keyId || !replayCredentials.keySecret) {
                return responseJson({
                    error: "Razorpay payment configuration missing",
                    code: "PAYMENT_CONFIGURATION_MISSING",
                }, 503)
            }
            let replayAttempt = existingRequest.data
            const replayStatus = String(replayAttempt.status || "").toLowerCase()
            const replayIsStale = isStalePaymentAttempt({
                status: replayAttempt.status,
                expiresAt: replayAttempt.expires_at,
                providerOrderId: replayAttempt.provider_order_id,
                createdAt: replayAttempt.created_at,
                updatedAt: replayAttempt.updated_at,
            })
            if (["failed", "expired"].includes(replayStatus)) {
                return responseJson({
                    error: "This retry request has already ended. Start a fresh retry from the booking status page.",
                    code: "PAYMENT_ATTEMPT_FINISHED",
                }, 409)
            }
            if (
                replayAttempt.provider_order_id &&
                replayIsStale
            ) {
                try {
                    const resumed = await reactivatePayablePaymentAttempt({
                        supabase,
                        attempt: replayAttempt,
                        bookingId: String(booking.id),
                        amount: amountToRetry,
                        currency: retryCurrency,
                        credentials: replayCredentials,
                        idempotencyKey: retryRequestId,
                    })
                    if (!resumed) {
                        return responseJson({
                            error: "The previous Razorpay payment needs status reconciliation before it can be retried.",
                            code: "PAYMENT_RECONCILIATION_PENDING",
                        }, 409)
                    }
                    replayAttempt = resumed
                } catch {
                    return responseJson({
                        error: "The previous Razorpay payment could not be verified. Check its status before retrying.",
                        code: "PAYMENT_RECONCILIATION_PENDING",
                    }, 409)
                }
            }
            if (!String(replayAttempt.provider_order_id || "").trim() && ["creating", "pending"].includes(replayStatus)) {
                try {
                    const recovered = await recoverPaymentAttemptForRetry({
                        supabase,
                        attempt: replayAttempt,
                        bookingId: String(booking.id),
                        amount: amountToRetry,
                        currency: retryCurrency,
                        credentials: replayCredentials,
                        idempotencyKey: retryRequestId,
                    })
                    if (!recovered) {
                        return responseJson({
                            error: "The previous payment needs status reconciliation before it can be retried.",
                            code: "PAYMENT_RECONCILIATION_PENDING",
                        }, 409)
                    }
                    replayAttempt = recovered
                } catch (error) {
                    const isStarting = error instanceof PaymentOrderInProgressError
                    return responseJson({
                        error: isStarting
                            ? "This payment is already starting. Wait a moment, then refresh before trying again."
                            : "The previous payment could not be verified. Check its status before retrying.",
                        code: isStarting ? "PAYMENT_ATTEMPT_STARTING" : "PAYMENT_RECONCILIATION_PENDING",
                    }, 409)
                }
            }
            if (!canReplayPaymentAttempt(replayAttempt, booking)) {
                return responseJson({
                    error: "This payment request is no longer active. Refresh the booking status before trying again.",
                    code: "PAYMENT_ATTEMPT_CONFLICT",
                }, 409)
            }
            notificationAttempt = replayAttempt
            const existingGateway = await buildRazorpayPayload({
                supabase,
                attempt: replayAttempt,
                booking,
                supabaseUrl,
                statusToken: statusToken?.token,
                credentials: replayCredentials,
            })
            await notifyRetryStarted(replayAttempt, String(existingGateway.order_id || ""))
            return responseJson({
                booking_id: booking.id,
                retry_request_id: retryRequestId,
                replayed: true,
                attempt_id: replayAttempt.id,
                attempt_no: replayAttempt.attempt_no,
                gateway: existingProvider,
                payment_provider: replayAttempt.provider,
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

        const paymentProvider = String(
            booking.payment_provider || Deno.env.get("PAYMENT_PROVIDER") || "razorpay",
        ).trim().toLowerCase()
        const { data: attempts, error: attemptsError } = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("booking_id", booking.id)
            .order("attempt_no", { ascending: false })
        if (attemptsError) throw new Error(attemptsError.message || "Could not read payment attempts")

        const latestAttempt = Array.isArray(attempts) ? attempts[0] : null
        let latestState: any = latestAttempt || { status: booking.payment_status }
        let reusableAttempt: Record<string, any> | null = null
        let retryPaymentCredentials: ReturnType<typeof razorpayCredentials> | null = null
        const latestStatus = String(latestAttempt?.status || "").toLowerCase()
        const latestIsStale = latestAttempt && isStalePaymentAttempt({
            status: latestAttempt.status,
            expiresAt: latestAttempt.expires_at,
            providerOrderId: latestAttempt.provider_order_id,
            createdAt: latestAttempt.created_at,
            updatedAt: latestAttempt.updated_at,
        })
        if (
            paymentProvider === "razorpay" &&
            latestAttempt?.provider_order_id &&
            ["failed", "expired"].includes(latestStatus)
        ) {
            retryPaymentCredentials = razorpayCredentials()
            if (!retryPaymentCredentials.keyId || !retryPaymentCredentials.keySecret) {
                return responseJson({
                    error: "Razorpay payment configuration missing",
                    code: "PAYMENT_CONFIGURATION_MISSING",
                }, 503)
            }
            let orderConfirmedUnpaid = false
            try {
                orderConfirmedUnpaid = await isRazorpayOrderConfirmedUnpaid({
                    attempt: latestAttempt,
                    bookingId: String(booking.id),
                    amount: amountToRetry,
                    currency: retryCurrency,
                    credentials: retryPaymentCredentials,
                })
            } catch {
                return responseJson({
                    error: "The previous Razorpay payment could not be verified. Check its status before retrying.",
                    code: "PAYMENT_RECONCILIATION_PENDING",
                }, 409)
            }
            if (!orderConfirmedUnpaid) {
                return responseJson({
                    error: "The previous Razorpay payment needs status reconciliation before another collection can start.",
                    code: "PAYMENT_RECONCILIATION_PENDING",
                }, 409)
            }
        } else if (
            paymentProvider === "razorpay" &&
            latestAttempt?.provider_order_id &&
            latestIsStale
        ) {
            retryPaymentCredentials = razorpayCredentials()
            if (!retryPaymentCredentials.keyId || !retryPaymentCredentials.keySecret) {
                return responseJson({
                    error: "Razorpay payment configuration missing",
                    code: "PAYMENT_CONFIGURATION_MISSING",
                }, 503)
            }
            try {
                reusableAttempt = await reactivatePayablePaymentAttempt({
                    supabase,
                    attempt: latestAttempt,
                    bookingId: String(booking.id),
                    amount: amountToRetry,
                    currency: retryCurrency,
                    credentials: retryPaymentCredentials,
                    idempotencyKey: retryRequestId,
                })
            } catch {
                return responseJson({
                    error: "The previous Razorpay payment could not be verified. Check its status before retrying.",
                    code: "PAYMENT_RECONCILIATION_PENDING",
                }, 409)
            }
            if (!reusableAttempt) {
                return responseJson({
                    error: "The previous Razorpay payment needs status reconciliation before another collection can start.",
                    code: "PAYMENT_RECONCILIATION_PENDING",
                }, 409)
            }
            latestState = reusableAttempt
        } else if (
            latestAttempt &&
            !latestAttempt.provider_order_id &&
            (latestIsStale || ["failed", "expired"].includes(latestStatus))
        ) {
            if (paymentProvider === "razorpay") {
                retryPaymentCredentials = razorpayCredentials()
                if (!retryPaymentCredentials.keyId || !retryPaymentCredentials.keySecret) {
                    return responseJson({
                        error: "Razorpay payment configuration missing",
                        code: "PAYMENT_CONFIGURATION_MISSING",
                    }, 503)
                }
                try {
                    reusableAttempt = await recoverPaymentAttemptForRetry({
                        supabase,
                        attempt: latestAttempt,
                        bookingId: String(booking.id),
                        amount: amountToRetry,
                        currency: retryCurrency,
                        credentials: retryPaymentCredentials,
                        idempotencyKey: retryRequestId,
                    })
                } catch {
                    return responseJson({
                        error: "The previous payment attempt is still being reconciled. Try again shortly.",
                        code: "PAYMENT_ORDER_IN_PROGRESS",
                    }, 409)
                }
                if (!reusableAttempt) {
                    return responseJson({
                        error: "The previous payment needs status reconciliation before it can be retried.",
                        code: "PAYMENT_RECONCILIATION_PENDING",
                    }, 409)
                }
                latestState = reusableAttempt
            }
        }
        if (!reusableAttempt && !canStartPaymentRetry({ status: latestState.status, expiresAt: latestState.expires_at })) {
            const status = String(latestState.status || booking.payment_status || "unknown").toLowerCase()
            const message = status === "pending"
                ? "A payment attempt is still pending. Mark it expired before retrying."
                : status === "paid" || status === "succeeded"
                    ? "Booking is already paid. Retry is not allowed."
                    : "This booking is not eligible for a payment retry."
            return responseJson({ error: message, code: "RETRY_NOT_ALLOWED", attempt_status: status }, 409)
        }

        const attemptNo = nextPaymentAttemptNumber(Array.isArray(attempts) ? attempts : [])
        if (paymentProvider !== "razorpay") {
            return responseJson({
                error: `Unsupported payment provider: ${paymentProvider}`,
                code: "PAYMENT_PROVIDER_UNSUPPORTED",
            }, 409)
        }
        retryPaymentCredentials = retryPaymentCredentials || razorpayCredentials()
        if (!retryPaymentCredentials.keyId || !retryPaymentCredentials.keySecret) {
            return responseJson({
                error: "Razorpay payment configuration missing",
                code: "PAYMENT_CONFIGURATION_MISSING",
            }, 503)
        }
        let paymentAttempt: any = reusableAttempt
        let replayed = Boolean(reusableAttempt)
        let mayCreateOrder = false
        if (!paymentAttempt) {
            const attemptPayload = buildPaymentAttemptInsert({
                bookingId: booking.id,
                attemptNo,
                idempotencyKey: retryRequestId,
                provider: paymentProvider,
                amount: amountToRetry,
                currency: booking.currency || "INR",
                status: "pending",
            })
            attemptPayload.expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString()

            if (!booking.updated_at || Number(attemptPayload.amount_minor) !== expectedPaymentAmountMinor) {
                return responseJson({
                    error: "The booking price changed after this payment retry started. Refresh before trying again.",
                    code: "BOOKING_PRICE_CHANGED",
                }, 409)
            }

            const reservation = await supabase.schema("crm").rpc("reserve_website_booking_payment_attempt", {
                p_booking_id: booking.id,
                p_idempotency_key: attemptPayload.idempotency_key,
                p_expected_booking_updated_at: booking.updated_at,
                p_attempt_no: attemptPayload.attempt_no,
                p_provider: attemptPayload.provider,
                p_amount_minor: attemptPayload.amount_minor,
                p_currency: attemptPayload.currency,
                p_status: "pending",
                p_expires_at: attemptPayload.expires_at,
            })
            const reservationRow = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data
            if (reservation.error || !reservationRow?.payment_attempt) {
                const message = reservation.error?.message || "Could not reserve this payment retry"
                const sqlState = reservation.error?.code
                const conflict = sqlState === "40001" || sqlState === "23505" || sqlState === "23514"
                const code = sqlState === "40001"
                    ? "BOOKING_PRICE_CHANGED"
                    : sqlState === "23505"
                        ? "IDEMPOTENCY_CONFLICT"
                        : sqlState === "23514"
                            ? "PAYMENT_ATTEMPT_CONFLICT"
                            : "PAYMENT_ATTEMPT_RESERVATION_FAILED"
                return responseJson({ error: message, code }, conflict ? 409 : 500)
            }
            paymentAttempt = reservationRow.payment_attempt
            replayed = reservationRow.replayed === true
            mayCreateOrder = !replayed
            if (mayCreateOrder) {
                paymentAttempt = await markPaymentAttemptOrderCreating(supabase, paymentAttempt)
            }
        }
        notificationAttempt = paymentAttempt

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
                mayCreate: mayCreateOrder,
                credentials: retryPaymentCredentials,
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
        const status = error instanceof PaymentOrderInProgressError ? 409 : 400
        return responseJson({ error: error?.message || "Retry failed", ...(error?.code ? { code: error.code } : {}) }, status)
    }
})
