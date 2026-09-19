export type PaymentEmailBooking = {
    id?: unknown
    booking_ref?: unknown
    name?: unknown
    email?: unknown
    departure_date?: unknown
    total_amount?: unknown
    paid_amount?: unknown
    due_amount?: unknown
    payment_status?: unknown
    settlement_status?: unknown
    payment_mode?: unknown
    payment_gateway_txn_id?: unknown
}

export type PaymentEmailContent = {
    to: string
    subject: string
    html: string
    text: string
    idempotencyKey: string
}

function text(value: unknown): string {
    return String(value || "").trim()
}

function number(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function escapeHtml(value: unknown): string {
    return text(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function normalizeEmail(value: unknown): string {
    const email = text(value).toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

function formatAmount(value: unknown): string {
    return `₹${number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function formatDate(value: unknown): string {
    const raw = text(value)
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!match) return raw

    const date = new Date(`${raw}T00:00:00+05:30`)
    if (Number.isNaN(date.getTime())) return raw

    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date)
}

function normalizedStatus(value: unknown): string {
    return text(value).toLowerCase()
}

function normalizedSettlement(value: unknown): string {
    return text(value).toLowerCase()
}

function paymentStateChanged(
    previous: PaymentEmailBooking,
    next: PaymentEmailBooking,
): boolean {
    const previousStatus = normalizedStatus(previous.payment_status)
    const nextStatus = normalizedStatus(next.payment_status)
    const previousSettlement = normalizedSettlement(previous.settlement_status)
    const nextSettlement = normalizedSettlement(next.settlement_status)
    const previousTransaction = text(previous.payment_gateway_txn_id)
    const nextTransaction = text(next.payment_gateway_txn_id)

    return previousStatus !== nextStatus ||
        previousSettlement !== nextSettlement ||
        (nextStatus === "paid" && previousTransaction !== nextTransaction)
}

function statusLabel(booking: PaymentEmailBooking): string {
    const status = normalizedStatus(booking.payment_status)
    const settlement = normalizedSettlement(booking.settlement_status)
    if (status === "paid" && settlement === "partially_paid") return "Partially paid"
    if (status === "paid") return "Payment received"
    if (status === "failed") return "Payment failed"
    return "Payment update"
}

function paymentModeLabel(booking: PaymentEmailBooking): string {
    return normalizedStatus(booking.payment_mode) === "partial_25"
        ? "25% advance payment"
        : "Full payment"
}

export function buildPaymentEmail(
    previous: PaymentEmailBooking,
    next: PaymentEmailBooking,
    tripTitle: string,
    websiteUrl = "https://tripwithnomads.com",
): PaymentEmailContent | null {
    const to = normalizeEmail(next.email)
    const bookingId = text(next.id)
    const bookingRef = text(next.booking_ref) || bookingId.slice(0, 8)
    const paymentStatus = normalizedStatus(next.payment_status)

    if (!to || !bookingId || !paymentStateChanged(previous, next)) return null
    if (paymentStatus !== "paid" && paymentStatus !== "failed") return null

    const recipientName = text(next.name) || "there"
    const trip = text(tripTitle) || "your Trip With Nomads trip"
    const departureDate = formatDate(next.departure_date) || "Not specified"
    const label = statusLabel(next)
    const totalAmount = formatAmount(next.total_amount)
    const paidAmount = formatAmount(next.paid_amount)
    const dueAmount = formatAmount(next.due_amount)
    const paymentMode = paymentModeLabel(next)
    const isPaid = paymentStatus === "paid"
    const transactionId = text(next.payment_gateway_txn_id) || "unknown"
    const settlement = normalizedSettlement(next.settlement_status) || "unknown"
    const subject = isPaid
        ? `Payment received for booking ${bookingRef}`
        : `Payment update for booking ${bookingRef}`

    const intro = isPaid
        ? `We have received your payment for ${trip}.`
        : `We could not complete the payment for ${trip}.`
    const nextStep = isPaid
        ? number(next.due_amount) > 0
            ? `Balance due before departure: ${dueAmount}.`
            : "Your booking payment is complete."
        : "Please return to the booking page and try the payment again, or contact us if you need help."
    const normalizedWebsiteUrl = /^https?:\/\//i.test(text(websiteUrl))
        ? text(websiteUrl).replace(/\/$/, "")
        : "https://tripwithnomads.com"

    const textBody = [
        `Hi ${recipientName},`,
        "",
        intro,
        "",
        `Booking: ${bookingRef}`,
        `Trip: ${trip}`,
        `Departure: ${departureDate}`,
        `Payment type: ${paymentMode}`,
        `Payment status: ${label}`,
        `Total amount: ${totalAmount}`,
        `Paid amount: ${paidAmount}`,
        ...(number(next.due_amount) > 0 ? [`Balance due: ${dueAmount}`] : []),
        "",
        nextStep,
        `Visit us: ${normalizedWebsiteUrl}`,
        "",
        "Trip With Nomads",
    ].join("\n")

    const htmlBody = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f6;color:#17332b;font-family:Arial,sans-serif;line-height:1.5;">
    <div style="max-width:600px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #dce7e2;border-radius:16px;padding:28px;">
        <p style="margin:0 0 20px;color:#00a873;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Trip With Nomads</p>
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;">${escapeHtml(label)}</h1>
        <p style="margin:0 0 24px;">Hi ${escapeHtml(recipientName)},<br>${escapeHtml(intro)}</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr><td style="padding:8px 0;color:#6b7d76;">Booking</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(bookingRef)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7d76;">Trip</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(trip)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7d76;">Departure</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(departureDate)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7d76;">Payment type</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(paymentMode)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7d76;">Total amount</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(totalAmount)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7d76;">Paid amount</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(paidAmount)}</td></tr>
          ${number(next.due_amount) > 0 ? `<tr><td style="padding:8px 0;color:#6b7d76;">Balance due</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(dueAmount)}</td></tr>` : ""}
        </table>
        <p style="margin:0 0 22px;">${escapeHtml(nextStep)}</p>
        <p style="margin:0;"><a href="${escapeHtml(normalizedWebsiteUrl)}" style="display:inline-block;background:#00bb7f;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700;">Visit Trip With Nomads</a></p>
      </div>
      <p style="margin:18px 4px 0;color:#6b7d76;font-size:12px;">Questions? Reply to this email or contact support@tripwithnomads.com.</p>
    </div>
  </body>
</html>`

    return {
        to,
        subject,
        html: htmlBody,
        text: textBody,
        idempotencyKey: `payment-${paymentStatus}-${settlement}-${bookingId}-${transactionId}`.slice(0, 256),
    }
}
