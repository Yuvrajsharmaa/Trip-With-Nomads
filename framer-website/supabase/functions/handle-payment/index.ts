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

function bookingLifecycleSheetsWriteEnabled(): boolean {
    return isTruthy(Deno.env.get("BOOKING_LIFECYCLE_SHEETS_WRITE_ENABLED"))
}

serve(async (req) => {
    try {
        const formData = await req.formData()
        const data: Record<string, string> = {}
        for (const [key, value] of formData.entries()) {
            data[key] = value.toString()
        }

        console.log("📥 PayU Response:", data)

        const {
            status,
            txnid,
            amount,
            productinfo,
            firstname,
            email,
            udf1,
            mihpayid,
            hash: receivedHash,
            key,
        } = data

        const bookingId = String(udf1 || "").trim()
        if (!bookingId) return new Response("Missing booking id", { status: 400 })

        const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        if (!supabaseUrl || !serviceRoleKey) {
            return new Response("Missing Supabase configuration", { status: 500 })
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)

        const isTest = Deno.env.get("PAYU_TEST_MODE") === "true"
        const payuSalt = isTest
            ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
            : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")

        if (!payuSalt) return new Response("Missing payment salt", { status: 500 })

        let supportsBalanceDueNote = true
        let { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select(
                "id, booking_ref, trip_id, departure_date, name, email, phone, travellers, payment_breakdown, coupon_code, subtotal_amount, discount_amount, tax_amount, total_amount, payment_mode, payable_now_amount, due_amount, paid_amount, payment_status, settlement_status, payu_txnid, payu_mihpayid, balance_due_note, created_at"
            )
            .eq("id", bookingId)
            .single()

        if (bookingError && isMissingColumnError(bookingError, "balance_due_note")) {
            supportsBalanceDueNote = false
            const fallback = await supabase
                .from("bookings")
                .select(
                    "id, booking_ref, trip_id, departure_date, name, email, phone, travellers, payment_breakdown, coupon_code, subtotal_amount, discount_amount, tax_amount, total_amount, payment_mode, payable_now_amount, due_amount, paid_amount, payment_status, settlement_status, payu_txnid, payu_mihpayid, created_at"
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

        const safeUdf1 = bookingId
        const safeEmail = String(email || booking?.email || "").trim()
        const safeFirstname = String(
            firstname || (booking?.name ? String(booking.name).split(" ")[0] : "") || ""
        ).trim()
        const safeProductinfo = String(productinfo || "Trip Booking").trim()
        const fallbackAmount =
            toNumber(booking?.payable_now_amount) > 0
                ? toNumber(booking?.payable_now_amount)
                : toNumber(booking?.total_amount)
        const safeAmount = String(amount || (fallbackAmount > 0 ? fallbackAmount.toFixed(2) : "")).trim()
        const safeTxnid = String(txnid || "").trim()
        const safeKey = String(key || "").trim()
        const normalizedStatus = String(status || "").trim().toLowerCase()

        const hashString = `${payuSalt}|${normalizedStatus}||||||||||${safeUdf1}|${safeEmail}|${safeFirstname}|${safeProductinfo}|${safeAmount}|${safeTxnid}|${safeKey}`
        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const calculatedHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        const isValid =
            calculatedHash.toLowerCase() === String(receivedHash || "").trim().toLowerCase()
        const isSuccess = normalizedStatus === "success" && isValid
        const isPending = normalizedStatus === "pending"

        const totalAmount = round2(Math.max(0, toNumber(booking?.total_amount)))
        const paymentMode =
            String(booking?.payment_mode || "").trim().toLowerCase() === "partial_25"
                ? "partial_25"
                : "full"
        const callbackAmount = round2(Math.max(0, toNumber(amount)))
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

        const updatePayload: Record<string, any> = {
            payment_status: nextPaymentStatus,
            settlement_status: settlementStatus,
            payu_mihpayid: mihpayid || null,
            payu_txnid: safeTxnid || null,
        }

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

        let { data: updatedBooking, error: updateError } = await supabase
            .from("bookings")
            .update(updatePayload)
            .eq("id", bookingId)
            .select("*")
            .single()

        if (
            updateError &&
            supportsBalanceDueNote &&
            isMissingColumnError(updateError, "balance_due_note")
        ) {
            const fallbackUpdatePayload = { ...updatePayload }
            delete fallbackUpdatePayload.balance_due_note
            const fallbackUpdate = await supabase
                .from("bookings")
                .update(fallbackUpdatePayload)
                .eq("id", bookingId)
                .select("*")
                .single()
            updatedBooking = fallbackUpdate.data
            updateError = fallbackUpdate.error
            supportsBalanceDueNote = false
        }

        if (updateError) {
            console.error("[handle-payment] booking update error", updateError)
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

        const eventStage = isSuccess ? "paid_callback" : isPending ? "pending_callback" : "failed_callback"
        const notes: string[] = []

        if (normalizedStatus === "success" && !isValid) {
            notes.push("PayU hash mismatch; callback marked failed")
        }

        if (callbackAmount > 0 && expectedPayableNow > 0 && Math.abs(callbackAmount - expectedPayableNow) >= 0.5) {
            notes.push(
                `Callback amount ${callbackAmount.toFixed(2)} differs from expected ${expectedPayableNow.toFixed(2)}`
            )
        }

        const bookingsSheetId = firstNonEmpty(
            Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
            Deno.env.get("GOOGLE_SHEET_ID"),
        )
        const callbackSheetId = String(Deno.env.get("BOOKING_CALLBACK_SHEET_ID") || "").trim()
        const bookingsSheetTab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
        const successSheetTab = firstNonEmpty(Deno.env.get("BOOKING_SUCCESS_SHEET_TAB"), "Bookings_Success")
        const failedSheetTab = firstNonEmpty(Deno.env.get("BOOKING_FAILED_SHEET_TAB"), "Bookings_Failed")
        const lifecycleSheetsEnabled = bookingLifecycleSheetsWriteEnabled()

        if (
            bookingSheetsWriteEnabled() &&
            sheetsEnabled() &&
            (callbackSheetId || (lifecycleSheetsEnabled && bookingsSheetId))
        ) {
            const callbackTab = isSuccess ? successSheetTab : failedSheetTab
            const callbackRow = buildBookingCallbackRow({
                booking: updatedBooking || finalBooking,
                tripTitle,
                tripSlug,
                notes: notes.join("; "),
            })

            try {
                if (lifecycleSheetsEnabled && bookingsSheetId) {
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

                // Append immutable callback outcomes to dedicated ops tabs on the callback sheet.
                if ((isSuccess || (!isSuccess && !isPending)) && callbackSheetId) {
                    await appendRow(
                        callbackSheetId,
                        callbackTab,
                        callbackRow,
                        BOOKING_CALLBACK_HEADERS
                    )
                } else if (isSuccess || (!isSuccess && !isPending)) {
                    console.error(
                        "[handle-payment] callback sheet skipped: BOOKING_CALLBACK_SHEET_ID is missing"
                    )
                }
            } catch (sheetErr) {
                console.error("[handle-payment] sheets sync failed", {
                    bookingsSheetId,
                    callbackSheetId,
                    lifecycleSheetsEnabled,
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
        const redirectUrl = `${siteBase.replace(/\/$/, "")}/${targetPage}?booking_id=${bookingId}&payment_status=${nextPaymentStatus}`

        console.log(`🚀 Redirecting to: ${redirectUrl}`)
        return Response.redirect(redirectUrl, 303)
    } catch (err) {
        console.error("💥 Handle Payment Error:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
})
