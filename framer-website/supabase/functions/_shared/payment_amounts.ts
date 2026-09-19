export type PaymentMode = "full" | "partial_25"

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

export function normalizePaymentMode(value: unknown): PaymentMode {
    return String(value || "").trim().toLowerCase() === "partial_25"
        ? "partial_25"
        : "full"
}

export function calculatePaymentAmounts(params: {
    paymentMode: unknown
    totalAmount: number
    storedPayableNowAmount?: number
}) {
    const paymentMode = normalizePaymentMode(params.paymentMode)
    const totalAmount = round2(Math.max(0, toNumber(params.totalAmount)))
    const storedPayable = round2(Math.max(0, toNumber(params.storedPayableNowAmount)))
    const payableNowAmount = paymentMode === "partial_25"
        ? storedPayable > 0 ? Math.min(storedPayable, totalAmount) : round2(totalAmount * 0.25)
        : totalAmount
    const dueAmount = round2(Math.max(0, totalAmount - payableNowAmount))

    return { paymentMode, payableNowAmount, dueAmount }
}
