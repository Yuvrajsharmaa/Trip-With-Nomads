import assert from "node:assert/strict"
import test from "node:test"
import { analyzeTab, buildDryRunRepairPlan, MANAGED_TABS } from "./audit_managed_sheets.mjs"

test("managed Sheet audit finds duplicate current rows, orphan rows, and gateway drift", () => {
  const audit = analyzeTab("Bookings", [
    ["Booking Key", "PayU TxnID"],
    ["booking-1", "txn-1"],
    ["booking-1", "txn-2"],
    ["", "txn-3"],
  ])
  assert.equal(audit.headerDrift, true)
  assert.deepEqual(audit.duplicateKeys, [{ key: "booking-1", rows: [2, 3] }])
  assert.deepEqual(audit.orphanRows, [4])
  assert.deepEqual(audit.gatewaySpecificHeaders, ["PayU TxnID"])
  assert.deepEqual(audit.providerNeutralMappings, [{
    from: "PayU TxnID",
    to: "Provider Payment",
    preserve: "provider-neutral column",
  }])
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[0].action, "stop")
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[1].action, "map_provider_columns_dry_run")
})

test("lead identity matching is case-insensitive", () => {
  const audit = analyzeTab("Leads", [
    ["First Seen", "Email"],
    ["lead-1", " Guest@Example.com "],
    ["lead-2", "guest@example.com"],
  ])
  assert.deepEqual(audit.duplicateKeys, [{ key: "guest@example.com", rows: [2, 3] }])
})

test("custom-trip current rows use the same normalized contact contract", () => {
  const audit = analyzeTab("Custom Trip Leads", [
    MANAGED_TABS["Custom Trip Leads"].headers,
    ["lead-1", "2026-10-06T10:00:00+05:30", "2026-10-06T10:00:00+05:30", "Guest", " Guest@Example.com "]
  ])
  assert.equal(audit.headerDrift, false)
  assert.deepEqual(audit.duplicateKeys, [])
})

test("master leads are audited as one normalized current contact per email", () => {
  const audit = analyzeTab("Master Leads", [
    MANAGED_TABS["Master Leads"].headers,
    ["lead-1", "2026-10-06", "Guest", " Guest@Example.com ", "1", "", "trip_page_lead", "submitted", "", "", ""],
    ["lead-2", "2026-10-07", "Guest Updated", "guest@example.com", "2", "", "trip_page_lead", "submitted", "", "", ""],
  ])
  assert.deepEqual(audit.duplicateKeys, [{ key: "guest@example.com", rows: [2, 3] }])
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[0].action, "merge_current_rows_dry_run")
})
