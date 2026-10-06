function normalizeEmail(value: unknown): string {
    return String(value || "").trim().toLowerCase()
}

export function parseRetryRequest(body: any): {
    bookingId: string
    email: string
    statusToken: string
} {
    const bookingId = String(body?.booking_id || "").trim()
    const email = normalizeEmail(body?.email)
    const statusToken = String(body?.status_token || "").trim()
    if (!statusToken) throw new Error("Missing status token")
    return { bookingId, email, statusToken }
}
