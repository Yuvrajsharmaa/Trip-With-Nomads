const BOOKING_TIMEZONE = "Asia/Kolkata"

export const BOOKING_HEADERS = [
    "Last Updated",
    "Booking Ref",
    "Trip",
    "Departure Date",
    "Guest Name",
    "Email",
    "Phone",
    "Travellers",
    "Payment Plan",
    "Trip Total",
    "Paid",
    "Balance Due",
    "Payment Status",
    "Settlement Status",
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
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!match) return raw
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

function formatPhone(countryCode: unknown, phone: unknown): string {
    const rawPhone = compact(phone)
    if (!rawPhone) return ""
    if (rawPhone.startsWith("+")) return rawPhone
    const country = compact(countryCode)
    if (!country) return rawPhone
    const prefix = country.startsWith("+") ? country : `+${country.replace(/\D/g, "")}`
    return prefix === "+" ? rawPhone : `${prefix} ${rawPhone}`
}

function humanizePaymentStatus(value: any): string {
    const status = compact(value).toLowerCase()
    const labels: Record<string, string> = {
        pending: "Pending",
        paid: "Paid",
        failed: "Failed",
        expired: "Expired",
        cancelled: "Cancelled",
    }
    return labels[status] || humanize(status)
}

function humanizeSettlementStatus(value: any): string {
    const status = compact(value).toLowerCase()
    const labels: Record<string, string> = {
        pending: "Pending",
        partially_paid: "Partially paid",
        fully_paid: "Fully paid",
        failed: "Failed",
    }
    return labels[status] || humanize(status)
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

function formatTravellerSummary(travellers: any[], fallbackCount?: any): string {
    if (!Array.isArray(travellers) || travellers.length === 0) {
        const count = Number(fallbackCount)
        return Number.isFinite(count) && count > 0 ? `${count} traveller${count === 1 ? "" : "s"}` : ""
    }
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
        compact(booking.booking_ref),
        compact(booking.trip_name || booking.trip_title),
        formatDeparture(booking.departure_date || booking.date),
        compact(booking.name || booking.guest_name),
        compact(booking.email).toLowerCase(),
        formatPhone(booking.country_code, booking.phone),
        formatTravellerSummary(travellers, booking.traveller_count || booking.travellers_count),
        paymentPlan(booking.payment_mode),
        toNumber(booking.total_amount),
        toNumber(booking.paid_amount),
        toNumber(booking.due_amount || booking.balance_due),
        humanizePaymentStatus(booking.payment_status || "pending"),
        humanizeSettlementStatus(booking.settlement_status || "pending"),
        notes,
    ]
}
