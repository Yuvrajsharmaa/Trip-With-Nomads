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
    return String(value || "").trim().toLowerCase() === "paid"
}
