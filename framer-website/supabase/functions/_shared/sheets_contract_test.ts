import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    currentRowAction,
    hasExactHeaders,
    resolvePaymentHistoryRow,
    rowMatchesColumnFingerprint,
    withSheetProjectionLock,
} from "./sheets.ts"

Deno.test("current-state Sheet projection has explicit zero/one/multiple behavior", () => {
    assertEquals(currentRowAction(0), "append")
    assertEquals(currentRowAction(1), "update")
    assertEquals(currentRowAction(2), "fail")
})

Deno.test("header validation compares the complete row", () => {
    const expected = ["Booking ID", "Payment Status", "Notes"]
    assert(hasExactHeaders(["Booking ID", "Payment Status", "Notes"], expected))
    assert(!hasExactHeaders(["Booking ID"], expected))
    assert(!hasExactHeaders(["Booking ID", "Payment Status", "Old Notes"], expected))
})

Deno.test("history fingerprints match existing formatted dates after numeric writes", () => {
    const headers = ["Captured At", "Email", "Departure Date"]
    assert(
        rowMatchesColumnFingerprint(
            ["1 Mar 2026, 5:30 AM", "guest@example.com", "9 May 2026"],
            headers,
            [46082.229166666664, "guest@example.com", 46151],
            headers,
            headers,
        ),
    )
})

Deno.test("payment event fingerprints distinguish events within the same displayed minute", () => {
    const headers = ["Payment Date", "Booking Ref", "Payment Result"]
    const firstInstant = 46092.75342592593
    const secondInstant = firstInstant + 1 / 86_400_000

    assert(
        rowMatchesColumnFingerprint(
            [firstInstant, "TWN-2026-00123", "Paid"],
            headers,
            [firstInstant, "TWN-2026-00123", "Paid"],
            headers,
            headers,
        ),
    )
    assert(
        !rowMatchesColumnFingerprint(
            [firstInstant, "TWN-2026-00123", "Paid"],
            headers,
            [secondInstant, "TWN-2026-00123", "Paid"],
            headers,
            headers,
        ),
    )
})

Deno.test("Sheet projections serialize concurrent writes to the same tab", async () => {
    let held = false
    let active = 0
    let maximumActive = 0
    const fakeSupabase = {
        async rpc(name: string) {
            if (name === "acquire_sheet_projection_lock") {
                if (held) return { data: false, error: null }
                held = true
                return { data: true, error: null }
            }
            if (name === "release_sheet_projection_lock") {
                held = false
                return { data: true, error: null }
            }
            return { data: null, error: { message: `Unexpected RPC: ${name}` } }
        },
    }
    const action = async () => {
        active++
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 25))
        active--
    }

    await Promise.all([
        withSheetProjectionLock(fakeSupabase, "sheet-id", "Leads", action),
        withSheetProjectionLock(fakeSupabase, "sheet-id", "Leads", action),
    ])

    assertEquals(maximumActive, 1)
})

Deno.test("payment history uses a durable event row before fingerprint recovery", () => {
    assertEquals(
        resolvePaymentHistoryRow({
            mappedRow: 12,
            mappedRowMatches: true,
            mappedRowBlank: false,
            fingerprintMatches: [12],
            lastPopulatedRow: 18,
        }),
        { action: "reuse", row: 12 },
    )
    assertEquals(
        resolvePaymentHistoryRow({
            mappedRow: null,
            mappedRowMatches: false,
            mappedRowBlank: true,
            fingerprintMatches: [],
            lastPopulatedRow: 18,
        }),
        { action: "write", row: 19 },
    )
    assertEquals(
        resolvePaymentHistoryRow({
            mappedRow: null,
            mappedRowMatches: false,
            mappedRowBlank: true,
            fingerprintMatches: [8],
            lastPopulatedRow: 18,
            allowFingerprintRecovery: false,
        }),
        { action: "write", row: 19 },
    )
    assertEquals(
        resolvePaymentHistoryRow({
            mappedRow: null,
            mappedRowMatches: false,
            mappedRowBlank: true,
            fingerprintMatches: [5, 7],
            lastPopulatedRow: 18,
        }),
        { action: "conflict", row: null },
    )
    // Different Supabase payment-event rows get independent reservations even
    // when their human-readable Sheet values happen to be identical.
    assertEquals(
        resolvePaymentHistoryRow({
            mappedRow: 22,
            mappedRowMatches: true,
            mappedRowBlank: false,
            fingerprintMatches: [19, 22],
            lastPopulatedRow: 22,
        }),
        { action: "reuse", row: 22 },
    )
})

Deno.test("application Sheet helper never creates missing managed tabs", async () => {
    const source = await Deno.readTextFile(new URL("./sheets.ts", import.meta.url))
    assert(!source.includes("addSheet: { properties"))
    assert(source.includes("Managed Sheet tab not found"))
    assert(source.includes("appendHistoryRowOnce"))
    assert(source.includes("Current-state Sheet key is required"))
    assert(source.includes("History event key is required"))
    assert(source.includes("partially intersects a table"))
    assert(source.includes("retry without trying to replace the table's filter"))
    assert(source.includes("legacy table/range whose append"))
    assert(source.includes("anchor is offset from column A"))
    assert(source.includes("const rowNumber = Math.max(2, lastPopulatedRow + 1)"))
    assert(source.includes("History Sheet row append returned no row"))
    assert(source.includes('readTabValues(sheetId, tab, "A1:ZZ10000")'))
    assert(!source.includes('readTabValues(sheetId, tab, "A1:ZZ")'))
    assert(source.includes("moveUpdatedRowToBottom"))
    assert(source.includes("newest activity visibly land at the bottom"))
    assert(source.includes("deleteDimension"))
})

Deno.test("managed tab formatting supports the sales-facing contracts", async () => {
    const source = await Deno.readTextFile(new URL("./sheets.ts", import.meta.url))
    assert(source.includes('"Captured At"'))
    assert(source.includes('"Last Activity"'))
    assert(source.includes('"Reason / Activity"'))
    assert(source.includes('"Trip / Itinerary"'))
    assert(source.includes('"Paid"'))
    assert(source.includes('"Departure Date"'))
})

Deno.test("history projection can retry without a visible technical key", async () => {
    const source = await Deno.readTextFile(new URL("./sheets.ts", import.meta.url))
    const recordLead = await Deno.readTextFile(new URL("../record-lead/index.ts", import.meta.url))
    const leadProjection = await Deno.readTextFile(new URL("./lead_projection.ts", import.meta.url))
    const bookingSheets = await Deno.readTextFile(new URL("./booking_sheets.ts", import.meta.url))
    const webhook = await Deno.readTextFile(new URL("../razorpay-webhook/index.ts", import.meta.url))
    const createBooking = await Deno.readTextFile(new URL("../create-booking/index.ts", import.meta.url))
    assert(source.includes("appendHistoryRowOnceByFingerprint"))
    assert(source.includes("fields=sheets.properties(sheetId,title,gridProperties)"))
    assert(leadProjection.includes("appendHistoryRowOnceByFingerprint"))
    assert(leadProjection.includes("ABANDONED_BOOKING_HEADERS"))
    assert(bookingSheets.includes("ABANDONED_BOOKING_HEADERS"))
    assert(webhook.includes("appendPaymentHistoryRowOnceByEventRowId"))
    assert(webhook.includes("getSpreadsheetTabs"))
    assert(webhook.includes("eventRowId: eventRow.id"))
    assert(source.includes('from("payment_event_sheet_rows")'))
    assert(!source.includes("developerMetadata"))
    assert(!recordLead.includes('"Submission Key"'))
    assert(!webhook.includes('"Event ID"'))
    assert(createBooking.includes('"Booking Ref"'))
})
