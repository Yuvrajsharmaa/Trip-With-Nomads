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
import {
    calculateSettlementStatus,
    isAmountMatch,
    isPaidStatus,
    transitionPaymentStatus,
} from "../_shared/payment_reconciliation.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PROVIDER = "razorpay"
const SUCCESS_EVENTS = new Set(["payment.captured", "order.paid"])
const FAILURE_EVENTS = new Set(["payment.failed"])

class InvalidWebhookError extends Error {
    code = "INVALID_WEBHOOK"
}

class GatewayUnavailableError extends Error {
    code = "GATEWAY_UNAVAILABLE"
}

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

function duplicateError(error: any): boolean {
    return String(error?.code || "") === "23505" ||
        String(error?.message || "").toLowerCase().includes("duplicate key")
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
    )
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function webhookSecret(): string {
    return firstNonEmpty(
        Deno.env.get("RAZORPAY_WEBHOOK_SECRET"),
        Deno.env.get("PAYMENT_WEBHOOK_SECRET"),
    )
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
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
    return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

async function sha256Hex(message: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message))
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

function constantTimeEqual(left: string, right: string): boolean {
    if (!left || left.length !== right.length) return false
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
        bookingId: firstNonEmpty(order.notes?.booking_id, payment.notes?.booking_id),
    }
}

async function razorpayGet(
    path: string,
    credentials: { keyId: string; keySecret: string },
): Promise<Record<string, any>> {
    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    let response: Response
    try {
        response = await fetch(`https://api.razorpay.com/v1/${path}`, {
            headers: { Authorization: `Basic ${auth}` },
        })
    } catch (error) {
        throw new GatewayUnavailableError(`Razorpay API unavailable: ${String(error)}`)
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const reason = firstNonEmpty(data?.error?.description, data?.error?.reason, "request failed")
        throw new GatewayUnavailableError(`Razorpay API ${response.status}: ${reason}`)
    }
    return data || {}
}

async function verifyRazorpayState(params: {
    eventName: string
    orderId: string
    paymentId: string
    credentials: { keyId: string; keySecret: string }
}): Promise<{ amountMinor: number; currency: string; orderStatus: string; paymentStatus: string }> {
    if (!params.orderId) throw new InvalidWebhookError("Webhook is missing a Razorpay order id")

    const order = await razorpayGet(`orders/${encodeURIComponent(params.orderId)}`, params.credentials)
    const payment = params.paymentId
        ? await razorpayGet(`payments/${encodeURIComponent(params.paymentId)}`, params.credentials)
        : {}
    const orderStatus = String(order.status || "").trim().toLowerCase()
    const paymentStatus = String(payment.status || "").trim().toLowerCase()

    if (SUCCESS_EVENTS.has(params.eventName)) {
        if (orderStatus !== "paid") {
            throw new InvalidWebhookError(`Razorpay order ${params.orderId} is not paid`)
        }
        if (params.eventName === "payment.captured" && (!params.paymentId || paymentStatus !== "captured")) {
            throw new InvalidWebhookError(`Razorpay payment ${params.paymentId || "unknown"} is not captured`)
        }
    } else if (FAILURE_EVENTS.has(params.eventName)) {
        if (!params.paymentId || paymentStatus !== "failed") {
            throw new InvalidWebhookError(`Razorpay payment ${params.paymentId || "unknown"} is not failed`)
        }
    }

    return {
        amountMinor: Math.max(
            0,
            Math.round(toNumber(payment.amount || order.amount_paid || order.amount)),
        ),
        currency: firstNonEmpty(payment.currency, order.currency, "INR").toUpperCase(),
        orderStatus,
        paymentStatus,
    }
}

async function reservePaymentEvent(params: {
    supabase: any
    eventId: string
    eventName: string
    orderId: string
    paymentId: string
    bookingId: string
    rawBodyHash: string
}): Promise<{ row: any; inserted: boolean }> {
    const payload = {
        provider: PROVIDER,
        provider_event_id: params.eventId,
        event_type: params.eventName || "unknown",
        booking_id: isUuid(params.bookingId) ? params.bookingId : null,
        provider_order_id: params.orderId || null,
        provider_payment_id: params.paymentId || null,
        raw_body_sha256: params.rawBodyHash,
        verification_status: "received",
        processing_status: "received",
        sheet_sync_status: "pending",
        error_message: null,
    }
    const inserted = await params.supabase
        .from("payment_events")
        .insert(payload)
        .select("*")
        .single()

    if (!inserted.error) return { row: inserted.data, inserted: true }
    if (!duplicateError(inserted.error)) throw inserted.error

    const existing = await params.supabase
        .from("payment_events")
        .select("*")
        .eq("provider", PROVIDER)
        .eq("provider_event_id", params.eventId)
        .maybeSingle()
    if (existing.error) throw existing.error
    if (!existing.data) throw new Error("Webhook event disappeared after duplicate reservation")
    return { row: existing.data, inserted: false }
}

async function claimPaymentEvent(supabase: any, row: any): Promise<"process" | "sheet" | "done"> {
    const processing = String(row?.processing_status || "").toLowerCase()
    const sheet = String(row?.sheet_sync_status || "").toLowerCase()
    if (processing === "ignored") return "done"
    if (processing === "applied") return sheet === "synced" || sheet === "not_required" ? "done" : "sheet"

    const claimed = await supabase
        .from("payment_events")
        .update({ processing_status: "processing", error_message: null })
        .eq("id", row.id)
        .in("processing_status", ["received", "failed"])
        .select("*")
        .maybeSingle()
    if (!claimed.error && claimed.data) return "process"
    if (claimed.error) throw claimed.error

    const latest = await supabase.from("payment_events").select("*").eq("id", row.id).single()
    if (latest.error) throw latest.error
    const latestProcessing = String(latest.data?.processing_status || "").toLowerCase()
    const latestSheet = String(latest.data?.sheet_sync_status || "").toLowerCase()
    if (latestProcessing === "applied") return latestSheet === "synced" || latestSheet === "not_required" ? "done" : "sheet"
    if (latestProcessing === "ignored") return "done"
    return "done"
}

async function updatePaymentEvent(supabase: any, eventId: string, patch: Record<string, unknown>) {
    const result = await supabase
        .from("payment_events")
        .update(patch)
        .eq("id", eventId)
        .select("*")
        .single()
    if (result.error) throw result.error
    return result.data
}

async function loadBooking(supabase: any, bookingId: string, orderId: string): Promise<any> {
    if (bookingId) {
        const direct = await supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle()
        if (direct.error) throw direct.error
        if (direct.data) return direct.data
    }

    if (orderId) {
        const byOrder = await supabase
            .from("bookings")
            .select("*")
            .eq("payment_gateway_order_or_ref_id", orderId)
            .maybeSingle()
        if (byOrder.error) throw byOrder.error
        if (byOrder.data) return byOrder.data

        const attempt = await supabase
            .from("payment_attempts")
            .select("booking_id")
            .eq("provider", PROVIDER)
            .eq("provider_order_id", orderId)
            .maybeSingle()
        if (attempt.error) throw attempt.error
        if (attempt.data?.booking_id) {
            const byAttempt = await supabase
                .from("bookings")
                .select("*")
                .eq("id", attempt.data.booking_id)
                .maybeSingle()
            if (byAttempt.error) throw byAttempt.error
            if (byAttempt.data) return byAttempt.data
        }
    }
    return null
}

async function loadPaymentAttempt(
    supabase: any,
    booking: any,
    orderId: string,
    paymentId: string,
): Promise<any> {
    if (paymentId) {
        const byPayment = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("provider", PROVIDER)
            .eq("provider_payment_id", paymentId)
            .maybeSingle()
        if (byPayment.error) throw byPayment.error
        if (byPayment.data) return byPayment.data
    }
    if (orderId) {
        const byOrder = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("provider", PROVIDER)
            .eq("provider_order_id", orderId)
            .maybeSingle()
        if (byOrder.error) throw byOrder.error
        if (byOrder.data) return byOrder.data
    }
    if (booking?.active_payment_attempt_id) {
        const active = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("id", booking.active_payment_attempt_id)
            .maybeSingle()
        if (active.error) throw active.error
        if (active.data) return active.data
    }
    return null
}

function validateOwnership(params: { booking: any; attempt: any; orderId: string; paymentId: string }) {
    const storedOrder = firstNonEmpty(
        params.booking?.payment_gateway_order_or_ref_id,
        params.attempt?.provider_order_id,
    )
    if (!params.attempt) throw new InvalidWebhookError("Webhook payment does not belong to a payment attempt")
    if (String(params.attempt.booking_id) !== String(params.booking.id)) {
        throw new InvalidWebhookError("Webhook attempt belongs to another booking")
    }
    if (storedOrder && storedOrder !== params.orderId) {
        throw new InvalidWebhookError("Webhook order does not match the booking")
    }
    if (params.attempt.provider_order_id && params.attempt.provider_order_id !== params.orderId) {
        throw new InvalidWebhookError("Webhook order does not match the payment attempt")
    }
    if (params.attempt.provider_payment_id && params.paymentId && params.attempt.provider_payment_id !== params.paymentId) {
        throw new InvalidWebhookError("Webhook payment does not match the payment attempt")
    }
    if (params.booking.payment_gateway_payment_id && params.paymentId && params.booking.payment_gateway_payment_id !== params.paymentId) {
        throw new InvalidWebhookError("Webhook payment does not match the booking")
    }
}

async function reconcilePayment(params: {
    supabase: any
    booking: any
    attempt: any
    eventId: string
    eventName: string
    orderId: string
    paymentId: string
    amountMinor: number
    currency: string
}): Promise<{ booking: any; reconciliationResult: string; notes: string }> {
    const success = SUCCESS_EVENTS.has(params.eventName)
    const currentStatus = String(params.booking.payment_status || "pending").toLowerCase()
    const attemptStatus = String(params.attempt.status || "pending").toLowerCase()

    const attemptPatch: Record<string, unknown> = {
        provider_order_id: params.orderId || params.attempt.provider_order_id || null,
        provider_payment_id: params.paymentId || params.attempt.provider_payment_id || null,
        updated_at: new Date().toISOString(),
    }
    if (success && attemptStatus !== "paid") {
        attemptPatch.status = "paid"
        attemptPatch.paid_at = new Date().toISOString()
        attemptPatch.failed_at = null
    } else if (!success && attemptStatus !== "paid") {
        attemptPatch.status = "failed"
        attemptPatch.failed_at = new Date().toISOString()
    }
    const attemptUpdate = await params.supabase
        .from("payment_attempts")
        .update(attemptPatch)
        .eq("id", params.attempt.id)
    if (attemptUpdate.error) throw attemptUpdate.error

    const currentIsPaid = isPaidStatus(currentStatus)
    const activeAttemptId = firstNonEmpty(params.booking.active_payment_attempt_id)
    const olderFailure = !success && activeAttemptId && activeAttemptId !== String(params.attempt.id)
    let shouldUpdateBooking = false
    if (success) shouldUpdateBooking = !currentIsPaid
    else shouldUpdateBooking = !currentIsPaid && !olderFailure

    let reconciliationResult = ""
    if (success && currentIsPaid) {
        reconciliationResult = activeAttemptId && activeAttemptId !== String(params.attempt.id)
            ? "late_success_after_paid"
            : "duplicate_success"
    } else if (!success && currentIsPaid) {
        reconciliationResult = "ignored_failure_after_paid"
    } else if (olderFailure) {
        reconciliationResult = "ignored_older_attempt_failure"
    } else {
        reconciliationResult = success ? "payment_applied" : "failure_applied"
    }

    let updatedBooking = params.booking
    const bookingPatch: Record<string, unknown> = {
        last_payment_event_id: params.eventId,
        last_payment_event_at: new Date().toISOString(),
    }
    if (shouldUpdateBooking) {
        const paidAmount = round2(Math.max(0, params.amountMinor / 100))
        const totalMinor = Math.round(Math.max(0, toNumber(params.booking.total_amount)) * 100)
        const paidMinor = success
            ? Math.max(Math.round(Math.max(0, toNumber(params.booking.paid_amount)) * 100), params.amountMinor)
            : Math.round(Math.max(0, toNumber(params.booking.paid_amount)) * 100)
        bookingPatch.payment_status = transitionPaymentStatus(currentStatus, success ? "success" : "failure")
        bookingPatch.settlement_status = success
            ? calculateSettlementStatus(params.booking.payment_mode, totalMinor, paidMinor)
            : "failed"
        bookingPatch.payment_provider = PROVIDER
        bookingPatch.payment_gateway_order_or_ref_id = params.orderId || null
        bookingPatch.payment_gateway_payment_id = params.paymentId || null
        bookingPatch.payment_gateway_txn_id = params.paymentId || params.orderId || null
        bookingPatch.active_payment_attempt_id = params.attempt.id
        bookingPatch.payment_attempt_number = params.attempt.attempt_no
        if (success) {
            bookingPatch.paid_amount = paidAmount
            bookingPatch.due_amount = round2(Math.max(0, toNumber(params.booking.total_amount) - paidAmount))
        }

        const updated = await params.supabase
            .from("bookings")
            .update(bookingPatch)
            .eq("id", params.booking.id)
            .neq("payment_status", "paid")
            .select("*")
            .maybeSingle()
        if (updated.error) throw updated.error
        if (updated.data) updatedBooking = updated.data
        else {
            const latest = await params.supabase.from("bookings").select("*").eq("id", params.booking.id).single()
            if (latest.error) throw latest.error
            updatedBooking = latest.data
        }
    } else {
        const eventStamp = await params.supabase
            .from("bookings")
            .update(bookingPatch)
            .eq("id", params.booking.id)
            .select("*")
            .single()
        if (eventStamp.error) throw eventStamp.error
        updatedBooking = eventStamp.data || params.booking
    }

    const notes = success
        ? `Razorpay ${params.eventName} verified by server-side webhook (${reconciliationResult})`
        : `Razorpay ${params.eventName} verified by server-side webhook (${reconciliationResult})`
    return { booking: updatedBooking, reconciliationResult, notes }
}

function bookingSheetId(): string {
    return firstNonEmpty(
        Deno.env.get("BOOKING_CALLBACK_SHEET_ID"),
        Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
        Deno.env.get("GOOGLE_SHEET_ID"),
    )
}

async function syncPaymentSheets(params: {
    booking: any
    eventId: string
    eventName: string
    notes: string
}): Promise<boolean> {
    if (!isTruthy(Deno.env.get("BOOKING_SHEETS_WRITE_ENABLED")) || !sheetsEnabled()) return false
    const sheetId = bookingSheetId()
    if (!sheetId) throw new Error("Booking Sheets are enabled but no booking spreadsheet is configured")

    const bookingsTab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
    const currentRow = buildBookingSheetRow({
        booking: params.booking,
        eventStage: params.eventName,
        notes: params.notes,
    })
    const currentMatch = await findRowByColumnValue(sheetId, bookingsTab, "Booking ID", String(params.booking.id), BOOKING_HEADERS)
    if (currentMatch) await safeUpdateRow(sheetId, bookingsTab, currentMatch, currentRow, BOOKING_HEADERS)
    else await appendRow(sheetId, bookingsTab, currentRow, BOOKING_HEADERS)

    const historyTab = String(params.eventName === "payment.failed"
        ? firstNonEmpty(Deno.env.get("BOOKING_FAILED_SHEET_TAB"), "Bookings_Failed")
        : firstNonEmpty(Deno.env.get("BOOKING_SUCCESS_SHEET_TAB"), "Bookings_Success"))
    const historyRow = buildBookingCallbackRow({
        booking: params.booking,
        notes: `${params.notes}; Event ID: ${params.eventId}`,
    })
    await appendRow(sheetId, historyTab, historyRow, BOOKING_CALLBACK_HEADERS)
    return true
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405)

    const secret = webhookSecret()
    if (!secret) return jsonResponse({ error: "Webhook configuration missing" }, 500)

    const rawBody = await req.text()
    const receivedSignature = firstNonEmpty(req.headers.get("x-razorpay-signature")).toLowerCase()
    const expectedSignature = (await hmacSha256Hex(rawBody, secret)).toLowerCase()
    if (!receivedSignature || !constantTimeEqual(receivedSignature, expectedSignature)) {
        return jsonResponse({ error: "Invalid webhook signature" }, 401)
    }

    const eventId = firstNonEmpty(req.headers.get("x-razorpay-event-id"))
    if (!eventId) return jsonResponse({ error: "Missing webhook event id" }, 400)

    let event: any
    try {
        event = JSON.parse(rawBody)
    } catch {
        return jsonResponse({ error: "Invalid JSON payload" }, 400)
    }

    const eventName = firstNonEmpty(event?.event)
    const identifiers = getEventIdentifiers(event)
    const rawBodyHash = await sha256Hex(rawBody)
    const supabaseUrl = firstNonEmpty(Deno.env.get("SUPABASE_URL"))
    const serviceRoleKey = firstNonEmpty(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Supabase configuration missing" }, 500)
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let reservation: { row: any; inserted: boolean }
    try {
        reservation = await reservePaymentEvent({
            supabase,
            eventId,
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            bookingId: identifiers.bookingId,
            rawBodyHash,
        })
    } catch (error: any) {
        console.error("[razorpay-webhook] event reservation failed", error)
        return jsonResponse({ error: "Webhook reservation failed" }, 500)
    }

    let eventRow = reservation.row
    let paymentApplied = false
    try {
        const claim = await claimPaymentEvent(supabase, eventRow)
        if (claim === "done") return jsonResponse({ ok: true, duplicate: true })

        if (claim === "sheet") {
            if (!eventRow.booking_id) throw new Error("Applied event has no booking reference")
            const booking = await loadBooking(supabase, eventRow.booking_id, eventRow.provider_order_id || "")
            if (!booking) throw new Error("Booking for Sheet retry was not found")
            try {
                const synced = await syncPaymentSheets({
                    booking,
                    eventId: eventRow.provider_event_id,
                    eventName: eventRow.event_type,
                    notes: eventRow.notes || eventRow.error_message || "Retrying payment Sheet projection",
                })
                eventRow = await updatePaymentEvent(supabase, eventRow.id, {
                    sheet_sync_status: synced ? "synced" : "not_required",
                    sheet_synced_at: synced ? new Date().toISOString() : null,
                    error_message: null,
                })
                return jsonResponse({ ok: true, duplicate: true, sheet_retried: true })
            } catch (sheetError: any) {
                await updatePaymentEvent(supabase, eventRow.id, {
                    sheet_sync_status: "failed",
                    error_message: String(sheetError?.message || sheetError).slice(0, 500),
                })
                return jsonResponse({ error: "Payment applied; Sheet projection failed" }, 500)
            }
        }

        if (!SUCCESS_EVENTS.has(eventName) && !FAILURE_EVENTS.has(eventName)) {
            eventRow = await updatePaymentEvent(supabase, eventRow.id, {
                verification_status: "ignored",
                processing_status: "ignored",
                sheet_sync_status: "not_required",
                processed_at: new Date().toISOString(),
                notes: `Unsupported Razorpay event: ${eventName || "unknown"}`,
            })
            return jsonResponse({ ok: true, ignored: true, event: eventName || "unknown" })
        }

        if (!identifiers.orderId) throw new InvalidWebhookError("Webhook payload has no order id")
        if (identifiers.bookingId && !/^[0-9a-f-]{36}$/i.test(identifiers.bookingId)) {
            throw new InvalidWebhookError("Webhook booking reference is invalid")
        }

        const booking = await loadBooking(supabase, identifiers.bookingId, identifiers.orderId)
        if (!booking) throw new InvalidWebhookError("Webhook booking is unknown")
        const attempt = await loadPaymentAttempt(supabase, booking, identifiers.orderId, identifiers.paymentId)
        validateOwnership({ booking, attempt, orderId: identifiers.orderId, paymentId: identifiers.paymentId })

        const credentials = razorpayCredentials()
        if (!credentials.keyId || !credentials.keySecret) {
            throw new GatewayUnavailableError("Razorpay API credentials are not configured")
        }
        const gatewayState = await verifyRazorpayState({
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            credentials,
        })

        const expectedAmountMinor = Math.max(
            0,
            Math.round(toNumber(attempt.amount_minor || (toNumber(booking.payable_now_amount || booking.total_amount) * 100))),
        )
        if (!isAmountMatch(gatewayState.amountMinor, expectedAmountMinor, 1)) {
            throw new InvalidWebhookError(
                `Razorpay payment amount ${gatewayState.amountMinor} does not match expected ${expectedAmountMinor}`,
            )
        }
        const expectedCurrency = firstNonEmpty(attempt.currency, booking.currency, "INR").toUpperCase()
        if (gatewayState.currency !== expectedCurrency) {
            throw new InvalidWebhookError(
                `Razorpay currency ${gatewayState.currency} does not match expected ${expectedCurrency}`,
            )
        }

        eventRow = await updatePaymentEvent(supabase, eventRow.id, {
            booking_id: booking.id,
            payment_attempt_id: attempt.id,
            provider_order_id: identifiers.orderId,
            provider_payment_id: identifiers.paymentId || null,
            amount_minor: gatewayState.amountMinor,
            currency: gatewayState.currency,
            verification_status: "verified",
            processing_status: "processing",
            verified_at: new Date().toISOString(),
            error_message: null,
        })

        const reconciliation = await reconcilePayment({
            supabase,
            booking,
            attempt,
            eventId,
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            amountMinor: gatewayState.amountMinor,
            currency: gatewayState.currency,
        })
        paymentApplied = true
        eventRow = await updatePaymentEvent(supabase, eventRow.id, {
            booking_id: reconciliation.booking.id,
            payment_attempt_id: attempt.id,
            provider_order_id: identifiers.orderId,
            provider_payment_id: identifiers.paymentId || null,
            amount_minor: gatewayState.amountMinor,
            currency: gatewayState.currency,
            verification_status: "verified",
            processing_status: "applied",
            sheet_sync_status: "pending",
            reconciliation_result: reconciliation.reconciliationResult,
            notes: reconciliation.notes,
            processed_at: new Date().toISOString(),
            error_message: null,
        })

        try {
            const synced = await syncPaymentSheets({
                booking: reconciliation.booking,
                eventId,
                eventName,
                notes: reconciliation.notes,
            })
            eventRow = await updatePaymentEvent(supabase, eventRow.id, {
                sheet_sync_status: synced ? "synced" : "not_required",
                sheet_synced_at: synced ? new Date().toISOString() : null,
                error_message: null,
            })
        } catch (sheetError: any) {
            await updatePaymentEvent(supabase, eventRow.id, {
                sheet_sync_status: "failed",
                error_message: String(sheetError?.message || sheetError).slice(0, 500),
            })
            return jsonResponse({ error: "Payment applied; Sheet projection failed" }, 500)
        }

        return jsonResponse({
            ok: true,
            event: eventName,
            booking_id: reconciliation.booking.id,
            payment_status: reconciliation.booking.payment_status,
            reconciliation_result: reconciliation.reconciliationResult,
        })
    } catch (error: any) {
        const message = String(error?.message || error || "Webhook processing failed")
        const invalid = error instanceof InvalidWebhookError || error?.code === "INVALID_WEBHOOK"
        const retryable = error instanceof GatewayUnavailableError || error?.code === "GATEWAY_UNAVAILABLE"
        console.error("[razorpay-webhook] processing failed", {
            eventId,
            eventName,
            orderId: identifiers.orderId,
            paymentId: identifiers.paymentId,
            message,
        })
        try {
            await updatePaymentEvent(supabase, eventRow.id, {
                verification_status: invalid ? "invalid" : eventRow.verification_status || "received",
                processing_status: paymentApplied ? "applied" : invalid ? "ignored" : "failed",
                sheet_sync_status: paymentApplied ? "failed" : "not_required",
                error_message: message.slice(0, 500),
                processed_at: invalid ? new Date().toISOString() : null,
            })
        } catch (ledgerError) {
            console.error("[razorpay-webhook] failed to record error", ledgerError)
        }
        if (invalid) return jsonResponse({ ok: true, ignored: true, reason: message })
        return jsonResponse({ error: retryable ? "Webhook verification temporarily unavailable" : "Webhook processing failed" }, 500)
    }
})
