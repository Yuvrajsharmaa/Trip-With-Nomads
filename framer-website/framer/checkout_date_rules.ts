const CHECKOUT_TIMEZONE = "Asia/Kolkata"

function formatDateKey(value: Date): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: CHECKOUT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value || ""
    const month = parts.find((part) => part.type === "month")?.value || ""
    const day = parts.find((part) => part.type === "day")?.value || ""
    return year && month && day ? `${year}-${month}-${day}` : ""
}

export function normalizeDateKey(value: any): string {
    const raw = String(value || "").trim()
    if (!raw) return ""
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    if (direct?.[1] && raw.length === 10) return direct[1]
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? "" : formatDateKey(parsed)
}

export function todayDateKey(now = new Date()): string {
    return formatDateKey(now)
}

export function isBookableDepartureDate(value: any, now = new Date()): boolean {
    const dateKey = normalizeDateKey(value)
    return Boolean(dateKey) && dateKey >= todayDateKey(now)
}
