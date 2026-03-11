const BOOKING_TIMEZONE = "Asia/Kolkata"

export const BOOKING_CALLBACK_HEADERS = [
    "Booking ID",
    "Booking Ref",
    "Payment Status",
    "Settlement Status",
    "Payment Mode",
    "Trip Title",
    "Trip Slug",
    "Departure Date",
    "Created At",
    "Guest Name",
    "Email",
    "Phone",
    "Trip Total",
    "Payable Now",
    "Paid Amount",
    "Due Amount",
    "PayU TxnID",
    "PayU MihPayID",
    "Updated At (IST)",
    "Notes",
]

function compact(value: any): string {
    return String(value || "").trim()
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatTimestampIST(value?: string): string {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) return String(value || "")
    const text = new Intl.DateTimeFormat("en-IN", {
        timeZone: BOOKING_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    }).format(date)
    return `${text} IST`
}

function formatINR(value: any): string {
    const amount = Math.max(0, Math.round(toNumber(value) * 100) / 100)
    return `₹${amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function normalizePaymentMode(value: any): string {
    return String(value || "").trim().toLowerCase() === "partial_25"
        ? "Partial payment (25%)"
        : "Pay in full"
}

export function buildBookingCallbackRow(params: {
    booking: Record<string, any>
    tripTitle?: string
    tripSlug?: string
    notes?: string
    updatedAt?: string
}) {
    const booking = params.booking || {}
    const updatedAt = params.updatedAt || new Date().toISOString()
    return [
        compact(booking.id),
        compact(booking.booking_ref),
        compact(booking.payment_status),
        compact(booking.settlement_status),
        normalizePaymentMode(booking.payment_mode),
        compact(params.tripTitle),
        compact(params.tripSlug),
        compact(booking.departure_date),
        formatTimestampIST(booking.created_at || updatedAt),
        compact(booking.name),
        compact(booking.email),
        compact(booking.phone),
        formatINR(booking.total_amount),
        formatINR(booking.payable_now_amount),
        formatINR(booking.paid_amount),
        formatINR(booking.due_amount),
        compact(booking.payu_txnid),
        compact(booking.payu_mihpayid),
        formatTimestampIST(updatedAt),
        compact(params.notes),
    ]
}
