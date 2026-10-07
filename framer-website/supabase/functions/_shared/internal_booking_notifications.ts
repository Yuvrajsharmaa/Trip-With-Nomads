import {
  buildInternalBookingEmail,
  type InternalBookingEmailContent,
  type InternalBookingEmailInput,
  type InternalNotificationEventType,
  resolveInternalNotificationRecipients,
} from "./internal_booking_email.ts"
import {
  classifyEmailDeliveryResult,
  safeEmailProjectionError,
  type EmailDeliveryResult,
} from "./payment_email_delivery.ts"
import { sendResendEmail } from "./resend.ts"

export type InternalBookingNotificationRequest = Omit<
  InternalBookingEmailInput,
  "recipients"
> & {
  supabase: any
  providerEventId?: string
}

export type InternalBookingNotificationStatus =
  | "not_required"
  | "pending"
  | "sent"
  | "failed"

export function parseStoredInternalBookingEmailPayload(
  value: unknown,
): InternalBookingEmailContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const to = Array.isArray(candidate.to)
    ? candidate.to.map((item) => String(item || "").trim()).filter(Boolean)
    : []
  const subject = String(candidate.subject || "").trim()
  const html = String(candidate.html || "")
  const text = String(candidate.text || "")
  const idempotencyKey = String(candidate.idempotencyKey || "").trim()
  if (to.length === 0 || !subject || !html || !text || !idempotencyKey) return null
  return { to, subject, html, text, idempotencyKey }
}

export function serializeInternalBookingEmailPayload(
  payload: InternalBookingEmailContent,
): Record<string, unknown> {
  return {
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    idempotencyKey: payload.idempotencyKey,
  }
}

export function internalNotificationNeedsRetry(
  row: Record<string, unknown> | null | undefined,
): boolean {
  const status = String(row?.status || "").trim().toLowerCase()
  return status === "pending" || status === "failed"
}

function duplicateError(error: any): boolean {
  return String(error?.code || "") === "23505" ||
    String(error?.message || "").toLowerCase().includes("duplicate key")
}

function text(value: unknown): string {
  return String(value || "").trim()
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value),
  )
}

async function loadTripDetails(
  supabase: any,
  booking: Record<string, unknown>,
): Promise<{ title: string; slug: string }> {
  let title = text(booking.trip_name) || text(booking.trip_title)
  let slug = text(booking.trip_slug) || text(booking.slug)
  const tripId = text(booking.trip_id)
  if (!tripId) return { title, slug }

  const trip = await supabase
    .from("trips")
    .select("title, slug")
    .eq("id", tripId)
    .maybeSingle()
  if (!trip.error && trip.data) {
    title = text(trip.data.title) || title
    slug = text(trip.data.slug) || slug
  }
  return { title, slug }
}

async function updateLedger(
  supabase: any,
  id: string,
  patch: Record<string, unknown>,
): Promise<any> {
  const result = await supabase
    .from("booking_notification_events")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
  if (result.error) throw result.error
  return result.data
}

async function reserveLedger(
  params: InternalBookingNotificationRequest & { recipients: string[] },
): Promise<any> {
  const bookingId = text(params.booking.id)
  const attemptId = text(params.attempt?.id)
  const inserted = await params.supabase
    .from("booking_notification_events")
    .insert({
      event_key: params.eventKey,
      event_type: params.eventType,
      booking_id: isUuid(bookingId) ? bookingId : null,
      payment_attempt_id: isUuid(attemptId) ? attemptId : null,
      provider_event_id: text(params.providerEventId) || text(params.eventId) || null,
      status: "pending",
      recipients: params.recipients,
    })
    .select("*")
    .single()
  if (!inserted.error) return inserted.data
  if (!duplicateError(inserted.error)) throw inserted.error

  const existing = await params.supabase
    .from("booking_notification_events")
    .select("*")
    .eq("event_key", params.eventKey)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) throw new Error("Internal notification ledger row disappeared after duplicate reservation")
  return existing.data
}

function classifyInternalDelivery(
  result: EmailDeliveryResult,
): { status: InternalBookingNotificationStatus; error: string | null; providerId: string | null } {
  return classifyEmailDeliveryResult(result, true)
}

export async function deliverInternalBookingNotification(
  params: InternalBookingNotificationRequest,
): Promise<InternalBookingNotificationStatus> {
  const recipients = resolveInternalNotificationRecipients()
  if (recipients.length === 0) {
    console.warn("[internal-booking-email] no recipients configured; notification skipped", {
      eventKey: params.eventKey,
      eventType: params.eventType,
    })
    return "not_required"
  }

  let ledger: any = null
  try {
    ledger = await reserveLedger({ ...params, recipients })
    const status = String(ledger?.status || "").trim().toLowerCase()
    if (status === "sent" || status === "not_required") return status

    const attemptNumber = Math.max(0, Number(ledger?.attempts || 0)) + 1
    let current = await updateLedger(params.supabase, ledger.id, {
      status: "pending",
      attempts: attemptNumber,
      last_attempt_at: new Date().toISOString(),
      error_message: null,
      recipients,
    })

    let payload = parseStoredInternalBookingEmailPayload(current.email_payload)
    if (!payload) {
      const booking = params.booking as Record<string, unknown>
      const trip = await loadTripDetails(params.supabase, booking)
      payload = buildInternalBookingEmail({
        ...params,
        recipients,
        tripTitle: params.tripTitle || trip.title,
        tripSlug: params.tripSlug || trip.slug,
      })
      if (!payload) {
        await updateLedger(params.supabase, ledger.id, {
          status: "not_required",
          email_payload: null,
          error_message: null,
        })
        return "not_required"
      }
      current = await updateLedger(params.supabase, ledger.id, {
        status: "pending",
        recipients: payload.to,
        idempotency_key: payload.idempotencyKey,
        email_payload: serializeInternalBookingEmailPayload(payload),
        error_message: null,
      })
    }

    const result = await sendResendEmail(payload)
    const classified = classifyInternalDelivery(result)
    await updateLedger(params.supabase, ledger.id, {
      status: classified.status,
      provider_id: classified.providerId,
      sent_at: classified.status === "sent" ? new Date().toISOString() : null,
      error_message: classified.error,
    })
    if (classified.status === "sent") {
      console.log("[internal-booking-email] notification sent", {
        bookingId: text(params.booking.id),
        eventKey: params.eventKey,
        eventType: params.eventType,
      })
    }
    return classified.status
  } catch (error) {
    const message = safeEmailProjectionError(error)
    if (ledger?.id) {
      try {
        await updateLedger(params.supabase, ledger.id, {
          status: "failed",
          error_message: message,
        })
      } catch (ledgerError) {
        console.error("[internal-booking-email] failed to record delivery error", ledgerError)
      }
    }
    console.error("[internal-booking-email] notification failed", {
      bookingId: text(params.booking.id),
      eventKey: params.eventKey,
      eventType: params.eventType,
      error: message,
    })
    return "failed"
  }
}

export function buildInternalNotificationRequest(params: {
  supabase: any
  eventType: InternalNotificationEventType
  booking: InternalBookingEmailInput["booking"]
  attempt?: Record<string, unknown> | null
  eventKey?: string
  providerEventId?: string
  eventName?: string
  eventId?: string
  errorCode?: string
  errorMessage?: string
  statusUrl?: string
  retryUrl?: string
  occurredAt?: string
}): InternalBookingNotificationRequest {
  const bookingId = text(params.booking.id)
  const eventKey = params.eventKey || `${params.eventType}:${bookingId || "unknown"}`
  return {
    ...params,
    eventKey,
  }
}
