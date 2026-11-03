export type PaymentResult = "success" | "failure"
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | string

export function transitionPaymentStatus(
    currentStatus: PaymentStatus,
    result: PaymentResult,
): "paid" | "failed" {
    const current = String(currentStatus || "").trim().toLowerCase()
    if (current === "paid") return "paid"
    return result === "success" ? "paid" : "failed"
}

export function calculateSettlementStatus(
    paymentMode: unknown,
    totalMinor: number,
    paidMinor: number,
): "pending" | "partially_paid" | "fully_paid" {
    const total = Math.max(0, Math.round(Number(totalMinor) || 0))
    const paid = Math.max(0, Math.round(Number(paidMinor) || 0))
    if (paid <= 0) return "pending"
    if (total > 0 && paid >= total) return "fully_paid"
    if (String(paymentMode || "").trim().toLowerCase() === "partial_25") return "partially_paid"
    return "partially_paid"
}

export function bookingStatusesAfterSuccessfulPayment(params: {
    websiteStatus: unknown
    crmStatus: unknown
    paidAmountMinor: number
    dueAmountMinor: number
    payableNowAmountMinor: number
    totalAmountMinor: number
}): { websiteStatus: string; crmStatus: string } {
    const websiteStatus = String(params.websiteStatus || "pending_payment").trim().toLowerCase()
    const crmStatus = String(params.crmStatus || "payment_pending").trim().toLowerCase()
    if (websiteStatus === "cancelled" || websiteStatus === "completed" || crmStatus === "cancelled") {
        return { websiteStatus, crmStatus }
    }

    const paid = Math.max(0, Math.round(Number(params.paidAmountMinor) || 0))
    const due = Math.max(0, Math.round(Number(params.dueAmountMinor) || 0))
    const total = Math.max(0, Math.round(Number(params.totalAmountMinor) || 0))
    const advance = Math.max(0, Math.round(Number(params.payableNowAmountMinor) || 0)) || total
    if (paid > 0 && due === 0) return { websiteStatus: "confirmed", crmStatus: "fully_paid" }
    if (advance > 0 && paid >= advance) {
        return {
            websiteStatus: "confirmed",
            crmStatus: crmStatus === "fully_paid" ? "fully_paid" : "confirmed",
        }
    }

    return { websiteStatus, crmStatus }
}

export function isAmountMatch(
    actualMinor: number,
    expectedMinor: number,
    toleranceMinor = 1,
): boolean {
    const actual = Math.max(0, Math.round(Number(actualMinor) || 0))
    const expected = Math.max(0, Math.round(Number(expectedMinor) || 0))
    const tolerance = Math.max(0, Math.round(Number(toleranceMinor) || 0))
    return Math.abs(actual - expected) <= tolerance
}

export function isPaidStatus(value: unknown): boolean {
    return ["paid", "succeeded"].includes(String(value || "").trim().toLowerCase())
}

export function paymentAttemptMatchesBookingOrder(params: {
    bookingId: unknown
    attemptBookingId: unknown
    bookingOrderId?: unknown
    attemptOrderId?: unknown
    eventOrderId: unknown
}): boolean {
    const eventOrderId = String(params.eventOrderId || "").trim()
    const attemptOrderId = String(params.attemptOrderId || "").trim()
    if (
        !eventOrderId ||
        String(params.bookingId || "") !== String(params.attemptBookingId || "")
    ) return false

    return attemptOrderId
        ? attemptOrderId === eventOrderId
        : String(params.bookingOrderId || "").trim() === eventOrderId
}

export function isSupersededPaymentFailure(params: {
    eventName: unknown
    paymentId: unknown
    attempt: Record<string, unknown>
}): boolean {
    const paymentId = String(params.paymentId || "").trim()
    if (String(params.eventName || "").trim().toLowerCase() !== "payment.failed" || !paymentId) return false
    return (Array.isArray(params.attempt.superseded_payment_ids) &&
        params.attempt.superseded_payment_ids.includes(paymentId)) ||
        (String(params.attempt.status || "").toLowerCase() === "pending" &&
            String(params.attempt.provider_payment_id || "").trim() === paymentId)
}
