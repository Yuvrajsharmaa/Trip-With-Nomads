export function buildPaymentStatusRedirectUrl(
    siteBase: string,
    statusPath: string,
    bookingId: string,
    suppliedToken: string,
): string {
    const baseOrigin = /^https?:\/\//i.test(siteBase) ? siteBase : `https://${siteBase}`
    const url = new URL(statusPath.startsWith("/") ? statusPath : `/${statusPath}`, `${baseOrigin}/`)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) {
        url.searchParams.set("booking_id", bookingId)
        if (suppliedToken) url.searchParams.set("status_token", suppliedToken)
    }
    return url.toString()
}
