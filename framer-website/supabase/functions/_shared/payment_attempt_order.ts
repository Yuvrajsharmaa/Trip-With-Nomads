import {
    canReuseRazorpayOrderForRetry,
    createRazorpayOrder,
    fetchRazorpayOrderById,
    fetchRazorpayPaymentsForOrder,
    findRazorpayOrderByReceipt,
    type RazorpayCredentials,
    type RazorpayOrderParams,
} from "./razorpay.ts"
import { isStalePaymentAttempt } from "./payment_idempotency.ts"

export class PaymentOrderInProgressError extends Error {
    code = "PAYMENT_ORDER_IN_PROGRESS"
}

export async function markPaymentAttemptOrderCreating(
    supabase: any,
    attempt: Record<string, any>,
    now = new Date(),
): Promise<Record<string, any>> {
    const update = await supabase
        .from("payment_attempts")
        .update({
            status: "creating",
            expires_at: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
            updated_at: now.toISOString(),
        })
        .eq("id", attempt.id)
        .eq("status", "pending")
        .is("provider_order_id", null)
        .select("*")
        .maybeSingle()
    if (update.error) throw update.error
    if (!update.data) {
        throw new PaymentOrderInProgressError("Payment order is already being prepared. Try again shortly.")
    }
    return update.data
}

export async function isRazorpayOrderConfirmedUnpaid(params: {
    attempt: Record<string, any>
    bookingId: string
    amount: number
    currency: string
    credentials: RazorpayCredentials
    request?: typeof fetch
}): Promise<boolean> {
    const attemptId = String(params.attempt?.id || "")
    const orderId = String(params.attempt?.provider_order_id || "")
    const currency = String(params.currency || "INR").toUpperCase()
    if (
        !attemptId ||
        !orderId ||
        Number(params.attempt?.amount_minor) !== Math.round(params.amount * 100) ||
        String(params.attempt?.currency || "").toUpperCase() !== currency
    ) return false

    const order = await fetchRazorpayOrderById(orderId, params.credentials, params.request)
    if (!canReuseRazorpayOrderForRetry(order, {
        amount: params.amount,
        currency,
        receipt: "twn_" + attemptId.replace(/-/g, "").slice(0, 32),
        notes: { booking_id: params.bookingId, attempt_id: attemptId },
    })) return false
    if (String(order.status).toLowerCase() === "created") return true

    const payments = await fetchRazorpayPaymentsForOrder(orderId, params.credentials, params.request)
    return payments.length === Number(order.attempts) &&
        payments.length > 0 &&
        payments.every((payment) =>
            Boolean(payment?.id) &&
            payment.order_id === orderId &&
            String(payment.status || "").toLowerCase() === "failed"
        )
}

type EnsurePaymentAttemptOrderParams = RazorpayOrderParams & {
    supabase: any
    attempt: Record<string, any>
    mayCreate: boolean
    existingOrderId?: string | null
    credentials?: RazorpayCredentials
    request?: typeof fetch
}

export async function reactivatePayablePaymentAttempt(params: {
    supabase: any
    attempt: Record<string, any>
    bookingId: string
    amount: number
    currency: string
    credentials: RazorpayCredentials
    idempotencyKey?: string
    request?: typeof fetch
    now?: Date
}): Promise<Record<string, any> | null> {
    const attemptId = String(params.attempt?.id || "")
    const orderId = String(params.attempt?.provider_order_id || "")
    if (!attemptId || !orderId || !await isRazorpayOrderConfirmedUnpaid(params)) return null

    const now = params.now || new Date()
    const updatePayload: Record<string, unknown> = {
        status: "pending",
        failed_at: null,
        error_code: null,
        error_message: null,
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        updated_at: now.toISOString(),
    }
    if (params.idempotencyKey) updatePayload.idempotency_key = params.idempotencyKey

    let updateQuery = params.supabase
        .from("payment_attempts")
        .update(updatePayload)
        .eq("id", attemptId)
        .eq("provider_order_id", orderId)
        .in("status", ["creating", "pending", "failed", "expired"])
    if (params.idempotencyKey) {
        const previousKey = String(params.attempt?.idempotency_key || "")
        updateQuery = previousKey
            ? updateQuery.eq("idempotency_key", previousKey)
            : updateQuery.is("idempotency_key", null)
    }
    const update = await updateQuery
        .select("*")
        .maybeSingle()
    if (update.error) throw update.error
    if (update.data) return update.data

    const current = await params.supabase
        .from("payment_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle()
    if (current.error) throw current.error
    if (
        current.data?.provider_order_id === orderId &&
        String(current.data?.status || "").toLowerCase() === "pending" &&
        (!params.idempotencyKey || current.data?.idempotency_key === params.idempotencyKey)
    ) return current.data
    return null
}

export async function recoverPaymentAttemptForRetry(
    params: Parameters<typeof reactivatePayablePaymentAttempt>[0],
) {
    const attemptId = String(params.attempt?.id || "")
    const amountMinor = Number(params.attempt?.amount_minor)
    const currency = String(params.currency || "INR").toUpperCase()
    if (
        !attemptId ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor !== Math.round(params.amount * 100) ||
        String(params.attempt?.currency || "").toUpperCase() !== currency
    ) return null

    const resolved = await ensurePaymentAttemptOrder({
        supabase: params.supabase,
        attempt: params.attempt,
        mayCreate: false,
        amount: amountMinor / 100,
        currency,
        receipt: `twn_${attemptId.replace(/-/g, "").slice(0, 32)}`,
        notes: { booking_id: params.bookingId, attempt_id: attemptId },
        credentials: params.credentials,
        request: params.request,
    })
    return reactivatePayablePaymentAttempt({
        supabase: params.supabase,
        attempt: resolved.attempt,
        bookingId: params.bookingId,
        amount: params.amount,
        currency,
        credentials: params.credentials,
        idempotencyKey: params.idempotencyKey,
        request: params.request,
        now: params.now,
    })
}

async function persistOrder(
    supabase: any,
    attempt: Record<string, any>,
    orderId: string,
): Promise<Record<string, any>> {
    const update = await supabase
        .from("payment_attempts")
        .update({
            provider: "razorpay",
            provider_order_id: orderId,
            status: "pending",
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id)
        .in("status", ["creating", "pending"])
        .is("provider_order_id", null)
        .select("*")
        .maybeSingle()

    if (!update.error && update.data) return update.data

    const current = await supabase
        .from("payment_attempts")
        .select("*")
        .eq("id", attempt.id)
        .maybeSingle()
    if (current.data?.provider_order_id === orderId) return current.data
    throw new Error(
        "Razorpay order exists but could not be saved to its payment attempt; safe recovery is required",
    )
}

export async function ensurePaymentAttemptOrder(
    params: EnsurePaymentAttemptOrderParams,
): Promise<{ order: Record<string, any>; attempt: Record<string, any> }> {
    const orderId = String(
        params.attempt.provider_order_id || params.existingOrderId || "",
    ).trim()
    if (orderId) {
        return {
            order: {
                id: orderId,
                amount: Math.round(params.amount * 100),
                currency: params.currency,
            },
            attempt: params.attempt,
        }
    }

    const providerParams: RazorpayOrderParams = {
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
    }
    const credentials = params.credentials
    const request = params.request || fetch

    const attemptStatus = String(params.attempt.status || "").toLowerCase()
    const creationHasExpired = isStalePaymentAttempt({
        status: attemptStatus,
        expiresAt: params.attempt.expires_at,
        providerOrderId: params.attempt.provider_order_id,
        createdAt: params.attempt.created_at,
        updatedAt: params.attempt.updated_at,
    })
    const terminalWithoutOrder = ["failed", "expired"].includes(attemptStatus)
    if (!params.mayCreate) {
        const recovered = await findRazorpayOrderByReceipt(
            providerParams,
            credentials,
            request,
        )
        if (!recovered) {
            if (creationHasExpired || terminalWithoutOrder) {
                let claimQuery = params.supabase
                    .from("payment_attempts")
                    .update({
                        status: "creating",
                        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", params.attempt.id)
                    .eq("status", attemptStatus)
                    .is("provider_order_id", null)

                if (creationHasExpired) {
                    claimQuery = claimQuery.eq("expires_at", params.attempt.expires_at)
                }

                const claimed = await claimQuery
                    .select("*")
                    .maybeSingle()
                if (claimed.error) throw claimed.error
                if (!claimed.data) {
                    const current = await params.supabase
                        .from("payment_attempts")
                        .select("*")
                        .eq("id", params.attempt.id)
                        .maybeSingle()
                    if (current.error) throw current.error
                    if (current.data?.provider_order_id) {
                        return {
                            order: {
                                id: String(current.data.provider_order_id),
                                amount: Math.round(params.amount * 100),
                                currency: params.currency,
                            },
                            attempt: current.data,
                        }
                    }
                    throw new PaymentOrderInProgressError(
                        "Payment order is still being reconciled. Try again shortly.",
                    )
                }
            } else {
                throw new PaymentOrderInProgressError(
                    "Payment order is still being reconciled. Try again shortly.",
                )
            }
        } else {
            const savedAttempt = await persistOrder(
                params.supabase,
                params.attempt,
                String(recovered.id),
            )
            return { order: recovered, attempt: savedAttempt }
        }
    }

    // Razorpay receipt uniqueness makes overlapping requests for one active attempt idempotent.
    const created = await createRazorpayOrder(
        providerParams,
        credentials,
        request,
    )
    const savedAttempt = await persistOrder(
        params.supabase,
        params.attempt,
        String(created.id),
    )
    return { order: created, attempt: savedAttempt }
}
