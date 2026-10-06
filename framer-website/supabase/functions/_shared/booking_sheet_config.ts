export type BookingSheetEnvironment = {
    BOOKING_CALLBACK_SHEET_ID?: unknown
    GOOGLE_SHEET_ID?: unknown
    GOOGLE_SHEET_ID_TRIPS?: unknown
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const candidate = String(value || "").trim()
        if (candidate) return candidate
    }
    return ""
}

export function resolveBookingSheetId(env: BookingSheetEnvironment): string {
    return firstNonEmpty(
        env.BOOKING_CALLBACK_SHEET_ID,
        env.GOOGLE_SHEET_ID,
    )
}
