const BOOKING_TIMEZONE = "Asia/Kolkata"

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

function compact(value: any): string {
    return String(value ?? "").trim()
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function formatTimestampIST(value?: string): string {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) return compact(value)
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: BOOKING_TIMEZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} IST`
}

function formatDeparture(value: any): string {
    const raw = compact(value)
    if (!raw) return ""
    const date = new Date(`${raw}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return raw
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: BOOKING_TIMEZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date)
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
        formatTimestampIST(params.eventReceivedAt || params.processedAt),
        compact(booking.booking_ref),
        compact(booking.trip_name || booking.trip_title),
        formatDeparture(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        toNumber(params.amountReceived),
        toNumber(params.expectedAmount || booking.payable_now_amount || booking.amount),
        paymentResult(params.paymentResult || booking.payment_status),
        settlementStatus(params.settlementStatus || booking.settlement_status),
        notes,
    ]
}
