import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    dateToSheetSerial,
    formattedSheetDateMatches,
    timestampToSheetSerial,
} from "./sheet_dates.ts"

Deno.test("timestamps become numeric Sheets serials in India time", () => {
    assertEquals(timestampToSheetSerial("2026-03-01T00:00:00.000Z"), 46082.229166666664)
    assertEquals(timestampToSheetSerial("2026-03-11T12:34:56.000Z"), 46092.75342592593)
    assertEquals(timestampToSheetSerial(""), "")
    assertEquals(timestampToSheetSerial("not-a-date"), "not-a-date")
})

Deno.test("date-only values remain stable calendar dates", () => {
    assertEquals(dateToSheetSerial("2026-05-09"), 46151)
    assertEquals(dateToSheetSerial("2026-02-30"), "2026-02-30")
    assertEquals(dateToSheetSerial(""), "")
})

Deno.test("formatted legacy date cells match numeric fingerprint values", () => {
    assertEquals(
        formattedSheetDateMatches("1 Mar 2026, 5:30 AM", 46082.229166666664, false),
        true,
    )
    assertEquals(
        formattedSheetDateMatches("11 Mar 2026, 6:04 PM IST", 46092.75342592593, false),
        true,
    )
    assertEquals(formattedSheetDateMatches("9 May 2026", 46151, true), true)
    assertEquals(formattedSheetDateMatches("10 May 2026", 46151, true), false)
    assertEquals(formattedSheetDateMatches("11 Mar 2026, 6:05 PM", 46092.75342592593, false), false)
})
