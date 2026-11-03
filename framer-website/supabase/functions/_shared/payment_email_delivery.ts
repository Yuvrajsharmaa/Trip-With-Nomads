import { isPaidStatus } from "./payment_reconciliation.ts"

export type StoredPaymentEmailPayload = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
  settlementStatus?: string
  headers?: Record<string, string>
}

export type EmailProjectionStatus = "not_required" | "pending" | "sent" | "failed"

export type EmailDeliveryResult = {
  sent: boolean
  skipped?: boolean
  reason?: string
  providerId?: string
  data?: Record<string, unknown>
}

export function parseStoredPaymentEmailPayload(value: unknown): StoredPaymentEmailPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const to = String(candidate.to || "").trim()
  const subject = String(candidate.subject || "").trim()
  const html = String(candidate.html || "")
  const text = String(candidate.text || "")
  const idempotencyKey = String(candidate.idempotencyKey || "").trim()
  const settlementStatus = String(candidate.settlementStatus || "").trim().toLowerCase()
  if (!to || !subject || !html || !text || !idempotencyKey) return null
  const rawHeaders = candidate.headers
  const headers = rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
    ? Object.entries(rawHeaders as Record<string, unknown>).reduce((result, [key, item]) => {
        const next = String(item || "")
        if (next) result[key] = next
        return result
      }, {} as Record<string, string>)
    : undefined
  return {
    to,
    subject,
    html,
    text,
    idempotencyKey,
    ...(settlementStatus ? { settlementStatus } : {}),
    headers,
  }
}

export function serializePaymentEmailPayload(payload: StoredPaymentEmailPayload): Record<string, unknown> {
  return {
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    idempotencyKey: payload.idempotencyKey,
    ...(payload.settlementStatus ? { settlementStatus: payload.settlementStatus } : {}),
    headers: payload.headers || undefined,
  }
}

export function emailProjectionNeedsRetry(row: Record<string, unknown> | null | undefined): boolean {
  const status = String(row?.email_sync_status || "").trim().toLowerCase()
  return status === "pending" || status === "failed"
}

export function shouldSuppressFailurePaymentEmail(
  eventName: unknown,
  paymentStatus: unknown,
): boolean {
  return String(eventName || "").trim().toLowerCase() === "payment.failed" &&
    isPaidStatus(paymentStatus)
}

export async function shouldSuppressFailurePaymentEmailForCurrentBooking(params: {
  supabase: any
  eventName: unknown
  booking: Record<string, unknown>
}): Promise<boolean> {
  if (String(params.eventName || "").trim().toLowerCase() !== "payment.failed") return false

  const current = await params.supabase
    .from("bookings")
    .select("payment_status")
    .eq("id", params.booking.id)
    .maybeSingle()
  if (current.error) throw current.error
  if (!current.data?.payment_status) throw new Error("Current booking payment status could not be verified")

  return shouldSuppressFailurePaymentEmail(params.eventName, current.data.payment_status)
}

export async function shouldSuppressStalePartialPaymentEmailForCurrentBooking(params: {
  supabase: any
  booking: Record<string, unknown>
  payload: StoredPaymentEmailPayload
}): Promise<boolean> {
  const storedSettlement = String(params.payload.settlementStatus || "").trim().toLowerCase()
  const isPartialEmail = storedSettlement === "partially_paid" ||
    (!storedSettlement && /^Advance received:/i.test(params.payload.subject))
  if (!isPartialEmail) return false

  const current = await params.supabase
    .from("bookings")
    .select("payment_status, settlement_status, due_amount")
    .eq("id", params.booking.id)
    .maybeSingle()
  if (current.error) throw current.error
  if (!current.data?.payment_status) throw new Error("Current booking payment status could not be verified")

  const dueAmount = current.data.due_amount == null ? Number.NaN : Number(current.data.due_amount)
  const isSettled = String(current.data.settlement_status || "").trim().toLowerCase() === "fully_paid" ||
    (Number.isFinite(dueAmount) && dueAmount <= 0)
  return isPaidStatus(current.data.payment_status) && isSettled
}

export function classifyEmailDeliveryResult(
  result: EmailDeliveryResult,
  hasPayload: boolean,
): { status: EmailProjectionStatus; error: string | null; providerId: string | null } {
  if (!hasPayload) return { status: "not_required", error: null, providerId: null }
  if (result.sent) {
    const providerId = String(result.providerId || result.data?.id || "").trim()
    return { status: "sent", error: null, providerId: providerId || null }
  }
  return {
    status: "failed",
    error: String(result.reason || "Email provider did not accept the message").slice(0, 500),
    providerId: null,
  }
}

export function safeEmailProjectionError(error: unknown): string {
  return String((error as any)?.message || error || "Email delivery failed").slice(0, 500)
}
