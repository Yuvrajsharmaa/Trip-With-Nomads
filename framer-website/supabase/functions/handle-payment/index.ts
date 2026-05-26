import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildBookingSheetRow, BOOKING_HEADERS } from "../_shared/booking_sheets.ts"
import {
    BOOKING_CALLBACK_HEADERS,
    buildBookingCallbackRow,
} from "../_shared/booking_callback_sheets.ts"
import {
    issueBookingStatusToken,
    resolveBookingStatusSecret,
} from "../_shared/booking_status_token.ts"
import {
    appendRow,
    findRowByColumnValue,
    safeUpdateRow,
    sheetsEnabled,
} from "../_shared/sheets.ts"

type PaymentGateway = "payu" | "razorpay"

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function firstNonEmpty(...values: any[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

async function readRequestPayload(req: Request): Promise<Record<string, string>> {
    const payload: Record<string, string> = {}
    const contentType = String(req.headers.get("content-type") || "").toLowerCase()

    const assignValue = (key: string, value: unknown) => {
        const safeKey = String(key || "").trim()
        if (!safeKey) return
        payload[safeKey] = String(value ?? "")
    }

    const parseJsonObject = (source: unknown) => {
        if (!source || typeof source !== "object" || Array.isArray(source)) return
        for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
            if (value == null) continue
            if (typeof value === "object") {
                assignValue(key, JSON.stringify(value))
            } else {
                assignValue(key, value)
            }
        }
    }

    const parseUrlEncoded = (rawBody: string) => {
        if (!rawBody || !rawBody.trim()) return
        const params = new URLSearchParams(rawBody)
        for (const [key, value] of params.entries()) {
            assignValue(key, value)
        }
    }

    const rawBody = await req.clone().text().catch(() => "")
    if (rawBody.trim()) {
        if (contentType.includes("application/json")) {
            try {
                parseJsonObject(JSON.parse(rawBody))
            } catch {
                parseUrlEncoded(rawBody)
            }
        } else {
            parseUrlEncoded(rawBody)
            if (Object.keys(payload).length === 0) {
                try {
                    parseJsonObject(JSON.parse(rawBody))
                } catch {
                    // Non-JSON body: ignore and try multipart fallback below.
                }
            }
        }
    }

    if (Object.keys(payload).length === 0 && contentType.includes("multipart/form-data")) {
        const formData = await req.clone().formData().catch(() => null)
        if (formData) {
            for (const [key, value] of formData.entries()) {
                assignValue(key, value?.toString?.() ?? value)
            }
        }
    }

    return payload
}

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

function isMissingColumnError(error: any, columnName: string): boolean {
    const needle = String(columnName || "").trim().toLowerCase()
    if (!needle) return false
    const message = String(error?.message || error?.details || error?.hint || error || "")
        .trim()
        .toLowerCase()
    return message.includes("column") && message.includes(needle)
}

function bookingSheetsWriteEnabled(): boolean {
    return isTruthy(Deno.env.get("BOOKING_SHEETS_WRITE_ENABLED"))
}

function resolvePaymentGatewayFromEnv(): PaymentGateway {
    const raw = String(Deno.env.get("PAYMENT_GATEWAY") || "payu").trim().toLowerCase()
    return raw === "razorpay" ? "razorpay" : "payu"
}

function resolveGatewayTestMode(gateway: PaymentGateway): boolean {
    const explicit = Deno.env.get("PAYMENT_GATEWAY_TEST_MODE")
    if (explicit != null && explicit !== "") return isTruthy(explicit)
    if (gateway === "razorpay") {
        const razorpayMode = Deno.env.get("RAZORPAY_TEST_MODE")
        if (razorpayMode != null && razorpayMode !== "") return isTruthy(razorpayMode)
    }
    return isTruthy(Deno.env.get("PAYU_TEST_MODE"))
}

function inferGatewayFromPayload(payload: Record<string, string>, url: URL): PaymentGateway {
    const fromQuery = String(url.searchParams.get("gateway") || "").trim().toLowerCase()
    if (fromQuery === "razorpay" || fromQuery === "payu") return fromQuery as PaymentGateway
    if (payload.razorpay_signature || payload.razorpay_order_id || payload.razorpay_payment_id) {
        return "razorpay"
    }
    return resolvePaymentGatewayFromEnv()
}

async function sha512Hex(message: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(message))
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    )
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
}

serve(async (req) => {
    try {
        const payload = await readRequestPayload(req)

        const requestUrl = new URL(req.url)
        const gateway = inferGatewayFromPayload(payload, requestUrl)
        const bookingIdFromQuery = String(requestUrl.searchParams.get("booking_id") || "").trim()
        const isGatewayTestMode = resolveGatewayTestMode(gateway)

        const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        if (!supabaseUrl || !serviceRoleKey) {
            return new Response("Missing Supabase configuration", { status: 500 })
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)

        const payuKey = gateway === "payu"
            ? (isGatewayTestMode
                ? Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY")
                : Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY")) || ""
            : ""
        const payuSalt = gateway === "payu"
            ? (isGatewayTestMode
                ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
                : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")) || ""
            : ""
        const razorpayKeySecret = gateway === "razorpay"
            ? (isGatewayTestMode
                ? Deno.env.get("RAZORPAY_TEST_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET")
                : Deno.env.get("RAZORPAY_LIVE_KEY_SECRET") || Deno.env.get("RAZORPAY_KEY_SECRET")) || ""
            : ""
        const razorpayKeyId = gateway === "razorpay"
            ? (isGatewayTestMode
                ? Deno.env.get("RAZORPAY_TEST_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID")
                : Deno.env.get("RAZORPAY_LIVE_KEY_ID") || Deno.env.get("RAZORPAY_KEY_ID")) || ""
            : ""

        if (gateway === "payu" && (!payuKey || !payuSalt)) {
            return new Response("Missing PayU configuration", { status: 500 })
        }
        if (gateway === "razorpay" && (!razorpayKeySecret || !razorpayKeyId)) {
            return new Response("Missing Razorpay configuration", { status: 500 })
        }

        const payuStatus = String(payload.status || "").trim().toLowerCase()
        const payuTxnId = String(payload.txnid || "").trim()
        const payuAmount = String(payload.amount || "").trim()
        const payuProductInfo = String(payload.productinfo || "").trim()
        const payuFirstName = String(payload.firstname || "").trim()
        const payuEmail = String(payload.email || "").trim()
        const payuUdf1 = String(payload.udf1 || "").trim()
        const payuMihpayid = String(payload.mihpayid || "").trim()
        const payuHash = String(payload.hash || "").trim()
        const payuIncomingKey = String(payload.key || "").trim()

        const razorpayPaymentId = String(payload.razorpay_payment_id || payload["error[metadata][payment_id]"] || "")
            .trim()
        const razorpayOrderId = String(payload.razorpay_order_id || payload["error[metadata][order_id]"] || "")
            .trim()
        const razorpaySignature = String(payload.razorpay_signature || "").trim()
        const razorpayErrorCode = String(payload["error[code]"] || payload.error_code || "").trim().toLowerCase()

        let bookingId = firstNonEmpty(
            bookingIdFromQuery,
            payuUdf1
        )

        if (!bookingId && gateway === "razorpay" && razorpayOrderId) {
            const lookup = await supabase
                .from("bookings")
                .select("id")
                .eq("payment_gateway_order_or_ref_id", razorpayOrderId)
                .maybeSingle()
            if (!lookup.error && lookup.data?.id) {
                bookingId = String(lookup.data.id || "").trim()
            }
        }

        if (!bookingId) return new Response("Missing booking id", { status: 400 })

        let supportsBalanceDueNote = true
        let { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, trip_id, departure_date, name, email, phone, travellers, payment_breakdown, coupon_code, subtotal_amount, discount_amount, tax_amount, total_amount, payment_mode, payable_now_amount, due_amount, paid_amount, payment_status, settlement_status, payment_gateway_txn_id, payment_gateway_order_or_ref_id, balance_due_note, created_at"
            )
            .eq("id", bookingId)
            .single()

        if (bookingError && isMissingColumnError(bookingError, "balance_due_note")) {
            supportsBalanceDueNote = false
            const fallback = await supabase
                .from("bookings")
                .select(
                    "id, booking_ref, trip_id, departure_date, name, email, phone, travellers, payment_breakdown, coupon_code, subtotal_amount, discount_amount, tax_amount, total_amount, payment_mode, payable_now_amount, due_amount, paid_amount, payment_status, settlement_status, payment_gateway_txn_id, payment_gateway_order_or_ref_id, created_at"
                )
                .eq("id", bookingId)
                .single()
            booking = fallback.data as any
            bookingError = fallback.error
        }

        if (bookingError || !booking) {
            console.error("[handle-payment] booking fetch error", bookingError)
            return new Response("Booking not found", { status: 404 })
        }

        let tripTitle = ""
        let tripSlug = ""
        if (booking?.trip_id) {
            const tripRes = await supabase
                .from("trips")
                .select("title, slug")
                .eq("id", booking.trip_id)
                .maybeSingle()
            if (!tripRes.error && tripRes.data) {
                tripTitle = String(tripRes.data.title || "").trim()
                tripSlug = String(tripRes.data.slug || "").trim()
            }
        }

        const notes: string[] = []
        let isValid = false
        let isSuccess = false
        let isPending = false
        let isFailed = false
        let callbackAmount = 0
        let gatewayTxnId = ""
        let gatewayOrderOrRefId = ""

        if (gateway === "payu") {
            const safeUdf1 = bookingId
            const safeEmail = String(payuEmail || booking?.email || "").trim()
            const safeFirstname = String(
                payuFirstName || (booking?.name ? String(booking.name).split(" ")[0] : "") || ""
            ).trim()
            const safeProductinfo = String(payuProductInfo || "Trip Booking").trim()
            const fallbackAmount =
                toNumber(booking?.payable_now_amount) > 0
                    ? toNumber(booking?.payable_now_amount)
                    : toNumber(booking?.total_amount)
            const safeAmount = String(payuAmount || (fallbackAmount > 0 ? fallbackAmount.toFixed(2) : "")).trim()
            const safeTxnid = String(payuTxnId || "").trim()
            const safeKey = String(payuKey || "").trim()
            const incomingKey = String(payuIncomingKey || "").trim()
            const normalizedStatus = String(payuStatus || "").trim().toLowerCase()

            const hashString = `${payuSalt}|${normalizedStatus}||||||||||${safeUdf1}|${safeEmail}|${safeFirstname}|${safeProductinfo}|${safeAmount}|${safeTxnid}|${safeKey}`
            const calculatedHash = await sha512Hex(hashString)
            const hashMatches = calculatedHash.toLowerCase() === String(payuHash || "").trim().toLowerCase()
            const keyMatches = safeKey.length > 0 && safeKey === incomingKey
            isValid = hashMatches && keyMatches
            isSuccess = normalizedStatus === "success" && isValid
            isPending = normalizedStatus === "pending" && isValid
            isFailed = (normalizedStatus === "failure" || normalizedStatus === "failed") && isValid
            callbackAmount = round2(Math.max(0, toNumber(payuAmount)))
            gatewayTxnId = safeTxnid
            gatewayOrderOrRefId = String(payuMihpayid || "").trim()

            if (!keyMatches) notes.push("PayU key mismatch; callback ignored")
            if (!hashMatches) notes.push("PayU hash mismatch; callback ignored")
        } else {
            const orderMatches = Boolean(
                razorpayOrderId &&
                    (
                        !booking?.payment_gateway_order_or_ref_id ||
                        String(booking.payment_gateway_order_or_ref_id).trim() === razorpayOrderId
                    )
            )
            const hasSuccessPayload = Boolean(razorpayPaymentId && razorpayOrderId && razorpaySignature)
            const signatureMessage = `${razorpayOrderId}|${razorpayPaymentId}`
            const calculatedSignature = hasSuccessPayload
                ? await hmacSha256Hex(signatureMessage, razorpayKeySecret)
                : ""
            const signatureMatches = hasSuccessPayload &&
                calculatedSignature.toLowerCase() === razorpaySignature.toLowerCase()

            isValid = (hasSuccessPayload && signatureMatches && orderMatches) || (!hasSuccessPayload && orderMatches)
            isSuccess = hasSuccessPayload && signatureMatches && orderMatches
            isPending = false
            isFailed = !isSuccess
            callbackAmount = 0
            gatewayTxnId = razorpayPaymentId || String(booking?.payment_gateway_txn_id || "").trim()
            gatewayOrderOrRefId = razorpayOrderId || String(booking?.payment_gateway_order_or_ref_id || "").trim()

            if (!orderMatches) notes.push("Razorpay order mismatch; callback ignored")
            if (hasSuccessPayload && !signatureMatches) notes.push("Razorpay signature mismatch; callback ignored")
            if (!hasSuccessPayload) {
                notes.push("Razorpay failure callback received")
                if (razorpayErrorCode) notes.push(`Razorpay error: ${razorpayErrorCode}`)
            }
        }

        const totalAmount = round2(Math.max(0, toNumber(booking?.total_amount)))
        const paymentMode =
            String(booking?.payment_mode || "").trim().toLowerCase() === "partial_25"
                ? "partial_25"
                : "full"
        const expectedPayableNow = round2(
            Math.max(0, toNumber(booking?.payable_now_amount || booking?.total_amount))
        )
        const effectivePaidAmount = round2(
            Math.max(
                0,
                callbackAmount > 0
                    ? callbackAmount
                    : expectedPayableNow > 0
                        ? expectedPayableNow
                        : totalAmount
            )
        )

        const settlementStatus =
            isSuccess && (paymentMode === "partial_25" || totalAmount > effectivePaidAmount)
                ? "partially_paid"
                : isSuccess
                    ? "fully_paid"
                    : isPending
                        ? "pending"
                        : "failed"

        const nextPaymentStatus = isSuccess ? "paid" : isPending ? "pending" : "failed"
        const dueAmount = isSuccess
            ? round2(Math.max(0, totalAmount - effectivePaidAmount))
            : toNumber(booking?.due_amount)
        const nextPaidAmount = isSuccess ? effectivePaidAmount : toNumber(booking?.paid_amount)

        const updatePayload: Record<string, any> = {}
        let updatedBooking: any = booking
        let updateError: any = null

        if (isValid) {
            updatePayload.payment_status = nextPaymentStatus
            updatePayload.settlement_status = settlementStatus
            updatePayload.payment_gateway_order_or_ref_id = gatewayOrderOrRefId || null
            updatePayload.payment_gateway_txn_id = gatewayTxnId || null

            if (isSuccess) {
                updatePayload.paid_amount = nextPaidAmount
                updatePayload.due_amount = dueAmount
                if (supportsBalanceDueNote) {
                    updatePayload.balance_due_note =
                        dueAmount > 0
                            ? `₹${dueAmount.toLocaleString("en-IN")} due on-site before trip departure.`
                            : null
                }
            }

            let updateResult = await supabase
                .from("bookings")
                .update(updatePayload)
                .eq("id", bookingId)
                .select("*")
                .single()

            updatedBooking = updateResult.data || booking
            updateError = updateResult.error

            if (
                updateError &&
                supportsBalanceDueNote &&
                isMissingColumnError(updateError, "balance_due_note")
            ) {
                const fallbackUpdatePayload = { ...updatePayload }
                delete fallbackUpdatePayload.balance_due_note
                updateResult = await supabase
                    .from("bookings")
                    .update(fallbackUpdatePayload)
                    .eq("id", bookingId)
                    .select("*")
                    .single()
                updatedBooking = updateResult.data || booking
                updateError = updateResult.error
                supportsBalanceDueNote = false
            }

            if (updateError) {
                console.error("[handle-payment] booking update error", updateError)
            }
        } else {
            console.warn("[handle-payment] callback authenticity check failed; booking not updated", {
                bookingId,
                gateway,
                payload,
            })
        }

        const finalBooking = {
            ...booking,
            ...updatePayload,
            paid_amount: isSuccess ? nextPaidAmount : toNumber(booking?.paid_amount),
            due_amount: isSuccess ? dueAmount : toNumber(booking?.due_amount),
            payable_now_amount: expectedPayableNow,
            total_amount: totalAmount,
            balance_due_note:
                isSuccess && dueAmount > 0
                    ? `₹${dueAmount.toLocaleString("en-IN")} due on-site before trip departure.`
                    : (booking as any)?.balance_due_note ?? null,
        }

        const eventStage = !isValid
            ? "invalid_callback"
            : isSuccess
                ? "paid_callback"
                : isPending
                    ? "pending_callback"
                    : "failed_callback"

        if (callbackAmount > 0 && expectedPayableNow > 0 && Math.abs(callbackAmount - expectedPayableNow) >= 0.5) {
            notes.push(
                `Callback amount ${callbackAmount.toFixed(2)} differs from expected ${expectedPayableNow.toFixed(2)}`
            )
        }

        const bookingsSheetId = firstNonEmpty(
            Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
            Deno.env.get("GOOGLE_SHEET_ID"),
        )
        const callbackSheetId = firstNonEmpty(
            Deno.env.get("BOOKING_CALLBACK_SHEET_ID"),
            Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
            Deno.env.get("GOOGLE_SHEET_ID")
        )
        const bookingsSheetTab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
        const successSheetTab = firstNonEmpty(Deno.env.get("BOOKING_SUCCESS_SHEET_TAB"), "Bookings_Success")
        const failedSheetTab = firstNonEmpty(Deno.env.get("BOOKING_FAILED_SHEET_TAB"), "Bookings_Failed")

        if (bookingSheetsWriteEnabled() && sheetsEnabled() && (bookingsSheetId || callbackSheetId)) {
            const callbackTab = isSuccess ? successSheetTab : failedSheetTab
            const callbackRow = buildBookingCallbackRow({
                booking: updatedBooking || finalBooking,
                tripTitle,
                tripSlug,
                notes: notes.join("; "),
            })

            try {
                if (bookingsSheetId) {
                    const rowValues = buildBookingSheetRow({
                        booking: updatedBooking || finalBooking,
                        eventStage,
                        notes: notes.join("; "),
                    })

                    const existingRow = await findRowByColumnValue(
                        bookingsSheetId,
                        bookingsSheetTab,
                        "Booking ID",
                        bookingId,
                        BOOKING_HEADERS
                    )

                    if (existingRow) {
                        await safeUpdateRow(
                            bookingsSheetId,
                            bookingsSheetTab,
                            existingRow,
                            rowValues,
                            BOOKING_HEADERS
                        )
                    } else {
                        const orphanRowValues = buildBookingSheetRow({
                            booking: updatedBooking || finalBooking,
                            eventStage: "callback_orphan",
                            notes: [
                                `Original stage: ${eventStage}`,
                                notes.join("; "),
                                "No created row found by Booking ID; appended orphan callback row.",
                            ]
                                .filter(Boolean)
                                .join("; "),
                        })
                        await appendRow(
                            bookingsSheetId,
                            bookingsSheetTab,
                            orphanRowValues,
                            BOOKING_HEADERS
                        )
                    }
                }

                if ((isSuccess || (!isSuccess && !isPending)) && callbackSheetId) {
                    await appendRow(
                        callbackSheetId,
                        callbackTab,
                        callbackRow,
                        BOOKING_CALLBACK_HEADERS
                    )
                }
            } catch (sheetErr) {
                console.error("[handle-payment] sheets sync failed", {
                    bookingsSheetId,
                    callbackSheetId,
                    error: sheetErr,
                })
            }
        } else if (sheetsEnabled() && (bookingsSheetId || callbackSheetId)) {
            console.log("[handle-payment] booking sheets write skipped (BOOKING_SHEETS_WRITE_ENABLED is false)")
        }

        const siteBase =
            Deno.env.get("SITE_URL") ||
            Deno.env.get("PAYMENT_REDIRECT_BASE_URL") ||
            "https://tripwithnomads.com"
        const targetPage = isSuccess ? "payment-success" : "payment-failed"
        const normalizedSiteBase = siteBase.replace(/\/$/, "")
        const baseOrigin = /^https?:\/\//i.test(normalizedSiteBase)
            ? normalizedSiteBase
            : `https://${normalizedSiteBase}`
        const basePath = `${baseOrigin}/${targetPage}`
        const redirectUrlObject = new URL(basePath)
        redirectUrlObject.searchParams.set("booking_id", bookingId)
        redirectUrlObject.searchParams.set("payment_status", nextPaymentStatus)

        const bookingStatusSecret = resolveBookingStatusSecret(
            gateway === "payu" ? payuSalt : razorpayKeySecret
        )
        if (bookingStatusSecret) {
            try {
                const statusToken = await issueBookingStatusToken(bookingId, bookingStatusSecret)
                redirectUrlObject.searchParams.set("status_token", statusToken.token)
            } catch (tokenErr) {
                console.error("[handle-payment] status token generation failed", tokenErr)
            }
        }
        const redirectUrl = redirectUrlObject.toString()

        console.log(`🚀 Redirecting to: ${redirectUrl}`)
        return Response.redirect(redirectUrl, 303)
    } catch (err) {
        console.error("💥 Handle Payment Error:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
})
