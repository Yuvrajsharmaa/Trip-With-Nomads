import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isBookableDepartureDate, normalizeDateKey, todayDateKey } from "./checkout_date_rules.ts"

Deno.test("checkout date rules keep today and future dates, excluding past dates", () => {
    const now = new Date("2026-10-06T04:30:00.000Z") // 10:00 IST
    assertEquals(todayDateKey(now), "2026-10-06")
    assertEquals(normalizeDateKey("2026-10-05T18:30:00.000Z"), "2026-10-06")
    assertEquals(isBookableDepartureDate("2026-10-05", now), false)
    assertEquals(isBookableDepartureDate("2026-10-06", now), true)
    assertEquals(isBookableDepartureDate("2026-10-07", now), true)
})
