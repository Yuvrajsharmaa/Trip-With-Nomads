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
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BOOKING_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`
}

function providerOrderReference(booking: Record<string, any>, override?: any): string {
    return compact(
        override ||
            booking.payment_gateway_order_or_ref_id ||
            booking.provider_order_id ||
            booking.provider_order_reference ||
            booking.razorpay_order_id ||
            booking.payu_txnid
    )
}

function providerPaymentReference(booking: Record<string, any>, override?: any): string {
    return compact(
        override ||
            booking.payment_gateway_payment_id ||
            booking.payment_gateway_txn_id ||
            booking.provider_payment_id ||
            booking.provider_transaction_id ||
            booking.razorpay_payment_id ||
            booking.payu_mihpayid
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
        toNumber(params.paymentAttempt || booking.payment_attempt_number || booking.attempt_no),
        compact(params.paymentProvider || booking.payment_provider || booking.provider),
        compact(params.eventType),
        compact(params.paymentResult || booking.payment_status),
        compact(params.settlementStatus || booking.settlement_status),
        compact(booking.trip_name || booking.trip_title),
        compact(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        providerOrderReference(booking, params.providerOrderReference),
        providerPaymentReference(booking, params.providerPaymentReference),
        toNumber(params.amountReceived),
        toNumber(params.expectedAmount || booking.payable_now_amount || booking.amount),
        formatTimestampIST(processedAt),
        compact(params.reconciliationResult),
        compact(params.notes),
    ]
}
