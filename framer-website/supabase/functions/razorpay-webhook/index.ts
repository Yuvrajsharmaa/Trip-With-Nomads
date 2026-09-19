import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildBookingSheetRow, BOOKING_HEADERS } from "../_shared/booking_sheets.ts"
import {
    BOOKING_CALLBACK_HEADERS,
    buildBookingCallbackRow,
} from "../_shared/booking_callback_sheets.ts"
import {
    appendRow,
    findRowByColumnValue,
    safeUpdateRow,
    sheetsEnabled,
} from "../_shared/sheets.ts"
import { resolveBookingSheetId } from "../_shared/booking_sheet_config.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SUCCESS_EVENTS = new Set(["payment.captured", "order.paid"])
const FAILURE_EVENTS = new Set(["payment.failed"])
const STALE_PROCESSING_MS = 10 * 60 * 1000

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function isMissingColumnError(error: any, columnName: string): boolean {
    const needle = String(columnName || "").trim().toLowerCase()
    const message = String(error?.message || error?.details || error?.hint || error || "")
        .trim()
        .toLowerCase()
    return Boolean(needle) && message.includes("column") && message.includes(needle)
}

function bookingSheetsWriteEnabled(): boolean {
    return isTruthy(Deno.env.get("BOOKING_SHEETS_WRITE_ENABLED"))
}

function resolveGatewayTestMode(): boolean {
    const explicit = Deno.env.get("PAYMENT_GATEWAY_TEST_MODE")
    if (explicit != null && explicit !== "") return isTruthy(explicit)
    const razorpayMode = Deno.env.get("RAZORPAY_TEST_MODE")
    return razorpayMode != null && razorpayMode !== ""
        ? isTruthy(razorpayMode)
        : false
}

function razorpayCredentials(): { keyId: string; keySecret: string } {
    const testMode = resolveGatewayTestMode()
    const keyId = testMode
        ? firstNonEmpty(Deno.env.get("RAZORPAY_TEST_KEY_ID"), Deno.env.get("RAZORPAY_KEY_ID"))
        : firstNonEmpty(Deno.env.get("RAZORPAY_LIVE_KEY_ID"), Deno.env.get("RAZORPAY_KEY_ID"))
    const keySecret = testMode
        ? firstNonEmpty(Deno.env.get("RAZORPAY_TEST_KEY_SECRET"), Deno.env.get("RAZORPAY_KEY_SECRET"))
        : firstNonEmpty(Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"), Deno.env.get("RAZORPAY_KEY_SECRET"))
    return { keyId, keySecret }
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message),
    )
    return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

async function sha256Hex(message: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(message),
    )
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false
    let difference = 0
    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
    }
    return difference === 0
}

function getEventEntities(event: any): {
    payment: Record<string, any>
    order: Record<string, any>
} {
    return {
        payment: event?.payload?.payment?.entity || {},
        order: event?.payload?.order?.entity || {},
    }
}

function getEventIdentifiers(event: any): {
    orderId: string
    paymentId: string
    bookingId: string
} {
    const { payment, order } = getEventEntities(event)
    return {
        orderId: firstNonEmpty(payment.order_id, order.id),
        paymentId: firstNonEmpty(payment.id),
        bookingId: firstNonEmpty(
            order.notes?.booking_id,
            payment.notes?.booking_id,
        ),
    }
}

function duplicateError(error: any): boolean {
    return String(error?.code || "") === "23505" ||
        String(error?.message || "").toLowerCase().includes("duplicate key")
}

async function reserveEvent(
    supabase: any,
    event: { id: string; name: string; orderId: string; paymentId: string },
): Promise<"new" | "retry" | "done"> {
    const inserted = await supabase
        .from("razorpay_webhook_events")
        .insert({
            event_id: event.id,
            event_name: event.name || "unknown",
            order_id: event.orderId || null,
            payment_id: event.paymentId || null,
            status: "processing",
            error_message: null,
        })

    if (!inserted.error) return "new"
    if (!duplicateError(inserted.error)) throw inserted.error

    const existing = await supabase
        .from("razorpay_webhook_events")
        .select("status, received_at")
        .eq("event_id", event.id)
        .maybeSingle()

    if (existing.error) throw existing.error
    if (!existing.data) return "retry"

    const status = String(existing.data.status || "")
    if (status === "processed" || status === "ignored") return "done"

    const receivedAt = new Date(String(existing.data.received_at || "")).getTime()
    const stale = !Number.isFinite(receivedAt) || Date.now() - receivedAt > STALE_PROCESSING_MS
    if (!stale && status === "processing") return "done"

    const retry = await supabase
        .from("razorpay_webhook_events")
        .update({
            status: "processing",
            error_message: null,
            processed_at: null,
            received_at: new Date().toISOString(),
        })
        .eq("event_id", event.id)
    if (retry.error) throw retry.error
    return "retry"
}

async function finishEvent(
    supabase: any,
    eventId: string,
    status: "processed" | "ignored" | "failed",
    errorMessage?: string,
) {
    const result = await supabase
        .from("razorpay_webhook_events")
        .update({
            status,
            processed_at: new Date().toISOString(),
            error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
        })
        .eq("event_id", eventId)
    if (result.error) throw result.error
}

async function razorpayGet(
    path: string,
    credentials: { keyId: string; keySecret: string },
): Promise<Record<string, any>> {
    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        headers: { Authorization: `Basic ${auth}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const reason = firstNonEmpty(data?.error?.description, data?.error?.reason, "request failed")
        throw new Error(`Razorpay API ${response.status}: ${reason}`)
    }
    return data || {}
}

async function verifyRazorpayState(params: {
    eventName: string
    orderId: string
    paymentId: string
    credentials: { keyId: string; keySecret: string }
}): Promise<{ amountPaise: number; orderStatus: string; paymentStatus: string }> {
    if (!params.orderId) throw new Error("Webhook is missing a Razorpay order id")

    const order = await razorpayGet(
        `orders/${encodeURIComponent(params.orderId)}`,
        params.credentials,
    )
    const payment = params.paymentId
        ? await razorpayGet(
            `payments/${encodeURIComponent(params.paymentId)}`,
            params.credentials,
        )
        : {}
    const orderStatus = String(order.status || "").trim().toLowerCase()
    const paymentStatus = String(payment.status || "").trim().toLowerCase()

    if (SUCCESS_EVENTS.has(params.eventName)) {
        if (orderStatus !== "paid") {
            throw new Error(`Razorpay order ${params.orderId} is not paid`)
        }
        if (params.paymentId && paymentStatus !== "captured") {
            throw new Error(`Razorpay payment ${params.paymentId} is not captured`)
        }
    } else if (FAILURE_EVENTS.has(params.eventName)) {
        if (!params.paymentId || paymentStatus !== "failed") {
            throw new Error(`Razorpay payment ${params.paymentId || "unknown"} is not failed`)
        }
    }

    return {
        amountPaise: Math.max(
            0,
            Math.round(toNumber(payment.amount || order.amount_paid || order.amount)),
        ),
        orderStatus,
        paymentStatus,
    }
}

async function loadBooking(supabase: any, bookingId: string, orderId: string) {
    const selectWithBalance =
        "id, booking_ref, trip_id, departure_date, name, email, phone, travellers, payment_breakdown, coupon_code, subtotal_amount, discount_amount, tax_amount, total_amount, payment_mode, payable_now_amount, due_amount, paid_amount, payment_status, settlement_status, payment_gateway_txn_id, payment_gateway_order_or_ref_id, balance_due_note, created_at"
    const selectWithoutBalance = selectWithBalance.replace(", balance_due_note", "")

    let supportsBalanceDueNote = true
    let query = supabase.from("bookings").select(selectWithBalance)
    if (bookingId) query = query.eq("id", bookingId)
    else query = query.eq("payment_gateway_order_or_ref_id", orderId)
    let result = await query.maybeSingle()

    if (result.error && isMissingColumnError(result.error, "balance_due_note")) {
        supportsBalanceDueNote = false
        let fallback = supabase.from("bookings").select(selectWithoutBalance)
        if (bookingId) fallback = fallback.eq("id", bookingId)
        else fallback = fallback.eq("payment_gateway_order_or_ref_id", orderId)
        result = await fallback.maybeSingle()
    }

    return {
        booking: result.data,
        error: result.error,
        supportsBalanceDueNote,
    }
}

type PaymentReconciliationClaim = "claimed" | "already_processed"

/**
 * payment.captured and order.paid are separate webhook deliveries for the
 * same Razorpay payment. The webhook ledger deduplicates a replayed event id,
 * but it cannot deduplicate those two different event ids. Claim the booking
 * row atomically before running the payment handler so only the first delivery
 * can write the callback sheets. A failed claim is released in the outer
 * error path so Razorpay can retry the event safely.
 */
async function claimPaymentReconciliation(params: {
    supabase: any
    booking: Record<string, any>
    bookingId: string
    orderId: string
    paymentId: string
    expectedStatus: "paid" | "failed"
}): Promise<PaymentReconciliationClaim> {
    const storedPaymentId = firstNonEmpty(params.booking.payment_gateway_txn_id)
    if (storedPaymentId && storedPaymentId !== params.paymentId) {
        throw new Error("Webhook payment does not match the booking")
    }

    const storedStatus = firstNonEmpty(params.booking.payment_status).toLowerCase()
    if (storedPaymentId === params.paymentId && storedStatus === params.expectedStatus) {
        return "already_processed"
    }

    if (!params.paymentId) {
        throw new Error("Webhook payment id is missing")
    }

    const claimed = await params.supabase
        .from("bookings")
        .update({
            payment_gateway_txn_id: params.paymentId,
            payment_gateway_order_or_ref_id: params.orderId || null,
        })
        .eq("id", params.bookingId)
        .eq("payment_status", "pending")
        .is("payment_gateway_txn_id", null)
        .select("id")
        .maybeSingle()

    if (claimed.error) throw claimed.error
    if (claimed.data?.id) return "claimed"

    const latest = await loadBooking(params.supabase, params.bookingId, params.orderId)
    if (latest.error) throw latest.error
    const latestPaymentId = firstNonEmpty(latest.booking?.payment_gateway_txn_id)
    const latestStatus = firstNonEmpty(latest.booking?.payment_status).toLowerCase()

    if (latestPaymentId && latestPaymentId !== params.paymentId) {
        throw new Error("Webhook payment does not match the booking")
    }
    if (latestPaymentId === params.paymentId && latestStatus === params.expectedStatus) {
        return "already_processed"
    }
    if (latestPaymentId === params.paymentId && latestStatus === "pending") {
        throw new Error("Payment reconciliation is already in progress")
    }

    throw new Error("Unable to claim payment reconciliation")
}

async function releasePaymentReconciliationClaim(params: {
    supabase: any
    bookingId: string
    paymentId: string
}) {
    if (!params.bookingId || !params.paymentId) return
    await params.supabase
        .from("bookings")
        .update({
            payment_gateway_txn_id: null,
            payment_gateway_order_or_ref_id: null,
        })
        .eq("id", params.bookingId)
        .eq("payment_status", "pending")
        .eq("payment_gateway_txn_id", params.paymentId)
}

async function applyThroughPaymentHandler(params: {
    supabaseUrl: string
    orderId: string
    paymentId: string
    bookingId: string
    success: boolean
    keySecret: string
}) {
    const query = new URLSearchParams({ gateway: "razorpay" })
    if (params.bookingId) query.set("booking_id", params.bookingId)

    const form = new URLSearchParams({
        razorpay_order_id: params.orderId,
        razorpay_payment_id: params.paymentId,
    })
    if (params.success) {
        form.set(
            "razorpay_signature",
            await hmacSha256Hex(`${params.orderId}|${params.paymentId}`, params.keySecret),
        )
    }

    const response = await fetch(
        `${params.supabaseUrl}/functions/v1/handle-payment?${query.toString()}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
            redirect: "manual",
        },
    )

    if (response.status >= 400 && response.status !== 409) {
        const body = await response.text().catch(() => "")
        throw new Error(`handle-payment returned ${response.status}: ${body.slice(0, 180)}`)
    }
}

async function syncSheets(params: {
    supabase: any
    booking: Record<string, any>
    eventName: string
    isSuccess: boolean
    notes: string
    updatedAt: string
}) {
    if (!bookingSheetsWriteEnabled() || !sheetsEnabled()) return

    const bookingSheetId = resolveBookingSheetId({
        BOOKING_CALLBACK_SHEET_ID: Deno.env.get("BOOKING_CALLBACK_SHEET_ID"),
        GOOGLE_SHEET_ID: Deno.env.get("GOOGLE_SHEET_ID"),
        GOOGLE_SHEET_ID_TRIPS: Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
    })
    const bookingsSheetId = bookingSheetId
    const callbackSheetId = bookingSheetId
    if (!bookingsSheetId && !callbackSheetId) {
        throw new Error("Booking Sheets are enabled but no booking spreadsheet is configured")
    }

    let tripTitle = ""
    let tripSlug = ""
    if (params.booking.trip_id) {
        const trip = await params.supabase
            .from("trips")
            .select("title, slug")
            .eq("id", params.booking.trip_id)
            .maybeSingle()
        if (!trip.error && trip.data) {
            tripTitle = firstNonEmpty(trip.data.title)
            tripSlug = firstNonEmpty(trip.data.slug)
        }
    }

    const eventStage = `${params.isSuccess ? "paid" : "failed"}_webhook`

    if (bookingsSheetId) {
        const rowValues = buildBookingSheetRow({
            booking: params.booking,
            eventStage,
            notes: params.notes,
            updatedAt: params.updatedAt,
        })
        const existing = await findRowByColumnValue(
            bookingsSheetId,
            firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings"),
            "Booking ID",
            String(params.booking.id),
            BOOKING_HEADERS,
        )
        const tab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
        if (existing) {
            await safeUpdateRow(bookingsSheetId, tab, existing, rowValues, BOOKING_HEADERS)
        } else {
            await appendRow(bookingsSheetId, tab, rowValues, BOOKING_HEADERS)
        }
    }

    if (callbackSheetId) {
        const tab = params.isSuccess
            ? firstNonEmpty(Deno.env.get("BOOKING_SUCCESS_SHEET_TAB"), "Bookings_Success")
            : firstNonEmpty(Deno.env.get("BOOKING_FAILED_SHEET_TAB"), "Bookings_Failed")
        const rowValues = buildBookingCallbackRow({
            booking: params.booking,
            tripTitle,
            tripSlug,
            notes: params.notes,
            updatedAt: params.updatedAt,
        })
        const existing = await findRowByColumnValue(
            callbackSheetId,
            tab,
            "Booking ID",
            String(params.booking.id),
            BOOKING_CALLBACK_HEADERS,
        )
        if (existing) {
            await safeUpdateRow(callbackSheetId, tab, existing, rowValues, BOOKING_CALLBACK_HEADERS)
        } else {
            await appendRow(callbackSheetId, tab, rowValues, BOOKING_CALLBACK_HEADERS)
        }
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "POST required" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    const webhookSecret = firstNonEmpty(Deno.env.get("RAZORPAY_WEBHOOK_SECRET"))
    if (!webhookSecret) {
        return new Response(JSON.stringify({ error: "Webhook configuration missing" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    const rawBody = await req.text()
    const receivedSignature = firstNonEmpty(req.headers.get("x-razorpay-signature")).toLowerCase()
    const expectedSignature = (await hmacSha256Hex(rawBody, webhookSecret)).toLowerCase()
    if (!receivedSignature || !constantTimeEqual(receivedSignature, expectedSignature)) {
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    let event: any
    try {
        event = JSON.parse(rawBody)
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    const eventName = firstNonEmpty(event?.event)
    const identifiers = getEventIdentifiers(event)
    const eventId = firstNonEmpty(
        req.headers.get("x-razorpay-event-id"),
        `body-${await sha256Hex(rawBody)}`,
    )
    const supabaseUrl = firstNonEmpty(Deno.env.get("SUPABASE_URL"))
    const serviceRoleKey = firstNonEmpty(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if (!supabaseUrl || !serviceRoleKey) {
        return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    let reservation: "new" | "retry" | "done"
    try {
        reservation = await reserveEvent(supabase, {
            id: eventId,
            name: eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
        })
    } catch (error) {
        console.error("[razorpay-webhook] event reservation failed", error)
        return new Response(JSON.stringify({ error: "Webhook reservation failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    if (reservation === "done") {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    let claimedBookingId = ""
    let claimedPaymentId = ""
    try {
        if (!SUCCESS_EVENTS.has(eventName) && !FAILURE_EVENTS.has(eventName)) {
            await finishEvent(supabase, eventId, "ignored")
            return new Response(JSON.stringify({ ok: true, ignored: true, event: eventName }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        if (!identifiers.orderId) throw new Error("Webhook payload has no order id")

        const bookingLookup = await loadBooking(
            supabase,
            identifiers.bookingId,
            identifiers.orderId,
        )
        if (bookingLookup.error) throw bookingLookup.error
        if (!bookingLookup.booking) {
            if (identifiers.bookingId) {
                throw new Error(`Booking ${identifiers.bookingId} was not found yet`)
            }
            await finishEvent(supabase, eventId, "ignored")
            return new Response(JSON.stringify({ ok: true, ignored: true, reason: "booking_not_owned" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        const booking = bookingLookup.booking
        const storedOrderId = firstNonEmpty(booking.payment_gateway_order_or_ref_id)
        if (storedOrderId && storedOrderId !== identifiers.orderId) {
            throw new Error("Webhook order does not match the booking")
        }

        if (FAILURE_EVENTS.has(eventName) && String(booking.payment_status || "").toLowerCase() === "paid") {
            await finishEvent(supabase, eventId, "ignored")
            return new Response(JSON.stringify({ ok: true, ignored: true, reason: "booking_already_paid" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        const credentials = razorpayCredentials()
        if (!credentials.keyId || !credentials.keySecret) {
            throw new Error("Razorpay API credentials are not configured")
        }
        if (SUCCESS_EVENTS.has(eventName) && !identifiers.paymentId) {
            throw new Error("Successful webhook payload has no payment id")
        }

        const gatewayState = await verifyRazorpayState({
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            credentials,
        })

        const expectedPayablePaise = Math.round(
            Math.max(
                0,
                toNumber(booking.payable_now_amount || booking.total_amount),
            ) * 100,
        )
        if (
            SUCCESS_EVENTS.has(eventName) &&
            expectedPayablePaise > 0 &&
            Math.abs(gatewayState.amountPaise - expectedPayablePaise) >= 50
        ) {
            throw new Error("Razorpay payment amount does not match the booking")
        }

        const expectedStatus = SUCCESS_EVENTS.has(eventName) ? "paid" : "failed"
        const bookingId = String(booking.id || identifiers.bookingId || "")
        const claim = await claimPaymentReconciliation({
            supabase,
            booking,
            bookingId,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            expectedStatus,
        })
        if (claim === "already_processed") {
            await finishEvent(supabase, eventId, "processed")
            return new Response(JSON.stringify({
                ok: true,
                duplicate: true,
                reason: "booking_already_reconciled",
                booking_id: bookingId,
                payment_status: expectedStatus,
            }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }
        claimedBookingId = bookingId
        claimedPaymentId = identifiers.paymentId

        const updatedAt = new Date().toISOString()
        await applyThroughPaymentHandler({
            supabaseUrl,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            bookingId,
            success: SUCCESS_EVENTS.has(eventName),
            keySecret: credentials.keySecret,
        })

        const refreshed = await loadBooking(
            supabase,
            bookingId,
            identifiers.orderId,
        )
        if (refreshed.error || !refreshed.booking) {
            throw refreshed.error || new Error("Booking disappeared after payment update")
        }

        if (String(refreshed.booking.payment_status || "").toLowerCase() !== expectedStatus) {
            throw new Error(`Payment handler did not set booking status to ${expectedStatus}`)
        }

        const note = SUCCESS_EVENTS.has(eventName)
            ? `Razorpay ${eventName} verified by server-side webhook`
            : `Razorpay ${eventName} verified by server-side webhook`
        await syncSheets({
            supabase,
            booking: refreshed.booking,
            eventName,
            isSuccess: SUCCESS_EVENTS.has(eventName),
            notes: note,
            updatedAt,
        })

        await finishEvent(supabase, eventId, "processed")
        return new Response(JSON.stringify({
            ok: true,
            event: eventName,
            booking_id: refreshed.booking.id,
            payment_status: refreshed.booking.payment_status,
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    } catch (error) {
        const message = String((error as any)?.message || error || "Webhook processing failed")
        console.error("[razorpay-webhook] processing failed", {
            eventId,
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            message,
        })
        if (claimedBookingId && claimedPaymentId) {
            try {
                await releasePaymentReconciliationClaim({
                    supabase,
                    bookingId: claimedBookingId,
                    paymentId: claimedPaymentId,
                })
            } catch (releaseError) {
                console.error("[razorpay-webhook] failed to release payment claim", releaseError)
            }
        }
        try {
            await finishEvent(supabase, eventId, "failed", message)
        } catch (ledgerError) {
            console.error("[razorpay-webhook] failed to record error", ledgerError)
        }
        return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }
})
