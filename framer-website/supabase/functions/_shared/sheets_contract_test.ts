import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { currentRowAction, hasExactHeaders } from "./sheets.ts"

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
    const webhook = await Deno.readTextFile(new URL("../razorpay-webhook/index.ts", import.meta.url))
    const createBooking = await Deno.readTextFile(new URL("../create-booking/index.ts", import.meta.url))
    assert(source.includes("appendHistoryRowOnceByFingerprint"))
    assert(leadProjection.includes("appendHistoryRowOnceByFingerprint"))
    assert(webhook.includes("appendHistoryRowOnceByFingerprint"))
    assert(!recordLead.includes('"Submission Key"'))
    assert(!webhook.includes('"Event ID"'))
    assert(createBooking.includes('"Booking Ref"'))
})
