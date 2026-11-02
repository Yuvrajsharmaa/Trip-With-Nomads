import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  deliverInternalBookingNotification,
  filterBookingEmailFromInternalNotificationPayload,
  internalNotificationNeedsRetry,
  parseStoredInternalBookingEmailPayload,
  serializeInternalBookingEmailPayload,
} from "./internal_booking_notifications.ts"

const payload = {
  to: ["support@tripwithnomads.com", "yuvrajsharma6367@gmail.com"],
  subject: "[TWN] Booking created: Summer Spiti | TWN-2026-00123",
  html: "<p>Booking created</p>",
  text: "Booking created",
  idempotencyKey: "internal-booking-created:booking-123:attempt-1",
}

Deno.test("internal notification payload round-trips with recipient arrays", () => {
  assertEquals(
    parseStoredInternalBookingEmailPayload(serializeInternalBookingEmailPayload(payload)),
    payload,
  )
})

Deno.test("stored internal email retries exclude the booking email and persist only safe recipients", () => {
  const stored = parseStoredInternalBookingEmailPayload({
    ...payload,
    to: ["support@tripwithnomads.com", "YuvrajTwn@gmail.com"],
  })
  assert(stored)

  const sanitized = filterBookingEmailFromInternalNotificationPayload(
    stored,
    "yuvrajtwn@GMAIL.com",
  )
  assert(sanitized)
  assertEquals(sanitized.to, ["support@tripwithnomads.com"])
  assertEquals(
    sanitized.idempotencyKey,
    `${payload.idempotencyKey}:customer-excluded`,
  )
  assertEquals(
    serializeInternalBookingEmailPayload(sanitized).to,
    ["support@tripwithnomads.com"],
  )
  assertEquals(
    filterBookingEmailFromInternalNotificationPayload(
      sanitized,
      "yuvrajtwn@gmail.com",
    ),
    sanitized,
  )
  assertEquals(
    filterBookingEmailFromInternalNotificationPayload(
      { ...payload, to: ["YuvrajTwn@gmail.com"] },
      "yuvrajtwn@gmail.com",
    ),
    null,
  )
  assertEquals(
    filterBookingEmailFromInternalNotificationPayload(
      {
        ...payload,
        to: ["SUPPORT@TripWithNomads.com", "yuvrajsharma6367@gmail.com"],
      },
      "yuvrajtwn@gmail.com",
    )?.idempotencyKey,
    payload.idempotencyKey,
  )
})

Deno.test("stored notification retry sends and records only non-customer recipients", async () => {
  const row: Record<string, unknown> = {
    id: "notification-row",
    status: "failed",
    attempts: 1,
    email_payload: {
      ...payload,
      to: ["support@tripwithnomads.com", "YuvrajTwn@gmail.com"],
    },
  }
  const supabase = {
    from() {
      let action = "select"
      let patch: Record<string, unknown> = {}
      const query = {
        insert() {
          action = "insert"
          return query
        },
        update(values: Record<string, unknown>) {
          action = "update"
          patch = values
          return query
        },
        select() {
          return query
        },
        eq() {
          return query
        },
        async single() {
          if (action === "insert") return { data: null, error: { code: "23505" } }
          Object.assign(row, patch)
          return { data: row, error: null }
        },
        async maybeSingle() {
          return { data: row, error: null }
        },
      }
      return query
    },
  }

  const previousFetch = globalThis.fetch
  const previousApiKey = Deno.env.get("RESEND_API_KEY")
  const previousRecipients = Deno.env.get("BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS")
  let requestedTo: string[] = []
  let requestedKey = ""
  let requestedUrl = ""
  try {
    Deno.env.set("RESEND_API_KEY", "test-only")
    Deno.env.set(
      "BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS",
      "support@tripwithnomads.com,YuvrajTwn@gmail.com",
    )
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input)
      const request = init as { body?: unknown; headers?: HeadersInit } | undefined
      requestedTo = JSON.parse(String(request?.body || "{}")).to
      requestedKey = new Headers(request?.headers).get("Idempotency-Key") || ""
      if (requestedKey === payload.idempotencyKey) {
        return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ id: "email-test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const status = await deliverInternalBookingNotification({
      supabase,
      eventKey: "booking-created:booking-123:attempt-1",
      eventType: "booking_created",
      booking: { id: "booking-123", email: "yuvrajtwn@GMAIL.com" },
    })

    assertEquals(status, "sent")
    assertEquals(requestedUrl, "https://api.resend.com/emails")
    assertEquals(requestedTo, ["support@tripwithnomads.com"])
    assertEquals(
      requestedKey,
      `${payload.idempotencyKey}:customer-excluded`,
    )
    assertEquals(row.recipients, ["support@tripwithnomads.com"])
    assertEquals(
      (row.email_payload as Record<string, unknown>).to,
      ["support@tripwithnomads.com"],
    )
    assertEquals(
      (row.email_payload as Record<string, unknown>).idempotencyKey,
      requestedKey,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousApiKey === undefined) Deno.env.delete("RESEND_API_KEY")
    else Deno.env.set("RESEND_API_KEY", previousApiKey)
    if (previousRecipients === undefined) {
      Deno.env.delete("BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS")
    } else {
      Deno.env.set("BOOKING_INTERNAL_NOTIFICATION_RECIPIENTS", previousRecipients)
    }
  }
})

Deno.test("internal notification retries pending and failed ledger rows", () => {
  assert(internalNotificationNeedsRetry({ status: "pending" }))
  assert(internalNotificationNeedsRetry({ status: "failed" }))
  assertEquals(internalNotificationNeedsRetry({ status: "sent" }), false)
  assertEquals(internalNotificationNeedsRetry({ status: "not_required" }), false)
})

Deno.test("internal notification payload rejects incomplete stored rows", () => {
  assertEquals(parseStoredInternalBookingEmailPayload({ ...payload, to: [] }), null)
  assertEquals(parseStoredInternalBookingEmailPayload({ ...payload, html: "" }), null)
  assertStringIncludes(
    String(parseStoredInternalBookingEmailPayload(payload)?.idempotencyKey),
    "booking-created",
  )
})
