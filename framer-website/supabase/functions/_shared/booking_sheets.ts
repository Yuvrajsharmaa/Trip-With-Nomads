const BOOKING_TIMEZONE = "Asia/Kolkata"

// Current-state contract for the managed Bookings tab. Keep these labels
// human-readable and gateway-neutral.
export const BOOKING_HEADERS = [
    "Last Updated (IST)",
    "Booking Ref",
    "Booking ID",
    "Trip Name",
    "Trip ID",
    "Departure Date",
    "Guest Name",
    "Email",
    "Phone",
    "Traveller Count",
    "Traveller Summary",
    "Coupon Code",
    "Payment Plan",
    "Subtotal",
    "Discount",
    "GST",
    "Trip Total",
    "Payable Now",
    "Paid Amount",
    "Balance Due",
    "Payment Status",
    "Settlement Status",
    "Payment Provider",
    "Payment Attempt",
    "Provider Order/Reference",
    "Provider Payment/Transaction ID",
    "Last Payment Event",
    "Last Payment Event At (IST)",
    "Notes",
]

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function compact(value: any): string {
    return String(value ?? "").trim()
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

function normalizeSharing(value: any): string {
    const raw = compact(value)
    if (!raw) return ""
    const lower = raw.toLowerCase()
    if (lower.includes("quad")) return "Quad"
    if (lower.includes("triple")) return "Triple"
    if (lower.includes("double")) return "Double"
    return raw
}

function formatTravellerSummary(travellers: any[]): string {
    if (!Array.isArray(travellers) || travellers.length === 0) return ""
    return travellers
        .map((traveller: any, index: number) => {
            const name = compact(traveller?.name) || `Traveller ${index + 1}`
            const sharing = normalizeSharing(traveller?.sharing)
            const vehicle = compact(traveller?.vehicle || traveller?.transport)
            const metadata = [sharing, vehicle].filter(Boolean).join(" · ")
            return metadata ? `${name} (${metadata})` : name
        })
        .filter(Boolean)
        .join(" | ")
}

function paymentPlan(value: any): string {
    return compact(value).toLowerCase() === "partial_25" ? "25% deposit" : "Full payment"
}

function providerOrderReference(booking: Record<string, any>): string {
    return compact(
        booking.provider_order_id ||
            booking.provider_order_reference ||
            booking.razorpay_order_id ||
            booking.payu_txnid
    )
}

function providerPaymentReference(booking: Record<string, any>): string {
    return compact(
        booking.provider_payment_id ||
            booking.provider_transaction_id ||
            booking.razorpay_payment_id ||
            booking.payu_mihpayid
    )
}

export function buildBookingSheetRow(params: {
    booking: Record<string, any>
    eventStage?: string
    notes?: string | null
    updatedAt?: string
}) {
    const booking = params.booking || {}
    const travellers = Array.isArray(booking.travellers) ? booking.travellers : []
    const notes = [
        compact(booking.balance_due_note),
        compact(params.notes),
    ].filter(Boolean).join(" | ")

    return [
        formatTimestampIST(params.updatedAt || booking.updated_at || new Date().toISOString()),
        compact(booking.booking_ref || booking.id),
        compact(booking.id),
        compact(booking.trip_name || booking.trip_title),
        compact(booking.trip_id),
        compact(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        compact(booking.phone),
        travellers.length,
        formatTravellerSummary(travellers),
        compact(booking.coupon_code),
        paymentPlan(booking.payment_mode),
        toNumber(booking.subtotal_amount),
        toNumber(booking.discount_amount),
        toNumber(booking.tax_amount || booking.gst_amount),
        toNumber(booking.total_amount),
        toNumber(booking.payable_now_amount || booking.amount),
        toNumber(booking.paid_amount),
        toNumber(booking.due_amount || booking.balance_due),
        compact(booking.payment_status || "pending"),
        compact(booking.settlement_status || "pending"),
        compact(booking.payment_provider || booking.provider),
        toNumber(booking.payment_attempt_number || booking.attempt_no),
        providerOrderReference(booking),
        providerPaymentReference(booking),
        compact(booking.last_payment_event || params.eventStage),
        booking.last_payment_event_at ? formatTimestampIST(booking.last_payment_event_at) : "",
        notes,
    ]
}
