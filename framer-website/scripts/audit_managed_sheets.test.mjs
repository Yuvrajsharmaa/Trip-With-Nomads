import assert from "node:assert/strict"
import test from "node:test"
import { analyzeTab, buildDryRunRepairPlan, MANAGED_TABS } from "./audit_managed_sheets.mjs"

test("managed Sheet audit finds duplicate current rows, orphan rows, and gateway drift", () => {
  const audit = analyzeTab("Bookings", [
    ["Booking Ref", "PayU TxnID"],
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

test("payment history and abandoned bookings use visible fingerprints", () => {
  const success = analyzeTab("Bookings_Success", [
    MANAGED_TABS.Bookings_Success.headers,
    ["8 Oct 2026, 3:30 PM IST", "TWN-1", "Trip", "20 Dec 2026", "Guest", "guest@example.com", 100, 100, "Paid", "Fully paid", ""],
    ["8 Oct 2026, 3:30 PM IST", "TWN-1", "Trip", "20 Dec 2026", "Guest", "guest@example.com", 100, 100, "Paid", "Fully paid", ""],
  ])
  assert.equal(success.headerDrift, false)
  assert.deepEqual(success.exactHistoryDuplicates, [{ key: "8 Oct 2026, 3:30 PM IST\u001fTWN-1\u001fTrip\u001f20 Dec 2026\u001fguest@example.com\u001f100\u001f100\u001fPaid\u001f", rows: [2, 3] }])

  const abandoned = analyzeTab("Abandoned Bookings", [
    MANAGED_TABS["Abandoned Bookings"].headers,
    ["8 Oct 2026, 3:30 PM IST", "Guest", "guest@example.com", "+91 9876543210", "Trip", "20 Dec 2026", "Guest (Double)", "25% deposit", "Checkout abandoned before payment", "Checkout abandoned", ""],
  ])
  assert.equal(abandoned.headerDrift, false)
  assert.deepEqual(abandoned.orphanRows, [])
})

test("unified Payment History detects exact duplicate events but keeps distinct event types", () => {
  const headers = MANAGED_TABS["Payment History"].headers
  const captured = [
    "8 Oct 2026, 3:30 PM IST", "TWN-1", "Trip", "20 Dec 2026", "Guest", "guest@example.com",
    100, 100, "Paid", "Fully paid", "Payment captured · Attempt 1",
  ]
  const orderPaid = [
    ...captured.slice(0, 10), "Order marked paid · Attempt 1",
  ]
  const audit = analyzeTab("Payment History", [headers, captured, orderPaid, captured])

  assert.equal(audit.headerDrift, false)
  assert.deepEqual(audit.exactHistoryDuplicates, [{
    key: [
      "8 Oct 2026, 3:30 PM IST", "TWN-1", "Trip", "20 Dec 2026", "guest@example.com", 100, 100,
      "Paid", "Payment captured · Attempt 1",
    ].join("\u001f"),
    rows: [2, 4],
  }])
})

test("custom-trip current duplicate rows require a merge review", () => {
  const headers = MANAGED_TABS["Custom Trip Leads"].headers
  const audit = analyzeTab("Custom Trip Leads", [
    headers,
    ["1 Oct", "2 Oct", "Guest", "guest@example.com", "+91 1", "", "Custom trip", "Planning", "Website", "New", ""],
    ["1 Oct", "3 Oct", "Guest Updated", "guest@example.com", "+91 1", "", "Custom trip", "Planning", "Website", "New", ""],
  ])

  assert.equal(audit.duplicateKeys.length, 1)
  assert.equal(buildDryRunRepairPlan({ tabs: [audit] })[0].action, "merge_current_rows_dry_run")
})
