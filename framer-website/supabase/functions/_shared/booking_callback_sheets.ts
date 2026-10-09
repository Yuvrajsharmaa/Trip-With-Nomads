import { dateToSheetSerial, timestampToSheetSerial } from "./sheet_dates.ts"

export const BOOKING_CALLBACK_HEADERS = [
    "Payment Date",
    "Booking Ref",
    "Trip",
    "Departure Date",
    "Guest Name",
    "Email",
    "Amount Received",
    "Expected Amount",
    "Payment Result",
    "Settlement Status",
    "Notes",
]

export const BOOKING_PAYMENT_HISTORY_TAB = "Payment History"
export const BOOKING_SUCCESS_HISTORY_TAB = "Bookings_Success"
export const BOOKING_FAILED_HISTORY_TAB = "Bookings_Failed"

// Prefer one existing combined history tab for clarity. Older workbooks may
// still have separate success/failure tabs; choose those only when the combined
// tab is absent. The caller supplies live tab metadata so this never invents a
// destination or relies on stale environment configuration.
export function resolveBookingPaymentHistoryTab(
    paymentResult: unknown,
    availableTabs: string[],
    configuredHistoryTab?: string | null,
    successTab = BOOKING_SUCCESS_HISTORY_TAB,
    failedTab = BOOKING_FAILED_HISTORY_TAB,
    mappedHistoryTab?: string | null,
): string {
    const result = compact(paymentResult).toLowerCase()
    const existing = new Map(
        availableTabs.map((tab) => [compact(tab).toLowerCase(), compact(tab)]),
    )
    const mapped = compact(mappedHistoryTab).toLowerCase()
    if (mapped && existing.has(mapped)) return existing.get(mapped)!
    if (existing.has(BOOKING_PAYMENT_HISTORY_TAB.toLowerCase())) {
        return existing.get(BOOKING_PAYMENT_HISTORY_TAB.toLowerCase())!
    }
    const configured = compact(configuredHistoryTab).toLowerCase()
    const outcomeTabs = new Set([
        compact(successTab).toLowerCase(),
        compact(failedTab).toLowerCase(),
    ])
    if (configured && existing.has(configured) && !outcomeTabs.has(configured)) {
        return existing.get(configured)!
    }
    const outcomeTab = ["failed", "failure"].includes(result) ? failedTab :
        ["paid", "success", "captured"].includes(result) ? successTab : ""
    const matchedOutcomeTab = existing.get(compact(outcomeTab).toLowerCase())
    if (matchedOutcomeTab) return matchedOutcomeTab
    throw new Error(
        `No existing managed payment history tab for result=${result || "empty"}`,
    )
}

function compact(value: any): string {
    return String(value ?? "").trim()
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function humanize(value: any): string {
    return compact(value)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase())
}

function paymentResult(value: any): string {
    const result = compact(value).toLowerCase()
    if (result === "paid" || result === "success" || result === "captured") return "Paid"
    if (result === "failed" || result === "failure") return "Failed"
    return humanize(result)
}

function settlementStatus(value: any): string {
    const status = compact(value).toLowerCase()
    if (status === "fully_paid") return "Fully paid"
    if (status === "partially_paid") return "Partially paid"
    if (status === "pending") return "Pending"
    return humanize(status)
}

function eventLabel(value: unknown, result: string): string {
    const type = compact(value).toLowerCase()
    if (type === "payment.failed") return "Payment failed"
    if (type === "payment.captured") return "Payment captured"
    if (type === "order.paid") return "Order marked paid"
    if (result === "Paid") return "Payment received"
    if (result === "Failed") return "Payment failed"
    return humanize(type)
}

export function buildBookingCallbackRow(params: {
    booking: Record<string, any>
    eventId?: string
    eventReceivedAt?: string
    processedAt?: string
    eventType?: string
    paymentResult?: string
    settlementStatus?: string
    paymentProvider?: string
    paymentAttempt?: number | string
    providerOrderReference?: string
    providerPaymentReference?: string
    amountReceived?: number
    expectedAmount?: number
    reconciliationResult?: string
    notes?: string
}) {
    const booking = params.booking || {}
    const reconciliation = compact(params.reconciliationResult)
    const result = paymentResult(params.paymentResult || booking.payment_status)
    const attempt = Number(params.paymentAttempt)
    const notes = [
        eventLabel(params.eventType, result),
        Number.isInteger(attempt) && attempt > 0 ? `Attempt ${attempt}` : "",
        reconciliation && reconciliation.toLowerCase() !== "matched"
            ? `Review: ${humanize(reconciliation)}`
            : "",
    ].filter(Boolean).join(" · ")
    return [
        timestampToSheetSerial(params.eventReceivedAt || params.processedAt),
        compact(booking.booking_ref),
        compact(booking.trip_name || booking.trip_title),
        dateToSheetSerial(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        toNumber(params.amountReceived),
        toNumber(params.expectedAmount || booking.payable_now_amount || booking.amount),
        result,
        settlementStatus(params.settlementStatus || booking.settlement_status),
        notes,
    ]
}
