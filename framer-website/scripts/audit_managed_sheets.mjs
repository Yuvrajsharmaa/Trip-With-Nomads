#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const PAYMENT_HISTORY_TAB_CONFIG = {
  history: true,
  fingerprint: [
    "Payment Date", "Booking Ref", "Trip", "Departure Date", "Email", "Amount Received",
    "Expected Amount", "Payment Result", "Notes",
  ],
  headers: [
    "Payment Date", "Booking Ref", "Trip", "Departure Date", "Guest Name", "Email",
    "Amount Received", "Expected Amount", "Payment Result", "Settlement Status", "Notes",
  ],
}

export const MANAGED_TABS = {
  Bookings: {
    key: "Booking Ref",
    headers: [
      "Last Updated", "Booking Ref", "Trip", "Departure Date", "Guest Name", "Email", "Phone",
      "Travellers", "Payment Plan", "Trip Total", "Paid", "Balance Due", "Payment Status",
      "Settlement Status", "Notes",
    ],
  },
  "Payment History": PAYMENT_HISTORY_TAB_CONFIG,
  Bookings_Success: PAYMENT_HISTORY_TAB_CONFIG,
  Bookings_Failed: PAYMENT_HISTORY_TAB_CONFIG,
  Leads: { key: "Email", headers: [
    "Captured At", "Last Activity", "Name", "Email", "Phone", "Company / Group", "Trip / Itinerary",
    "Reason / Activity", "Source", "Status", "Notes",
  ] },
  "Custom Trip Leads": { key: "Email", headers: [
    "Captured At", "Last Activity", "Name", "Email", "Phone", "Company / Group", "Trip / Itinerary",
    "Reason / Activity", "Source", "Status", "Notes",
  ] },
  "Abandoned Leads": { history: true, fingerprint: [
    "Captured At", "Email", "Phone", "Trip / Itinerary", "Source", "Reason / Activity",
  ], headers: [
    "Captured At", "Name", "Email", "Phone", "Trip / Itinerary", "Source", "Reason / Activity", "Status", "Notes",
  ] },
  "Abandoned Bookings": { history: true, fingerprint: [
    "Captured At", "Email", "Phone", "Trip", "Departure Date", "Reason",
  ], headers: [
    "Captured At", "Name", "Email", "Phone", "Trip", "Departure Date", "Travellers", "Payment Plan",
    "Reason", "Status", "Notes",
  ] },
  "NTC - Invites": { key: "Email", headers: [
    "Captured At", "Last Activity", "Name", "Email", "Phone", "Instagram", "Why They Want To Travel",
    "Trip / Itinerary", "Status", "Notes",
  ] },
  "Master Leads": { key: "Email", headers: [
    "Captured At", "Last Activity", "Name", "Email", "Phone", "Company / Group", "Trip / Itinerary",
    "Reason / Activity", "Source", "Status", "Notes",
  ] },
}

export const PROVIDER_COLUMN_MAP = {
  "PayU TxnID": "Provider Payment",
  "PayU Transaction ID": "Provider Payment",
  "PayU Mihpayid": "Provider Payment",
  "PayU Order ID": "Provider Order",
  "Razorpay Order ID": "Provider Order",
  "Razorpay Payment ID": "Provider Payment",
  "Gateway Order ID": "Provider Order",
  "Gateway Payment ID": "Provider Payment",
}

const normalize = (value) => String(value ?? "").trim()
const normalizeEmail = (value) => normalize(value).toLowerCase()

export function indexHeaders(row) {
  const index = new Map()
  for (const [position, value] of (Array.isArray(row) ? row : []).entries()) {
    const header = normalize(value)
    if (header) index.set(header.toLowerCase(), position)
  }
  return index
}

export function analyzeTab(tabName, values) {
  const config = MANAGED_TABS[tabName]
  if (!config) return { tab: tabName, unmanaged: true }
  const rows = Array.isArray(values) ? values : []
  const actualHeaders = Array.isArray(rows[0]) ? rows[0].map(normalize) : []
  const expectedHeaders = config.headers
  const headerDrift = expectedHeaders.length > 0 && JSON.stringify(actualHeaders) !== JSON.stringify(expectedHeaders)
  const headers = indexHeaders(rows[0] || [])
  const keyPosition = config.key ? headers.get(config.key.toLowerCase()) : null
  const fingerprintPositions = (config.fingerprint || []).map((header) => headers.get(header.toLowerCase()))
  const recordKey = (row) => {
    if (config.history) {
      if (fingerprintPositions.some((position) => position == null)) return ""
      return fingerprintPositions.map((position) => normalize(row[position])).join("\u001f")
    }
    return keyPosition == null ? "" : normalize(row[keyPosition])
  }
  const records = rows.slice(1).map((row, offset) => ({
    rowNumber: offset + 2,
    values: Array.isArray(row) ? row : [],
    key: recordKey(Array.isArray(row) ? row : []),
  }))
  const groups = new Map()
  for (const record of records) {
    const key = config.key?.toLowerCase() === "email" ? normalizeEmail(record.key) : record.key
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record.rowNumber)
  }
  const duplicates = [...groups.entries()].filter(([, rowsForKey]) => rowsForKey.length > 1)
    .map(([key, rowsForKey]) => ({ key, rows: rowsForKey }))
  const orphanRows = records.filter((record) => !record.key).map((record) => record.rowNumber)
  const exactHistoryDuplicates = config.history
    ? [...groups.entries()]
      .filter(([, rowNumbers]) => rowNumbers.length > 1)
      .map(([key, rowNumbers]) => ({
        key,
        rows: rowNumbers,
        exact: new Set(rowNumbers.map((rowNumber) => JSON.stringify(records[rowNumber - 2]?.values || []))).size === 1,
      }))
      .filter((duplicate) => duplicate.exact)
      .map(({ key, rows }) => ({ key, rows }))
    : []
  const gatewaySpecificHeaders = actualHeaders.filter((header) => /payu|razorpay|gateway|mihpay/i.test(header))
  const providerNeutralMappings = gatewaySpecificHeaders
    .map((header) => ({
      from: header,
      to: PROVIDER_COLUMN_MAP[header] || "Notes",
      preserve: PROVIDER_COLUMN_MAP[header] ? "provider-neutral column" : "unmapped value in Notes",
    }))

  return {
    tab: tabName,
    headerDrift,
    expectedHeaders,
    actualHeaders,
    rowCount: records.length,
    duplicateKeys: duplicates,
    orphanRows,
    gatewaySpecificHeaders,
    providerNeutralMappings,
    exactHistoryDuplicates,
  }
}

export function buildDryRunRepairPlan(audit) {
  const actions = []
  for (const tab of audit.tabs || []) {
    if (tab.headerDrift) actions.push({ action: "stop", tab: tab.tab, reason: "header_drift" })
    for (const mapping of tab.providerNeutralMappings || []) {
      actions.push({
        action: "map_provider_columns_dry_run",
        tab: tab.tab,
        from: mapping.from,
        to: mapping.to,
        rule: mapping.preserve,
      })
    }
    const duplicates = tab.history ? (tab.exactHistoryDuplicates || []) : (tab.duplicateKeys || [])
    for (const duplicate of duplicates) {
      if (tab.tab === "Bookings" || tab.tab === "Leads" || tab.tab === "Custom Trip Leads" || tab.tab === "NTC - Invites" || tab.tab === "Master Leads") {
        actions.push({
          action: "merge_current_rows_dry_run",
          tab: tab.tab,
          key: duplicate.key,
          rows: duplicate.rows,
          rule: "keep newest state; fill blank fields from older rows; require review before writing",
        })
      } else {
        actions.push({
          action: "review_history_duplicate_dry_run",
          tab: tab.tab,
          key: duplicate.key,
          rows: duplicate.rows,
          rule: "remove only exact duplicate event rows; preserve distinct attempts",
        })
      }
    }
    for (const row of tab.orphanRows || []) {
      actions.push({ action: "review_orphan_row", tab: tab.tab, row })
    }
  }
  return actions
}

async function readFixture(file) {
  const parsed = JSON.parse(await fs.readFile(file, "utf8"))
  return parsed.tabs || parsed
}

async function readLiveSheet(sheetId, accessToken) {
  if (!accessToken) throw new Error("Live audit requires GOOGLE_ACCESS_TOKEN; no token was found")
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`
  const metadataResponse = await fetch(`${base}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metadataResponse.ok) throw new Error(`Sheet metadata read failed: ${metadataResponse.status}`)
  const metadata = await metadataResponse.json()
  const result = {}
  for (const sheet of metadata.sheets || []) {
    const title = normalize(sheet?.properties?.title)
    if (!MANAGED_TABS[title]) continue
    const response = await fetch(`${base}/values/${encodeURIComponent(`${title}!A:ZZ`)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error(`Sheet values read failed for ${title}: ${response.status}`)
    result[title] = (await response.json()).values || []
  }
  return result
}

export async function auditManagedSheets({ tabs, backupDir, reportFile } = {}) {
  const audits = []
  for (const [tabName, values] of Object.entries(tabs || {})) audits.push(analyzeTab(tabName, values))
  const report = {
    mode: "read-only-dry-run",
    generatedAt: new Date().toISOString(),
    tabs: audits,
    repairPlan: buildDryRunRepairPlan({ tabs: audits }),
  }
  if (backupDir) {
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, "managed-sheet-values.json"), JSON.stringify(tabs || {}, null, 2))
  }
  if (reportFile) {
    await fs.mkdir(path.dirname(reportFile), { recursive: true })
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2))
  }
  return report
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--apply") || args.includes("--write")) {
    throw new Error("This workflow is read-only. Repair writes require a separate explicitly authorized operation.")
  }
  const getArg = (name) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : ""
  }
  const fixture = getArg("--input")
  const sheetId = getArg("--sheet-id")
  if (!fixture && !sheetId) throw new Error("Provide --input <fixture.json> or --sheet-id <existing spreadsheet id>")
  const tabs = fixture
    ? await readFixture(fixture)
    : await readLiveSheet(sheetId, process.env.GOOGLE_ACCESS_TOKEN)
  const report = await auditManagedSheets({
    tabs,
    backupDir: getArg("--backup-dir"),
    reportFile: getArg("--report"),
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
  })
}
