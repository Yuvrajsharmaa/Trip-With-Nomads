import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("shared Finance schema adds nullable issuer and payment sync state fields", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261102121612_tri66_shared_finance_schema.sql", import.meta.url),
    )

    assertStringIncludes(source, "add column if not exists finance_issuer text")
    assertStringIncludes(source, "trips_finance_issuer_check")
    assertStringIncludes(source, "bookings_finance_issuer_check")
    assertStringIncludes(source, "finance_issuer in ('TWN', 'NTC')")
    assertStringIncludes(source, "finance_sync_status text not null default 'not_required'")
    assertStringIncludes(source, "finance_sync_attempts integer not null default 0")
    assertStringIncludes(source, "finance_synced_at timestamptz")
    assertStringIncludes(source, "finance_error text")
    assertStringIncludes(source, "finance_event_payload jsonb")
    assertStringIncludes(source, "payment_events_finance_sync_status_check")
})
