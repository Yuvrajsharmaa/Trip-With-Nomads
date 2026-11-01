import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isAvailableDateKey, todayISTDateKey } from "./pricing.ts"

Deno.test("display availability follows the India calendar date and rejects invalid dates", () => {
    const boundaryCases = [
        ["2026-10-05T18:29:59.999Z", "2026-10-05"],
        ["2026-10-05T18:30:00.000Z", "2026-10-06"],
        ["2026-10-05T23:59:59.999Z", "2026-10-06"],
        ["2026-10-06T00:00:00.000Z", "2026-10-06"],
    ] as const

    for (const [instant, expected] of boundaryCases) {
        assertEquals(todayISTDateKey(new Date(instant)), expected)
    }

    assertEquals(isAvailableDateKey("2026-10-05", "2026-10-06"), false)
    assertEquals(isAvailableDateKey("2026-10-06", "2026-10-06"), true)
    assertEquals(isAvailableDateKey("2026-10-07", "2026-10-06"), true)
    assertEquals(isAvailableDateKey("2024-02-29", "2024-02-29"), true)
    assertEquals(isAvailableDateKey("2026-02-29", "2026-02-28"), false)
    assertEquals(isAvailableDateKey("2026-02-30", "2026-10-06"), false)
    assertEquals(isAvailableDateKey("2026-10-06", "2026-02-30"), false)
    assertEquals(isAvailableDateKey("", "2026-10-06"), false)
})
