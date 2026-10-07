const BOOKING_TIMEZONE = "Asia/Kolkata"

export const BOOKING_CALLBACK_HEADERS = [
    "Event ID",
    "Event Received At (IST)",
    "Booking ID",
    "Booking Ref",
    "Payment Attempt",
    "Payment Provider",
    "Event Type",
    "Payment Result",
    "Settlement Status",
    "Trip Name",
    "Departure Date",
    "Guest Name",
    "Email",
    "Provider Order/Reference",
    "Provider Payment/Transaction ID",
    "Amount Received",
    "Expected Amount",
    "Processed At (IST)",
    "Reconciliation Result",
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
    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${
        get("dayPeriod").toUpperCase()
    } IST`
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
    if (result === "paid" || result === "success" || result === "captured") {
        return "Paid"
    }
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

function paymentEvent(value: any): string {
    const event = compact(value).toLowerCase()
    const labels: Record<string, string> = {
        "payment.captured": "Payment captured",
        "payment.failed": "Payment failed",
        "payment.authorized": "Payment authorised",
    }
    return labels[event] || humanize(event)
}

function providerOrderReference(
    booking: Record<string, any>,
    override?: any,
): string {
    return compact(
        override ||
            booking.payment_gateway_order_or_ref_id ||
            booking.provider_order_id ||
            booking.provider_order_reference ||
            booking.razorpay_order_id ||
            booking.payu_txnid,
    )
}

function providerPaymentReference(
    booking: Record<string, any>,
    override?: any,
): string {
    return compact(
        override ||
            booking.payment_gateway_payment_id ||
            booking.payment_gateway_txn_id ||
            booking.provider_payment_id ||
            booking.provider_transaction_id ||
            booking.razorpay_payment_id ||
            booking.payu_mihpayid,
    )
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
    const processedAt = params.processedAt || new Date().toISOString()
    return [
        compact(params.eventId),
        formatTimestampIST(params.eventReceivedAt || processedAt),
        compact(booking.id),
        compact(booking.booking_ref),
        toNumber(
            params.paymentAttempt || booking.payment_attempt_number ||
                booking.attempt_no,
        ),
        humanize(
            params.paymentProvider || booking.payment_provider || booking.provider,
        ),
        paymentEvent(params.eventType),
        paymentResult(params.paymentResult || booking.payment_status),
        settlementStatus(params.settlementStatus || booking.settlement_status),
        compact(booking.trip_name || booking.trip_title),
        formatDeparture(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        providerOrderReference(booking, params.providerOrderReference),
        providerPaymentReference(booking, params.providerPaymentReference),
        toNumber(params.amountReceived),
        toNumber(
            params.expectedAmount || booking.payable_now_amount || booking.amount,
        ),
        formatTimestampIST(processedAt),
        humanize(params.reconciliationResult),
        compact(params.notes),
    ]
}
