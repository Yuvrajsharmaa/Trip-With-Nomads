import type { PaymentEmailBooking } from "./payment_email.ts"

export type InternalNotificationEventType =
  | "booking_created"
  | "booking_setup_failed"
  | "payment_retry_started"
  | "payment_retry_failed"
  | "payment_received"
  | "advance_received"
  | "payment_failed"
  | "reconciliation_alert"

export type InternalBookingEmailInput = {
  recipients: string[]
  eventType: InternalNotificationEventType
  eventKey: string
  booking: PaymentEmailBooking
  attempt?: Record<string, unknown> | null
  tripTitle?: string
  tripSlug?: string
  eventName?: string
  eventId?: string
  errorCode?: string
  errorMessage?: string
  statusUrl?: string
  retryUrl?: string
  occurredAt?: string
}

export type InternalBookingEmailContent = {
  to: string[]
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

type TravellerDetail = {
  name: string
  variant: string
  transport: string
}

type SelectionDetail = {
  count: number
  variant: string
  transport: string
  amount: number
}

const BRAND_BLUE = "#08b1ff"
const BRAND_NAVY = "#0b3550"
const EMAIL_LOGO_URL =
  "https://framerusercontent.com/images/FR1lBzx4w9xp2fecFXEMUGGul4.png?width=364&height=229"

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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function normalizeEmail(value: unknown): string {
  const email = text(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

function normalizeUrl(value: unknown): string {
  const raw = text(value)
  if (!raw) return ""
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    return raw
  } catch {
    return ""
  }
}

function normalizeVariant(value: unknown): string {
  const raw = text(value)
  const lower = raw.toLowerCase()
  if (lower.includes("quad")) return "Quad"
  if (lower.includes("triple")) return "Triple"
  if (lower.includes("double")) return "Double"
  return raw
}

function normalizeTransport(value: unknown): string {
  return text(value)
}

function formatAmount(value: unknown): string {
  return "₹" + number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value: unknown): string {
  const raw = text(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return raw
  const date = new Date(raw + "T00:00:00+05:30")
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

function normalizeRecipients(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  const recipients: string[] = []
  for (const value of values) {
    const email = normalizeEmail(value)
    if (!email || recipients.includes(email)) continue
    recipients.push(email)
  }
  return recipients
}

export function normalizeInternalNotificationRecipients(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/)
  return normalizeRecipients(values)
}

export function resolveInternalNotificationRecipients(): string[] {
  return normalizeInternalNotificationRecipients(
    Deno.env.get("BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS") || "",
  )
}

function buildTravellerDetails(booking: PaymentEmailBooking): TravellerDetail[] {
  const travellers = Array.isArray(booking.travellers) ? booking.travellers : []
  return travellers.map((traveller: any, index) => ({
    name: text(traveller?.name) || `Traveller ${index + 1}`,
    variant: normalizeVariant(
      traveller?.sharing || traveller?.variant || traveller?.variant_name,
    ),
    transport: normalizeTransport(traveller?.transport || traveller?.vehicle),
  }))
}

function buildSelectionDetails(booking: PaymentEmailBooking): SelectionDetail[] {
  const breakdown = Array.isArray(booking.payment_breakdown)
    ? booking.payment_breakdown
    : []
  const direct = breakdown.map((item: any) => {
    const count = Math.max(1, Math.round(number(item?.count || 1)))
    const variant = normalizeVariant(
      item?.variant || item?.sharing || item?.variant_name || item?.label,
    )
    const transport = normalizeTransport(item?.transport || item?.vehicle)
    const unitPrice = number(item?.unit_price)
    const amount = number(item?.price) || unitPrice * count
    return { count, variant, transport, amount }
  }).filter((item) => Boolean(item.variant || item.transport))
  if (direct.length > 0) return direct

  const grouped = new Map<string, SelectionDetail>()
  for (const traveller of buildTravellerDetails(booking)) {
    const key = `${traveller.variant}::${traveller.transport}`
    const current = grouped.get(key) || {
      count: 0,
      variant: traveller.variant,
      transport: traveller.transport,
      amount: 0,
    }
    current.count += 1
    grouped.set(key, current)
  }
  return [...grouped.values()]
}

function selectionLabel(selection: SelectionDetail): string {
  return `${selection.count} x ${selection.variant || "Traveller"}${selection.transport ? ` | ${selection.transport}` : ""}`
}

function eventLabel(eventType: InternalNotificationEventType): string {
  switch (eventType) {
    case "booking_created":
      return "Booking created"
    case "booking_setup_failed":
      return "Booking payment setup failed"
    case "payment_retry_started":
      return "Payment retry started"
    case "payment_retry_failed":
      return "Payment retry failed"
    case "payment_received":
      return "Payment received"
    case "advance_received":
      return "Advance payment received"
    case "payment_failed":
      return "Payment failed"
    case "reconciliation_alert":
      return "Payment reconciliation alert"
  }
}

function subjectPrefix(eventType: InternalNotificationEventType): string {
  return eventType === "booking_setup_failed" ||
      eventType === "payment_retry_failed" ||
      eventType === "reconciliation_alert"
    ? "[TWN alert]"
    : "[TWN]"
}

function paymentModeLabel(booking: PaymentEmailBooking): string {
  return text(booking.payment_mode).toLowerCase() === "partial_25"
    ? "25% advance payment"
    : "Pay in full"
}

function row(label: string, value: unknown): string {
  return `<tr><td style="padding:7px 0;color:#5e7d8d;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:7px 0;color:${BRAND_NAVY};font-size:13px;text-align:right;font-weight:600;vertical-align:top;">${escapeHtml(value || "Not available")}</td></tr>`
}

function section(title: string, content: string): string {
  return `<p style="margin:22px 0 8px;color:#157aa9;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(title)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${content}</table>`
}

export function buildInternalNotificationEventKey(params: {
  eventType: InternalNotificationEventType
  bookingId: string
  settlementStatus?: string
  paymentId?: string
  attemptId?: string
}): string {
  const bookingId = text(params.bookingId)
  const settlement = text(params.settlementStatus).toLowerCase()
  const paymentId = text(params.paymentId)
  if (params.eventType === "payment_received" || params.eventType === "advance_received") {
    return `payment:${bookingId}:paid:${settlement || "unknown"}:${paymentId || "unknown"}`
  }
  if (params.eventType === "payment_failed") {
    return `payment:${bookingId}:failed:failed:${paymentId || "unknown"}`
  }
  if (params.eventType === "reconciliation_alert") {
    return `reconciliation:${bookingId || "unknown"}:${paymentId || "unknown"}`
  }
  const prefix = params.eventType.replace(/_/g, "-")
  return `${prefix}:${bookingId}:${text(params.attemptId) || "unknown"}`
}

export function buildInternalBookingEmail(
  input: InternalBookingEmailInput,
): InternalBookingEmailContent | null {
  const recipients = normalizeRecipients(input.recipients)
  if (recipients.length === 0) return null

  const booking = input.booking || {}
  const bookingId = text(booking.id)
  const bookingRef = text(booking.booking_ref) || bookingId.slice(0, 8) || "Unknown"
  const tripTitle = text(input.tripTitle) || "Trip not available"
  const tripSlug = text(input.tripSlug)
  const label = eventLabel(input.eventType)
  const tripForSubject = tripTitle.replace(/\|/g, "-")
  const subject = `${subjectPrefix(input.eventType)} ${label}: ${tripForSubject} | ${bookingRef}`
  const travellers = buildTravellerDetails(booking)
  const selections = buildSelectionDetails(booking)
  const paxCount = travellers.length || selections.reduce((sum, item) => sum + item.count, 0)
  const eventTimestamp = text(input.occurredAt) || new Date().toISOString()
  const paymentId = text(booking.payment_gateway_payment_id) || text(booking.payment_gateway_txn_id)
  const orderId = text(booking.payment_gateway_order_or_ref_id)
  const errorDetails = [text(input.errorCode), text(input.errorMessage)].filter(Boolean).join(" — ")
  const statusUrl = normalizeUrl(input.statusUrl)
  const retryUrl = normalizeUrl(input.retryUrl)
  const travellerText = travellers.length > 0
    ? travellers.map((traveller) => `- ${traveller.name}${[traveller.variant, traveller.transport].filter(Boolean).length ? ` | ${[traveller.variant, traveller.transport].filter(Boolean).join(" | ")}` : ""}`)
    : ["- No traveller details recorded"]
  const selectionText = selections.length > 0
    ? selections.map((selection) => `- ${selectionLabel(selection)}${selection.amount > 0 ? `: ${formatAmount(selection.amount)}` : ""}`)
    : ["- No variant breakdown recorded"]
  const summaryRows = [
    row("Booking reference", bookingRef),
    row("Booking ID", bookingId),
    row("Trip", tripTitle),
    ...(tripSlug ? [row("Trip slug", tripSlug)] : []),
    row("Departure", formatDate(booking.departure_date) || "Not specified"),
    row("Pax", `${paxCount} pax`),
  ].join("")
  const guestRows = [
    row("Name", booking.name),
    row("Email", booking.email),
    row("Phone", booking.phone),
  ].join("")
  const paymentRows = [
    row("Payment mode", paymentModeLabel(booking)),
    row("Payment status", booking.payment_status),
    row("Settlement status", booking.settlement_status),
    row("Subtotal", formatAmount(booking.subtotal_amount)),
    row("Discount", formatAmount(booking.discount_amount)),
    row("Coupon", booking.coupon_code),
    row("Tax", formatAmount(booking.tax_amount)),
    row("Trip total", formatAmount(booking.total_amount)),
    row("Payable now", formatAmount(booking.payable_now_amount)),
    row("Paid amount", formatAmount(booking.paid_amount)),
    row("Balance due", formatAmount(booking.due_amount)),
    row("Provider", booking.payment_provider),
    row("Payment reference", paymentId),
    row("Order reference", orderId),
    row("Attempt number", booking.payment_attempt_number || input.attempt?.attempt_no),
  ].join("")
  const eventRows = [
    row("Event", input.eventName),
    row("Event ID", input.eventId),
    row("Occurred", eventTimestamp),
    row("Notification type", input.eventType),
    ...(errorDetails ? [row("Error", errorDetails)] : []),
  ].join("")
  const actionLinks = [
    ...(statusUrl ? [`Status: ${statusUrl}`] : []),
    ...(retryUrl ? [`Try payment again: ${retryUrl}`] : []),
  ]
  const actionHtml = actionLinks.length > 0
    ? `<p style="margin:20px 0 0;color:#355d73;font-size:13px;line-height:1.6;">${actionLinks.map((link) => {
      const separator = link.indexOf(": ")
      const label = separator >= 0 ? link.slice(0, separator) : "Open link"
      const url = separator >= 0 ? link.slice(separator + 2) : link
      return `<a href="${escapeHtml(url)}" style="color:${BRAND_NAVY};text-decoration:underline;">${escapeHtml(label)}</a>`
    }).join("<br>")}</p>`
    : ""
  const textBody = [
    "Trip With Nomads — Internal notification",
    label,
    "",
    ...[
      `Booking reference: ${bookingRef}`,
      `Booking ID: ${bookingId}`,
      `Trip: ${tripTitle}`,
      ...(tripSlug ? [`Trip slug: ${tripSlug}`] : []),
      `Departure: ${formatDate(booking.departure_date) || "Not specified"}`,
      `Pax: ${paxCount} pax`,
      "",
      "Guest:",
      `Name: ${text(booking.name) || "Not available"}`,
      `Email: ${text(booking.email) || "Not available"}`,
      `Phone: ${text(booking.phone) || "Not available"}`,
      "",
      "Travellers:",
      ...travellerText,
      "",
      "Selections:",
      ...selectionText,
      "",
      "Payment:",
      `Payment mode: ${paymentModeLabel(booking)}`,
      `Payment status: ${text(booking.payment_status) || "Not available"}`,
      `Settlement status: ${text(booking.settlement_status) || "Not available"}`,
      `Subtotal: ${formatAmount(booking.subtotal_amount)}`,
      `Discount: ${formatAmount(booking.discount_amount)}`,
      `Coupon: ${text(booking.coupon_code) || "None"}`,
      `Tax: ${formatAmount(booking.tax_amount)}`,
      `Trip total: ${formatAmount(booking.total_amount)}`,
      `Payable now: ${formatAmount(booking.payable_now_amount)}`,
      `Paid amount: ${formatAmount(booking.paid_amount)}`,
      `Balance due: ${formatAmount(booking.due_amount)}`,
      `Provider: ${text(booking.payment_provider) || "Not available"}`,
      `Payment reference: ${paymentId || "Not available"}`,
      `Order reference: ${orderId || "Not available"}`,
      `Attempt number: ${text(booking.payment_attempt_number || input.attempt?.attempt_no) || "Not available"}`,
      "",
      "Event:",
      `Event: ${text(input.eventName) || "Not available"}`,
      `Event ID: ${text(input.eventId) || "Not available"}`,
      `Occurred: ${eventTimestamp}`,
      `Notification type: ${input.eventType}`,
      ...(errorDetails ? [`Error: ${errorDetails}`] : []),
      ...(actionLinks.length > 0 ? ["", ...actionLinks] : []),
    ],
  ].join("\n")
  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="UTF-8"></head>',
    `<body style="margin:0;background:#f4fbff;color:${BRAND_NAVY};font-family:Arial,Helvetica,sans-serif;line-height:1.5;">`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #cbeafa;border-radius:14px;overflow:hidden;">`,
    `<tr><td style="padding:18px 22px;border-bottom:1px solid #e5f3fa;"><img src="${EMAIL_LOGO_URL}" alt="Trip With Nomads" width="96" style="display:block;width:96px;height:60px;object-fit:contain;object-position:left center;border:0;"><p style="margin:10px 0 0;color:#157aa9;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Internal operations</p></td></tr>`,
    `<tr><td style="padding:24px 22px 28px;"><p style="margin:0 0 6px;color:${BRAND_BLUE};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</p><h1 style="margin:0;color:${BRAND_NAVY};font-size:24px;line-height:1.25;">${escapeHtml(tripTitle)}</h1>${section("Booking", summaryRows)}${section("Guest", guestRows)}<p style="margin:22px 0 8px;color:#157aa9;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Travellers</p><div style="color:#355d73;font-size:13px;line-height:1.7;">${travellerText.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div><p style="margin:22px 0 8px;color:#157aa9;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Selections</p><div style="color:#355d73;font-size:13px;line-height:1.7;">${selectionText.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>${section("Payment", paymentRows)}${section("Event", eventRows)}${actionHtml}<p style="margin:24px 0 0;color:#7893a0;font-size:11px;line-height:1.6;">This is an internal Trip With Nomads operational notification. Do not forward it outside the team.</p></td></tr>`,
    "</table></td></tr></table>",
    "</body></html>",
  ].join("\n")

  return {
    to: recipients,
    subject,
    html,
    text: textBody,
    idempotencyKey: `internal-${input.eventKey}`,
  }
}
