import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))
const projection = await Deno.readTextFile(
    new URL("../_shared/lead_projection.ts", import.meta.url),
)
const wrapper = await Deno.readTextFile(
    new URL("../../../framer/EmailPopupOverride.tsx", import.meta.url),
)
const migration = await Deno.readTextFile(
    new URL("../../migrations/20261006100000_lead_submission_idempotency.sql", import.meta.url),
)
const routing = await Deno.readTextFile(new URL("../_shared/lead_routing.ts", import.meta.url))
const retry = await Deno.readTextFile(
    new URL("../retry-lead-sheets/index.ts", import.meta.url),
)

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
    assertStringIncludes(projection, 'tab: "Master Leads"')
    assertStringIncludes(projection, "masterLeadMatchKeys(masterValues)")
    assertStringIncludes(source, "LEAD_ID_CONFLICT")
    assertStringIncludes(source, "does not belong")
    assertStringIncludes(source, "notes: compact(body?.notes)")
    assertStringIncludes(source, "notes: firstNonEmpty(body?.notes, existingLead?.notes)")
    assertStringIncludes(source, "canonicalIdempotencyPayload")
    assertStringIncludes(source, "existingPayloadHash")
    assertStringIncludes(source, "NTC invite reason is required")
    assertStringIncludes(source, "Phone is required for itinerary downloads without an email")
    assert(!projection.includes('params.source !== "booking_abandoned"'))
    assertStringIncludes(projection, "upsertCurrentRowByAnyKey")
    assertStringIncludes(projection, "appendHistoryRowOnceByFingerprint")
    assertStringIncludes(projection, "runIndependentSheetProjections")
    assertStringIncludes(retry, 'projection.sheetStatus === "synced"')
    assertStringIncludes(retry, "projection.errorMessage")
})

Deno.test("NTC invite accepts phone-only contacts while preserving required reasons", () => {
    assertStringIncludes(source, 'const phoneOnlyInvite = source === "booking_invite"')
    assertStringIncludes(source, "!phoneOnlyInvite && !itineraryWithoutEmail")
    assertStringIncludes(source, "if (normalizedEmail) {")
    assertStringIncludes(projection, "isPhoneOnlyLeadContact")
    assertStringIncludes(wrapper, 'const phoneOnlyContact = source === "booking_invite"')
    assertStringIncludes(wrapper, "A travel reason is required")
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
    assertStringIncludes(wrapper, "resolveFormFromEvent")
    assertStringIncludes(wrapper, "requestSubmit")
    assertStringIncludes(wrapper, "__twn_replaying_booking_invite_submit")
    assertStringIncludes(wrapper, 'if (source !== "booking_invite") return')
    const ntcStart = wrapper.indexOf("export function withBookingInviteTracking")
    const ntcEnd = wrapper.indexOf("export function withTripPageLeadTracking", ntcStart)
    const ntc = wrapper.slice(ntcStart, ntcEnd)
    assertStringIncludes(ntc, 'document.addEventListener("submit", submitHandler, true)')
    assertStringIncludes(ntc, "if (!form.checkValidity())")
    assertStringIncludes(ntc, "postLeadWithSource")
    assertStringIncludes(ntc, "form.requestSubmit()")
    assertStringIncludes(wrapper, "Could not find the submitted form")
    assertStringIncludes(wrapper, "const root = form")
    assert(!wrapper.includes("const root = form ?? document"))
    assertStringIncludes(wrapper, "if (!isFormSubmitClick(event, form))")
})

Deno.test("lead idempotency state is internal and creates no Sheet tab", () => {
    assertStringIncludes(migration, "create table if not exists public.lead_submissions")
    assertStringIncludes(migration, "submission_id uuid not null unique")
    assert(!migration.includes("create table public.leads"))
    assert(!migration.includes("addSheet"))
})
