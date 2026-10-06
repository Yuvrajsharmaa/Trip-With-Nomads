import assert from "node:assert/strict"
import test from "node:test"
import { analyzeTab, buildDryRunRepairPlan } from "./audit_managed_sheets.mjs"

test("managed Sheet audit finds duplicate current rows, orphan rows, and gateway drift", () => {
  const audit = analyzeTab("Bookings", [
    ["Last Updated (IST)", "Booking Ref", "Booking ID", "Trip Name", "PayU TxnID"],
    ["06 Oct 2026 10:00 IST", "TWN-1", "booking-1", "Trip", "txn-1"],
    ["06 Oct 2026 11:00 IST", "TWN-1", "booking-1", "Trip", "txn-2"],
    ["06 Oct 2026 12:00 IST", "TWN-2", "", "Trip", "txn-3"],
  ])
  assert.equal(audit.headerDrift, true)
  assert.deepEqual(audit.duplicateKeys, [{ key: "booking-1", rows: [2, 3] }])
  assert.deepEqual(audit.orphanRows, [4])
  assert.deepEqual(audit.gatewaySpecificHeaders, ["PayU TxnID"])
  assert.deepEqual(audit.providerNeutralMappings, [{
    from: "PayU TxnID",
    to: "Provider Payment/Transaction ID",
    preserve: "provider-neutral column",
  }])
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[0].action, "stop")
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[1].action, "map_provider_columns_dry_run")
})

test("lead identity matching is case-insensitive", () => {
  const audit = analyzeTab("Leads", [
    ["Lead ID", "Email"],
    ["lead-1", " Guest@Example.com "],
    ["lead-2", "guest@example.com"],
  ])
  assert.deepEqual(audit.duplicateKeys, [{ key: "guest@example.com", rows: [2, 3] }])
})
