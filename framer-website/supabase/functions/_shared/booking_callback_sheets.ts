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

// Legacy success/failed tab overrides are deliberately ignored. All verified
// payment events belong in one event history, where Payment Result separates
// successful and failed attempts.
export function resolveBookingPaymentHistoryTab(_legacyConfiguredTab?: string): string {
    return BOOKING_PAYMENT_HISTORY_TAB
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
    const notes = [
        compact(params.notes),
        reconciliation && reconciliation.toLowerCase() !== "matched"
            ? `Reconciliation: ${humanize(reconciliation)}`
            : "",
    ].filter(Boolean).join(" | ")
    return [
        timestampToSheetSerial(params.eventReceivedAt || params.processedAt),
        compact(booking.booking_ref),
        compact(booking.trip_name || booking.trip_title),
        dateToSheetSerial(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        toNumber(params.amountReceived),
        toNumber(params.expectedAmount || booking.payable_now_amount || booking.amount),
        paymentResult(params.paymentResult || booking.payment_status),
        settlementStatus(params.settlementStatus || booking.settlement_status),
        notes,
    ]
}
