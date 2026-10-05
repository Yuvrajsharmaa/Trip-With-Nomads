import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("payment idempotency migration creates booking, attempt, and event contracts", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261005090000_booking_payment_attempts.sql", import.meta.url),
    )

    assertStringIncludes(source, "checkout_request_id")
    assertStringIncludes(source, "bookings_checkout_request_id_uidx")
    assertStringIncludes(source, "create table if not exists public.payment_attempts")
    assertStringIncludes(source, "create table if not exists public.payment_events")
    assertStringIncludes(source, "provider_event_id")
    assertStringIncludes(source, "processing")
    assertStringIncludes(source, "sheet_sync_status")
    assertStringIncludes(source, "reconciliation_result")
    assertStringIncludes(source, "payment_attempts_one_open_per_booking_uidx")
    assertStringIncludes(source, "enable row level security")
})
