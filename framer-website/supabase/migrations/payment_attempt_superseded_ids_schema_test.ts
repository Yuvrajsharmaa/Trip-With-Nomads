import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry replay migration adds a backward-compatible superseded payment ID list", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261103100000_payment_attempt_superseded_payment_ids.sql", import.meta.url),
    )

    assertStringIncludes(source, "alter table public.payment_attempts")
    assertStringIncludes(source, "add column if not exists superseded_payment_ids text[]")
    assertStringIncludes(source, "not null default '{}'")

    const attemptLock = source.indexOf("from public.payment_attempts", source.indexOf("reconcile_website_payment_failure"))
    const bookingLock = source.indexOf("from public.bookings", attemptLock)
    assertEquals(attemptLock >= 0, true)
    assertEquals(bookingLock > attemptLock, true)
    assertStringIncludes(source.slice(attemptLock, bookingLock), "for update")
    assertStringIncludes(source.slice(bookingLock), "for update")
    assertStringIncludes(source, "superseded_payment_ids")
    assertStringIncludes(source, "grant execute on function public.reconcile_website_payment_failure")
    assertStringIncludes(source, "to service_role")
})
