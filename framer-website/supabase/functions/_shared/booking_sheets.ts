const BOOKING_TIMEZONE = "Asia/Kolkata"

export const BOOKING_HEADERS = [
    "Updated At (IST)",
    "Booking Ref",
    "Booking ID",
    "Trip ID",
    "Departure Date",
    "Guest Name",
    "Email",
    "Phone",
    "Travellers Count",
    "Travellers Summary",
    "Pricing Summary",
    "Coupon Code",
    "Payment Mode",
    "Subtotal",
    "Discount",
    "Tax",
    "Trip Total",
    "Payable Now",
    "Paid Amount",
    "Due Amount",
    "Payment Status",
    "Settlement Status",
    "PayU TxnID",
    "PayU MihPayID",
    "Balance Due Note",
    "Event Stage",
    "Notes",
]

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSharing(value: any): string {
    const raw = String(value || "").trim()
    if (!raw) return ""
    const lower = raw.toLowerCase()
    if (lower.includes("quad")) return "Quad"
    if (lower.includes("triple")) return "Triple"
    if (lower.includes("double")) return "Double"
    return raw
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
    return String(value || "").trim().toLowerCase() === "partial_25" ? "Partial payment (25%)" : "Pay in full"
}

function compact(value: any): string {
    return String(value || "").trim()
}

function formatTravellerSummary(travellers: any[]): string {
    if (!Array.isArray(travellers) || travellers.length === 0) return "—"
    const rows = travellers
        .map((traveller: any, index: number) => {
            const name = compact(traveller?.name) || `Traveller ${index + 1}`
            const sharing = normalizeSharing(traveller?.sharing)
            const vehicle = compact(traveller?.vehicle || traveller?.transport)
            const meta = [sharing, vehicle].filter(Boolean).join(" · ")
            return meta ? `${name} (${meta})` : name
        })
        .filter(Boolean)
    return rows.length ? rows.join(" | ") : "—"
}

function normalizeBreakdownLabel(value: any): string {
    const raw = compact(value)
    if (!raw) return ""
    return raw
        .replace(/\bGuest\b/gi, "")
        .replace(/[()]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
}

function formatPricingSummary(breakdown: any[]): string {
    if (!Array.isArray(breakdown) || breakdown.length === 0) return "—"
    const rows = breakdown
        .map((item: any) => {
            const count = Math.max(1, Math.round(toNumber(item?.count || 1)))
            const sharing = normalizeSharing(item?.variant || item?.sharing)
            const transport = compact(item?.transport || item?.vehicle)
            const fallbackLabel = normalizeBreakdownLabel(item?.label)
            const label = [sharing, transport].filter(Boolean).join(" · ")
            const summary = `${count}x ${label || fallbackLabel || "Traveller"}`
            const amount = toNumber(item?.price)
            return `${summary} = ${formatINR(amount)}`
        })
        .filter(Boolean)
    return rows.length ? rows.join(" | ") : "—"
}

export function buildBookingSheetRow(params: {
    booking: Record<string, any>
    eventStage: string
    notes?: string | null
    updatedAt?: string
}) {
    const booking = params.booking || {}
    const travellers = Array.isArray(booking.travellers) ? booking.travellers : []
    const pricingBreakdown = Array.isArray(booking.payment_breakdown) ? booking.payment_breakdown : []

    return [
        formatTimestampIST(params.updatedAt || new Date().toISOString()),
        compact(booking.booking_ref || booking.id),
        compact(booking.id),
        compact(booking.trip_id),
        compact(booking.departure_date),
        compact(booking.name),
        compact(booking.email),
        compact(booking.phone),
        String(Math.max(0, travellers.length)),
        formatTravellerSummary(travellers),
        formatPricingSummary(pricingBreakdown),
        compact(booking.coupon_code),
        normalizePaymentMode(booking.payment_mode),
        formatINR(booking.subtotal_amount),
        formatINR(booking.discount_amount),
        formatINR(booking.tax_amount),
        formatINR(booking.total_amount),
        formatINR(booking.payable_now_amount),
        formatINR(booking.paid_amount),
        formatINR(booking.due_amount),
        compact(booking.payment_status),
        compact(booking.settlement_status),
        compact(booking.payu_txnid),
        compact(booking.payu_mihpayid),
        compact(booking.balance_due_note),
        compact(params.eventStage),
        compact(params.notes),
    ]
}
