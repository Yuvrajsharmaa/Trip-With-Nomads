import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))
const projection = await Deno.readTextFile(new URL("../_shared/lead_projection.ts", import.meta.url))
const wrapper = await Deno.readTextFile(new URL("../../../framer/EmailPopupOverride.tsx", import.meta.url))
const migration = await Deno.readTextFile(
    new URL("../../migrations/20261006100000_lead_submission_idempotency.sql", import.meta.url),
)
const routing = await Deno.readTextFile(new URL("../_shared/lead_routing.ts", import.meta.url))

Deno.test("record-lead requires durable submission identity and retries Sheet projection", () => {
    assertStringIncludes(source, "submission_id")
    assertStringIncludes(source, "lead_identities")
    assertStringIncludes(source, "lead_submissions")
    assertStringIncludes(source, "normalizedEmail")
    assertStringIncludes(source, "SHEET_SYNC_FAILED")
    assertStringIncludes(source, "configuration_missing")
    assertStringIncludes(source, "trip_itinerary_download")
    assertStringIncludes(source, "projectLeadSheets")
    assertStringIncludes(source, "retry-lead-sheets")
    assertStringIncludes(source, "EdgeRuntime")
    assertStringIncludes(source, "waitUntil")
    assertStringIncludes(source, 'sheet_sync_status: "pending"')
    assertStringIncludes(source, 'projection: "background"')
    assertStringIncludes(source, ".range(offset, offset + pageSize - 1)")
    assertStringIncludes(source, "utm_term")
    assertStringIncludes(projection, "GOOGLE_SHEET_ID_CUSTOM_TRIPS")
    assertStringIncludes(projection, "GOOGLE_SHEET_ID_TRIP_LEADS")
    assert(!projection.includes("GOOGLE_SHEET_ID_TRIPS"))
    assertStringIncludes(projection, "booking_abandoned")
    assertStringIncludes(projection, "GOOGLE_SHEET_ID_MASTER")
    assertStringIncludes(projection, "Master Leads")
    assert(projection.includes('"Master Leads"') && projection.includes('normalizeEmail(params.lead.email)'))
    assertStringIncludes(source, "LEAD_ID_CONFLICT")
    assertStringIncludes(source, "does not belong")
    assertStringIncludes(source, "notes: compact(body?.notes)")
    assertStringIncludes(source, "notes: firstNonEmpty(body?.notes, existingLead?.notes)")
    assertStringIncludes(source, "canonicalIdempotencyPayload")
    assertStringIncludes(source, "existingPayloadHash")
})

Deno.test("lead routing is explicit and custom tabs remain configuration-gated", () => {
    assertStringIncludes(routing, "Custom Trip Leads")
    assertStringIncludes(routing, "env.custom")
    assertStringIncludes(routing, "never creates them")
})

Deno.test("lead wrappers use one guarded event path", () => {
    assertStringIncludes(wrapper, "getSubmissionId")
    assertStringIncludes(wrapper, "submission_id")
    assertStringIncludes(wrapper, "onSubmit={undefined}")
    assertStringIncludes(wrapper, "withPartialFillTracking")
    assertStringIncludes(wrapper, '"partial_fill"')
    assertStringIncludes(wrapper, "IDEMPOTENCY_CONFLICT")
    assert(wrapper.includes("event?.preventDefault?.()"))
})

Deno.test("lead idempotency state is internal and creates no Sheet tab", () => {
    assertStringIncludes(migration, "create table if not exists public.lead_submissions")
    assertStringIncludes(migration, "submission_id uuid not null unique")
    assert(!migration.includes("create table public.leads"))
    assert(!migration.includes("addSheet"))
})
