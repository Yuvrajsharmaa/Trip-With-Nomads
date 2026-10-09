import { importPKCS8, SignJWT } from "https://esm.sh/jose@4.15.4"
import { formattedSheetDateMatches } from "./sheet_dates.ts"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"

type ServiceAccount = {
    client_email: string
    private_key: string
}

type TokenCache = {
    token: string
    exp: number
}

export type SheetTabMetadata = {
    title: string
    sheetId: number
    rowCount: number
}

const ensuredHeaders = new Map<string, Set<string>>() // map sheetId -> Set of tab names
const ensuredTabs = new Map<string, Set<string>>()
const ensuredFormatting = new Map<string, Set<string>>()
let cachedToken: TokenCache | null = null
let cachedServiceAccount: ServiceAccount | null = null

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

export function sheetsEnabled(): boolean {
    return isTruthy(Deno.env.get("SHEETS_WRITE_ENABLED"))
}

export type CurrentRowAction = "append" | "update" | "fail"

export function currentRowAction(matchCount: number): CurrentRowAction {
    if (matchCount === 0) return "append"
    if (matchCount === 1) return "update"
    return "fail"
}

export function hasExactHeaders(actual: string[], expected: string[]): boolean {
    return actual.length === expected.length &&
        expected.every((header, index) => actual[index] === header)
}

function getServiceAccount(): ServiceAccount {
    if (cachedServiceAccount) return cachedServiceAccount
    const raw = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "").trim()
    if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set")
    const parsed = JSON.parse(raw)
    if (!parsed?.client_email || !parsed?.private_key) {
        throw new Error(
            "GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key",
        )
    }
    cachedServiceAccount = {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
    }
    return cachedServiceAccount
}

async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    // Cache the token aggressively
    if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token

    const { client_email, private_key } = getServiceAccount()
    const key = await importPKCS8(private_key, "RS256")
    const jwt = await new SignJWT({ scope: SHEETS_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setIssuer(client_email)
        .setAudience(TOKEN_URL)
        .sign(key)

    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    })

    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Token request failed: ${res.status} ${text}`)
    }

    const data = await res.json()
    const token = String(data.access_token || "")
    const exp = now + Number(data.expires_in || 0)
    if (!token) throw new Error("Missing access_token in token response")
    cachedToken = { token, exp }
    return token
}

async function sheetsFetch(path: string, sheetId: string, init?: RequestInit) {
    const token = await getAccessToken()
    const headers = new Headers(init?.headers || {})
    headers.set("Authorization", `Bearer ${token}`)
    headers.set("Content-Type", "application/json")
    return fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`,
        {
            ...init,
            headers,
        },
    )
}

async function ensureTab(tab: string, sheetId: string) {
    if (!ensuredTabs.has(sheetId)) ensuredTabs.set(sheetId, new Set())
    if (ensuredTabs.get(sheetId)!.has(tab)) return

    const metaRes = await sheetsFetch("?fields=sheets.properties.title", sheetId)
    if (!metaRes.ok) {
        const text = await metaRes.text()
        throw new Error(`Sheet metadata read failed: ${metaRes.status} ${text}`)
    }

    const meta = await metaRes.json()
    const exists = Array.isArray(meta?.sheets) &&
        meta.sheets.some((sheet: any) => String(sheet?.properties?.title || "").trim() === tab)

    if (!exists) {
        throw new Error(`Managed Sheet tab not found: ${tab}`)
    }

    ensuredTabs.get(sheetId)!.add(tab)
}

async function ensureHeaders(tab: string, headers: string[], sheetId: string) {
    await ensureTab(tab, sheetId)
    if (!ensuredHeaders.has(sheetId)) ensuredHeaders.set(sheetId, new Set())
    if (ensuredHeaders.get(sheetId)!.has(tab)) return

    const check = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A1:ZZ1`,
        sheetId,
    )
    if (!check.ok) {
        const text = await check.text()
        throw new Error(`Header check failed: ${check.status} ${text}`)
    }
    const data = await check.json()
    const actual = Array.isArray(data?.values?.[0])
        ? data.values[0].map((cell: any) => String(cell ?? "").trim())
        : []
    const expected = headers.map((header) => String(header || "").trim())
    const matches = hasExactHeaders(actual, expected)
    if (!matches) {
        throw new Error(
            `Managed Sheet header drift in ${tab}: expected ${JSON.stringify(expected)}, got ${
                JSON.stringify(actual)
            }`,
        )
    }
    ensuredHeaders.get(sheetId)!.add(tab)
    await formatManagedTab(sheetId, tab, headers)
}

function parseRowIndex(range?: string | null): number | null {
    if (!range) return null
    const match = /!A(\d+)/.exec(range)
    if (!match) return null
    return Number(match[1])
}

function columnNumberToName(columnNumber: number): string {
    let next = Math.max(1, Math.floor(columnNumber))
    let name = ""
    while (next > 0) {
        const remainder = (next - 1) % 26
        name = String.fromCharCode(65 + remainder) + name
        next = Math.floor((next - 1) / 26)
    }
    return name
}

export async function getSpreadsheetTabs(
    sheetId: string,
): Promise<SheetTabMetadata[]> {
    if (!sheetsEnabled()) return []
    const res = await sheetsFetch(
        "?fields=sheets.properties(sheetId,title,gridProperties)",
        sheetId,
    )
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Spreadsheet tabs read failed: ${res.status} ${text}`)
    }
    const data = await res.json()
    const sheets = Array.isArray(data?.sheets) ? data.sheets : []
    return sheets
        .map((sheet: any) => ({
            title: String(sheet?.properties?.title || "").trim(),
            sheetId: Number(sheet?.properties?.sheetId),
            rowCount: Number(sheet?.properties?.gridProperties?.rowCount || 0),
        }))
        .filter((sheet: SheetTabMetadata) => sheet.title && Number.isFinite(sheet.sheetId))
}

export async function formatManagedTab(
    sheetId: string,
    tab: string,
    headers: string[],
): Promise<void> {
    if (!sheetsEnabled() || !headers.length) return
    if (!ensuredFormatting.has(sheetId)) {
        ensuredFormatting.set(sheetId, new Set())
    }
    if (ensuredFormatting.get(sheetId)!.has(tab)) return

    const metadata = await getSpreadsheetTabs(sheetId)
    const target = metadata.find((item) => item.title === tab)
    if (!target) throw new Error(`Managed Sheet tab not found: ${tab}`)

    const amountHeaders = new Set([
        "Subtotal",
        "Discount",
        "GST",
        "Trip Total",
        "Payable Now",
        "Paid Amount",
        "Balance Due",
        "Paid",
        "Amount Received",
        "Expected Amount",
    ])
    const wrapHeaders = new Set([
        "Traveller Summary",
        "Travellers",
        "Trip / Itinerary",
        "Reason / Activity",
        "Company / Group",
        "Notes",
        "Reason",
        "Why They Want To Travel",
        "Reconciliation",
        "Reconciliation Result",
    ])
    const dateTimeHeaders = new Set([
        "Captured At",
        "First Seen At",
        "Last Activity",
        "Last Seen At",
        "Last Updated",
        "Payment Date",
        "Event Received At",
        "Processed At",
        "Last Payment Event At",
    ])
    const dateHeaders = new Set(["Departure Date"])
    const hiddenHeaders = new Set(
        headers.filter((header) =>
            /^utm\s/i.test(header) ||
            /key$/i.test(header) ||
            /^(event id|booking id|trip id|provider order\/reference|provider payment\/transaction id)$/i
                .test(header)
        ),
    )
    const requests: any[] = [
        {
            updateSheetProperties: {
                properties: {
                    sheetId: target.sheetId,
                    gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
            },
        },
        {
            setBasicFilter: {
                filter: {
                    range: {
                        sheetId: target.sheetId,
                        startRowIndex: 0,
                        endColumnIndex: headers.length,
                    },
                },
            },
        },
        {
            repeatCell: {
                range: {
                    sheetId: target.sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    endColumnIndex: headers.length,
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.91, green: 0.94, blue: 0.98 },
                    },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
        },
    ]

    headers.forEach((header, index) => {
        const width = hiddenHeaders.has(header)
            ? 120
            : wrapHeaders.has(header)
            ? 280
            : /^last (updated|seen|activity)|^first seen|^captured at|^payment date|^event received|^processed at|^last payment event at/i
                    .test(header)
            ? 205
            : /url|page/i.test(header)
            ? 240
            : 140
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: target.sheetId,
                    dimension: "COLUMNS",
                    startIndex: index,
                    endIndex: index + 1,
                },
                properties: {
                    pixelSize: width,
                    hiddenByUser: hiddenHeaders.has(header),
                },
                fields: "pixelSize,hiddenByUser",
            },
        })
        if (amountHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: target.sheetId,
                        startRowIndex: 1,
                        startColumnIndex: index,
                        endColumnIndex: index + 1,
                    },
                    cell: {
                        userEnteredFormat: {
                            numberFormat: { type: "NUMBER", pattern: "₹#,##0.00" },
                        },
                    },
                    fields: "userEnteredFormat.numberFormat",
                },
            })
        }
        if (dateTimeHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: target.sheetId,
                        startRowIndex: 1,
                        startColumnIndex: index,
                        endColumnIndex: index + 1,
                    },
                    cell: {
                        userEnteredFormat: {
                            numberFormat: { type: "DATE_TIME", pattern: "d mmm yyyy, h:mm AM/PM" },
                        },
                    },
                    fields: "userEnteredFormat.numberFormat",
                },
            })
        }
        if (dateHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: target.sheetId,
                        startRowIndex: 1,
                        startColumnIndex: index,
                        endColumnIndex: index + 1,
                    },
                    cell: {
                        userEnteredFormat: {
                            numberFormat: { type: "DATE", pattern: "d mmm yyyy" },
                        },
                    },
                    fields: "userEnteredFormat.numberFormat",
                },
            })
        }
        if (wrapHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: target.sheetId,
                        startRowIndex: 1,
                        startColumnIndex: index,
                        endColumnIndex: index + 1,
                    },
                    cell: {
                        userEnteredFormat: {
                            wrapStrategy: "WRAP",
                            verticalAlignment: "TOP",
                        },
                    },
                    fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
                },
            })
        }
    })

    const sendFormatting = (batchRequests: any[]) =>
        sheetsFetch(":batchUpdate", sheetId, {
            method: "POST",
            body: JSON.stringify({ requests: batchRequests }),
        })

    let res = await sendFormatting(requests)
    if (!res.ok) {
        const text = await res.text()
        const tableOwnsFilter = text.includes("setBasicFilter") &&
            text.includes("partially intersects a table")
        if (!tableOwnsFilter) {
            throw new Error(`Managed Sheet formatting failed: ${res.status} ${text}`)
        }

        // Some existing managed tabs already contain a Google Sheets table.
        // Google rejects a basic filter that intersects that table; the table
        // already supplies filtering, so preserve the other formatting and
        // retry without trying to replace the table's filter.
        res = await sendFormatting(
            requests.filter((request) => !request.setBasicFilter),
        )
        if (!res.ok) {
            const retryText = await res.text()
            throw new Error(
                `Managed Sheet formatting failed: ${res.status} ${retryText}`,
            )
        }
    }
    ensuredFormatting.get(sheetId)!.add(tab)
}

export async function clearTabValues(
    sheetId: string,
    tab: string,
): Promise<void> {
    if (!sheetsEnabled()) return
    await ensureTab(tab, sheetId)
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A:ZZ:clear`,
        sheetId,
        {
            method: "POST",
            body: JSON.stringify({}),
        },
    )
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Clear tab failed: ${res.status} ${text}`)
    }
}

export async function replaceTabValues(
    sheetId: string,
    tab: string,
    rows: (string | number | null)[][],
): Promise<number> {
    if (!sheetsEnabled()) return 0
    await ensureTab(tab, sheetId)
    await clearTabValues(sheetId, tab)
    if (!Array.isArray(rows) || rows.length === 0) return 0

    const maxCols = rows.reduce(
        (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
        0,
    )
    const endCol = columnNumberToName(Math.max(1, maxCols))
    const endRow = rows.length
    const range = `${tab}!A1:${endCol}${endRow}`
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        sheetId,
        {
            method: "PUT",
            body: JSON.stringify({ values: rows }),
        },
    )
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Replace tab failed: ${res.status} ${text}`)
    }
    return rows.length
}

export async function appendRow(
    sheetId: string,
    tab: string,
    values: (string | number | null)[],
    headers?: string[],
) {
    if (!sheetsEnabled()) return null
    await ensureTab(tab, sheetId)
    if (headers?.length) await ensureHeaders(tab, headers, sheetId)

    // Some existing managed tabs contain a legacy table/range whose append
    // anchor is offset from column A. Use an explicit next-row update instead
    // of values.append so every new record starts at the contract's first
    // column and cannot shift the visible fields.
    const existingRows = await readTabValues(sheetId, tab, "A1:ZZ10000")
    let lastPopulatedRow = 0
    for (let index = 0; index < existingRows.length; index++) {
        const row = Array.isArray(existingRows[index]) ? existingRows[index] : []
        if (row.some((cell) => String(cell ?? "").trim() !== "")) {
            lastPopulatedRow = index + 1
        }
    }
    const rowNumber = Math.max(2, lastPopulatedRow + 1)
    await ensureGridRowExists(sheetId, tab, rowNumber)
    const endColumn = columnNumberToName(Math.max(1, values.length))
    const res = await sheetsFetch(
        `/values/${
            encodeURIComponent(tab)
        }!A${rowNumber}:${endColumn}${rowNumber}?valueInputOption=RAW`,
        sheetId,
        {
            method: "PUT",
            body: JSON.stringify({ values: [values] }),
        },
    )

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Append failed: ${res.status} ${text}`)
    }

    const data = await res.json()
    return parseRowIndex(data?.updates?.updatedRange || null) || rowNumber
}

export async function updateRow(
    sheetId: string,
    tab: string,
    row: number,
    values: (string | number | null)[],
    headers?: string[],
) {
    if (!sheetsEnabled()) return null
    await ensureTab(tab, sheetId)
    if (headers?.length) await ensureHeaders(tab, headers, sheetId)

    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A${row}?valueInputOption=RAW`,
        sheetId,
        {
            method: "PUT",
            body: JSON.stringify({ values: [values] }),
        },
    )

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Update failed: ${res.status} ${text}`)
    }
    return row
}

export async function readTabValues(
    sheetId: string,
    tab: string,
    range = "A:ZZ",
    valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
): Promise<any[][]> {
    if (!sheetsEnabled()) return []
    await ensureTab(tab, sheetId)
    const renderOption = valueRenderOption
        ? `?valueRenderOption=${encodeURIComponent(valueRenderOption)}`
        : ""
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!${encodeURIComponent(range)}${renderOption}`,
        sheetId,
    )
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Read values failed: ${res.status} ${text}`)
    }
    const data = await res.json()
    return Array.isArray(data?.values) ? data.values : []
}

export async function findRowByColumnValue(
    sheetId: string,
    tab: string,
    columnName: string,
    value: string,
    headers?: string[],
): Promise<number | null> {
    const matches = await findRowsByColumnValue(
        sheetId,
        tab,
        columnName,
        value,
        headers,
    )
    if (currentRowAction(matches.length) === "fail") {
        throw new Error(
            `Multiple current-state Sheet rows match ${columnName}=${
                String(value || "").trim()
            } in ${tab}`,
        )
    }
    return matches[0] || null
}

export async function findRowsByColumnValue(
    sheetId: string,
    tab: string,
    columnName: string,
    value: string,
    headers?: string[],
): Promise<number[]> {
    if (!sheetsEnabled()) return []
    const needle = String(value || "").trim()
    if (!needle) return []

    await ensureTab(tab, sheetId)
    if (headers?.length) await ensureHeaders(tab, headers, sheetId)

    // `A1:ZZ` is interpreted by Sheets as a one-row range because the end
    // coordinate has no row number. Use an explicit bounded range so all
    // current rows are considered before deciding whether to append.
    const rows = await readTabValues(sheetId, tab, "A1:ZZ10000")
    if (rows.length === 0) return []

    const header = Array.isArray(rows[0]) ? rows[0].map((cell) => String(cell || "").trim()) : []
    const index = header.findIndex((cell) =>
        cell.toLowerCase() === String(columnName || "").trim().toLowerCase()
    )
    if (index < 0) return []

    const matches: number[] = []
    for (let i = 1; i < rows.length; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : []
        const cell = String(row[index] || "").trim()
        if (cell === needle) matches.push(i + 1)
    }

    return matches
}

export type CurrentRowKey = { column: string; value: string }

export function findRowsMatchingAnyKey(
    rows: any[][],
    keys: CurrentRowKey[],
): number[] {
    if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(keys)) return []
    const header = Array.isArray(rows[0])
        ? rows[0].map((cell) => String(cell ?? "").trim().toLowerCase())
        : []
    const columnKeys = keys
        .map((key) => ({
            index: header.indexOf(String(key.column || "").trim().toLowerCase()),
            value: String(key.value || "").trim(),
        }))
        .filter((key) => key.index >= 0 && key.value)
    const matches: number[] = []
    for (let index = 1; index < rows.length; index++) {
        const row = Array.isArray(rows[index]) ? rows[index] : []
        if (columnKeys.some((key) => String(row[key.index] ?? "").trim() === key.value)) {
            matches.push(index + 1)
        }
    }
    return matches
}

export async function upsertCurrentRowByAnyKey(
    sheetId: string,
    tab: string,
    keys: CurrentRowKey[],
    values: (string | number | null)[],
    headers: string[],
    options: { moveUpdatedRowToBottom?: boolean } = {},
): Promise<{ row: number; created: boolean }> {
    const usableKeys = keys.filter((key) => String(key.value || "").trim())
    if (usableKeys.length === 0) {
        throw new Error(`Current-state Sheet key is required for ${tab}`)
    }
    await ensureTab(tab, sheetId)
    await ensureHeaders(tab, headers, sheetId)
    const existingRows = await readTabValues(sheetId, tab, "A1:ZZ10000")
    const matches = findRowsMatchingAnyKey(existingRows, usableKeys)
    if (matches.length > 1) {
        throw new Error(`Multiple current-state Sheet rows match contact keys in ${tab}`)
    }
    if (matches.length === 1) {
        if (options.moveUpdatedRowToBottom) {
            const row = await moveRowToBottom(sheetId, tab, matches[0], values)
            return { row, created: false }
        }
        await updateRow(sheetId, tab, matches[0], values, headers)
        return { row: matches[0], created: false }
    }
    const row = await appendRow(sheetId, tab, values, headers)
    if (row) return { row, created: true }

    const rechecked = await readTabValues(sheetId, tab, "A1:ZZ10000")
    const recheckedMatches = findRowsMatchingAnyKey(rechecked, usableKeys)
    if (recheckedMatches.length > 1) {
        throw new Error(`Multiple current-state Sheet rows match contact keys in ${tab}`)
    }
    if (recheckedMatches.length === 1) {
        return { row: recheckedMatches[0], created: true }
    }
    throw new Error(`Current-state Sheet row append returned no row for ${tab}`)
}

function userEnteredValue(value: string | number | null): Record<string, unknown> {
    if (value === null || value === undefined) return {}
    if (typeof value === "number" && Number.isFinite(value)) {
        return { numberValue: value }
    }
    return { stringValue: String(value) }
}

async function moveRowToBottom(
    sheetId: string,
    tab: string,
    rowNumber: number,
    values: (string | number | null)[],
): Promise<number> {
    const existingRows = await readTabValues(sheetId, tab, "A1:ZZ10000")
    let lastPopulatedRow = 0
    for (let index = 0; index < existingRows.length; index++) {
        const row = Array.isArray(existingRows[index]) ? existingRows[index] : []
        if (row.some((cell) => String(cell ?? "").trim() !== "")) {
            lastPopulatedRow = index + 1
        }
    }

    if (rowNumber < 2 || rowNumber >= lastPopulatedRow) {
        await updateRow(sheetId, tab, rowNumber, values)
        return rowNumber
    }

    // Write the refreshed current-state row at the end and delete its old
    // position in the same Sheets batch. This keeps one row per key while
    // making the newest activity visibly land at the bottom.
    const destinationRow = lastPopulatedRow + 1
    await ensureGridRowExists(sheetId, tab, destinationRow)
    const tabs = await getSpreadsheetTabs(sheetId)
    const target = tabs.find((item) => item.title === tab)
    if (!target) throw new Error(`Managed Sheet tab not found: ${tab}`)

    const res = await sheetsFetch(":batchUpdate", sheetId, {
        method: "POST",
        body: JSON.stringify({
            requests: [
                {
                    updateCells: {
                        start: {
                            sheetId: target.sheetId,
                            rowIndex: destinationRow - 1,
                            columnIndex: 0,
                        },
                        rows: [{
                            values: values.map((value) => ({
                                userEnteredValue: userEnteredValue(value),
                            })),
                        }],
                        fields: "userEnteredValue",
                    },
                },
                {
                    deleteDimension: {
                        range: {
                            sheetId: target.sheetId,
                            dimension: "ROWS",
                            startIndex: rowNumber - 1,
                            endIndex: rowNumber,
                        },
                    },
                },
            ],
        }),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Move current Sheet row failed: ${res.status} ${text}`)
    }
    return destinationRow - 1
}

export async function upsertCurrentRow(
    sheetId: string,
    tab: string,
    keyColumn: string,
    keyValue: string,
    values: (string | number | null)[],
    headers?: string[],
    options: { moveUpdatedRowToBottom?: boolean } = {},
): Promise<{ row: number; created: boolean }> {
    if (!String(keyValue || "").trim()) {
        throw new Error(`Current-state Sheet key is required for ${tab}`)
    }
    const matches = await findRowsByColumnValue(
        sheetId,
        tab,
        keyColumn,
        keyValue,
        headers,
    )
    if (currentRowAction(matches.length) === "fail") {
        throw new Error(
            `Multiple current-state Sheet rows match ${keyColumn}=${
                String(keyValue || "").trim()
            } in ${tab}`,
        )
    }
    if (matches.length === 1) {
        if (options.moveUpdatedRowToBottom) {
            const row = await moveRowToBottom(
                sheetId,
                tab,
                matches[0],
                values,
            )
            return { row, created: false }
        }
        await updateRow(sheetId, tab, matches[0], values, headers)
        return { row: matches[0], created: false }
    }
    const row = await appendRow(sheetId, tab, values, headers)
    if (!row) {
        // Google can commit the append while omitting updates.updatedRange from
        // the values.append response. Re-read the idempotency key before
        // reporting a projection failure; this avoids turning a successful
        // append into a false retry/error response.
        const rechecked = await findRowsByColumnValue(
            sheetId,
            tab,
            keyColumn,
            keyValue,
            headers,
        )
        if (currentRowAction(rechecked.length) === "fail") {
            throw new Error(
                `Multiple current-state Sheet rows match ${keyColumn}=${
                    String(keyValue || "").trim()
                } in ${tab}`,
            )
        }
        if (rechecked.length === 1) return { row: rechecked[0], created: true }
        throw new Error(
            `Current-state Sheet row append returned no row for ${tab}`,
        )
    }
    return { row, created: true }
}

export async function appendHistoryRowOnce(
    sheetId: string,
    tab: string,
    eventIdColumn: string,
    eventId: string,
    values: (string | number | null)[],
    headers?: string[],
): Promise<{ row: number | null; appended: boolean }> {
    if (!String(eventId || "").trim()) {
        throw new Error(`History event key is required for ${tab}`)
    }
    const matches = await findRowsByColumnValue(
        sheetId,
        tab,
        eventIdColumn,
        eventId,
        headers,
    )
    if (matches.length > 0) return { row: matches[0], appended: false }
    const row = await appendRow(sheetId, tab, values, headers)
    if (row) return { row, appended: true }

    // Treat a committed append with a missing updatedRange as successful only
    // after the event key is visible. Otherwise leave the caller retryable.
    const rechecked = await findRowsByColumnValue(
        sheetId,
        tab,
        eventIdColumn,
        eventId,
        headers,
    )
    if (rechecked.length > 1) {
        throw new Error(
            `Multiple history Sheet rows match ${eventIdColumn}=${
                String(eventId || "").trim()
            } in ${tab}`,
        )
    }
    if (rechecked.length === 1) return { row: rechecked[0], appended: true }
    throw new Error(`History Sheet row append returned no row for ${tab}`)
}

export function rowMatchesColumnFingerprint(
    row: any[],
    header: string[],
    values: (string | number | null)[],
    columns: string[],
    valuesHeader: string[] = header,
): boolean {
    return columns.every((column) => {
        const index = header.findIndex((cell) =>
            String(cell || "").trim().toLowerCase() === String(column || "").trim().toLowerCase()
        )
        const valueIndex = valuesHeader.findIndex((cell) =>
            String(cell || "").trim().toLowerCase() === String(column || "").trim().toLowerCase()
        )
        if (index < 0 || valueIndex < 0) return false
        const expected = values[valueIndex]
        if (typeof expected === "number") {
            if (
                String(column).trim().toLowerCase() === "payment date" &&
                typeof row[index] === "number" && Number.isFinite(row[index])
            ) {
                // Payment event identity must distinguish events within the
                // same displayed minute. The caller reads this date as an
                // unformatted Sheets serial, so compare its stored millisecond.
                return Math.round(row[index] * 86_400_000) ===
                    Math.round(expected * 86_400_000)
            }
            const dateOnly = String(column).trim().toLowerCase() === "departure date"
            return formattedSheetDateMatches(row[index], expected, dateOnly)
        }
        return String(row[index] ?? "").trim() === String(expected ?? "").trim()
    })
}

export type PaymentHistoryRowResolution =
    | { action: "reuse"; row: number }
    | { action: "write"; row: number }
    | { action: "conflict"; row: null }

/** Resolve an event row using its durable Supabase row reservation first. */
export function resolvePaymentHistoryRow(params: {
    mappedRow: number | null
    mappedRowMatches: boolean
    mappedRowBlank: boolean
    fingerprintMatches: number[]
    lastPopulatedRow: number
    allowFingerprintRecovery?: boolean
}): PaymentHistoryRowResolution {
    const matches = [...new Set(params.fingerprintMatches)].sort((a, b) => a - b)
    if (params.mappedRow && params.mappedRowMatches) {
        return { action: "reuse", row: params.mappedRow }
    }
    if (!params.mappedRow && params.allowFingerprintRecovery === false) {
        return { action: "write", row: Math.max(2, params.lastPopulatedRow + 1) }
    }
    if (matches.length > 1) return { action: "conflict", row: null }
    if (matches.length === 1) return { action: "reuse", row: matches[0] }
    if (params.mappedRow) {
        return params.mappedRowBlank
            ? { action: "write", row: params.mappedRow }
            : { action: "conflict", row: null }
    }
    return { action: "write", row: Math.max(2, params.lastPopulatedRow + 1) }
}

async function savePaymentHistoryRowMapping(
    supabase: any,
    paymentEventRowId: string,
    spreadsheetId: string,
    tab: string,
    row: number,
    create: boolean,
): Promise<void> {
    const mapping = {
        payment_event_id: paymentEventRowId,
        spreadsheet_id: spreadsheetId,
        tab_name: tab,
        row_number: row,
        updated_at: new Date().toISOString(),
    }
    const request = create
        ? supabase.from("payment_event_sheet_rows").insert(mapping)
        : supabase.from("payment_event_sheet_rows")
            .update(mapping)
            .eq("payment_event_id", paymentEventRowId)
    const result = await request
    if (result.error) throw result.error
}

async function ensureGridRowExists(
    spreadsheetId: string,
    tab: string,
    row: number,
): Promise<void> {
    const target = (await getSpreadsheetTabs(spreadsheetId)).find((item) => item.title === tab)
    if (!target) throw new Error(`Managed Sheet tab not found: ${tab}`)
    if (row <= target.rowCount) return
    const response = await sheetsFetch(":batchUpdate", spreadsheetId, {
        method: "POST",
        body: JSON.stringify({
            requests: [{
                appendDimension: {
                    sheetId: target.sheetId,
                    dimension: "ROWS",
                    length: row - target.rowCount,
                },
            }],
        }),
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Managed Sheet row capacity update failed: ${response.status} ${text}`)
    }
}

/**
 * Append one verified provider event and keep its exact Sheet row reservation
 * in private Supabase state rather than adding a technical visible column.
 */
export async function appendPaymentHistoryRowOnceByEventRowId(
    supabase: any,
    paymentEventRowId: string,
    spreadsheetId: string,
    tab: string,
    values: (string | number | null)[],
    headers: string[],
    fingerprintColumns: string[],
    allowFingerprintRecovery = true,
): Promise<{ row: number | null; appended: boolean }> {
    if (!String(paymentEventRowId || "").trim()) {
        throw new Error(`Payment event database row is required for ${tab}`)
    }
    if (!Array.isArray(fingerprintColumns) || fingerprintColumns.length === 0) {
        throw new Error(`Payment event recovery fingerprint is required for ${tab}`)
    }
    if (!sheetsEnabled()) return { row: null, appended: false }

    await ensureTab(tab, spreadsheetId)
    await ensureHeaders(tab, headers, spreadsheetId)
    const mappingResult = await supabase
        .from("payment_event_sheet_rows")
        .select("spreadsheet_id,tab_name,row_number")
        .eq("payment_event_id", paymentEventRowId)
        .maybeSingle()
    if (mappingResult.error) throw mappingResult.error
    const mapping = mappingResult.data
    if (mapping && (mapping.spreadsheet_id !== spreadsheetId || mapping.tab_name !== tab)) {
        throw new Error(`Payment event row is already routed to another Sheet destination`)
    }

    const existingRows = await readTabValues(
        spreadsheetId,
        tab,
        "A1:ZZ10000",
        "UNFORMATTED_VALUE",
    )
    const header = Array.isArray(existingRows[0])
        ? existingRows[0].map((cell) => String(cell ?? "").trim())
        : []
    const missingColumn = fingerprintColumns.find((column) =>
        !header.some((cell) => cell.toLowerCase() === String(column).trim().toLowerCase())
    )
    if (missingColumn) {
        throw new Error(`Payment event recovery column not found in ${tab}: ${missingColumn}`)
    }

    const fingerprintMatches: number[] = []
    let lastPopulatedRow = 0
    for (let index = 1; index < existingRows.length; index++) {
        const row = Array.isArray(existingRows[index]) ? existingRows[index] : []
        const rowNumber = index + 1
        if (row.some((cell) => String(cell ?? "").trim() !== "")) lastPopulatedRow = rowNumber
        if (
            allowFingerprintRecovery &&
            rowMatchesColumnFingerprint(row, header, values, fingerprintColumns, headers)
        ) {
            fingerprintMatches.push(rowNumber)
        }
    }

    const mappedRow = Number(mapping?.row_number) || null
    const mappedValues = mappedRow ? existingRows[mappedRow - 1] : undefined
    const mappedRowMatches = Boolean(mappedRow && mappedValues &&
        rowMatchesColumnFingerprint(mappedValues, header, values, fingerprintColumns, headers))
    const mappedRowBlank = !mappedValues || !mappedValues.some((cell: unknown) =>
        String(cell ?? "").trim() !== ""
    )
    const resolution = resolvePaymentHistoryRow({
        mappedRow,
        mappedRowMatches,
        mappedRowBlank,
        fingerprintMatches,
        lastPopulatedRow,
        allowFingerprintRecovery,
    })
    if (resolution.action === "conflict") {
        throw new Error(`Ambiguous payment history event row in ${tab}; repair is required`)
    }
    if (resolution.action === "reuse") {
        if (!mapping) {
            await savePaymentHistoryRowMapping(
                supabase,
                paymentEventRowId,
                spreadsheetId,
                tab,
                resolution.row,
                true,
            )
        } else if (mappedRow !== resolution.row) {
            await savePaymentHistoryRowMapping(
                supabase,
                paymentEventRowId,
                spreadsheetId,
                tab,
                resolution.row,
                false,
            )
        }
        return { row: resolution.row, appended: false }
    }

    if (!mapping) {
        await savePaymentHistoryRowMapping(
            supabase,
            paymentEventRowId,
            spreadsheetId,
            tab,
            resolution.row,
            true,
        )
    }
    await ensureGridRowExists(spreadsheetId, tab, resolution.row)
    await updateRow(spreadsheetId, tab, resolution.row, values, headers)
    return { row: resolution.row, appended: true }
}

/** Serialize writes to one managed tab across edge-function instances. */
export async function withSheetProjectionLock<T>(
    supabase: any,
    spreadsheetId: string,
    tab: string,
    action: () => Promise<T>,
): Promise<T> {
    if (!supabase?.rpc) throw new Error("Durable Sheet projection lock is unavailable")
    const lockKey = `${spreadsheetId}:${tab}`
    const ownerToken = crypto.randomUUID()
    const deadline = Date.now() + 12_000
    let acquired = false
    while (!acquired && Date.now() < deadline) {
        const result = await supabase.rpc("acquire_sheet_projection_lock", {
            p_lock_key: lockKey,
            p_owner_token: ownerToken,
            p_lease_seconds: 180,
        })
        if (result.error) {
            throw new Error(`Sheet projection lock failed: ${result.error.message || result.error}`)
        }
        acquired = result.data === true
        if (!acquired) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!acquired) throw new Error(`Sheet projection is busy; retry later (${tab})`)

    try {
        return await action()
    } finally {
        const release = await supabase.rpc("release_sheet_projection_lock", {
            p_lock_key: lockKey,
            p_owner_token: ownerToken,
        })
        if (release.error) {
            console.error("[sheets] could not release projection lock", {
                tab,
                message: release.error.message || String(release.error),
            })
        }
    }
}

export async function appendHistoryRowOnceByFingerprint(
    sheetId: string,
    tab: string,
    values: (string | number | null)[],
    headers: string[],
    fingerprintColumns: string[],
): Promise<{ row: number | null; appended: boolean }> {
    if (!Array.isArray(fingerprintColumns) || fingerprintColumns.length === 0) {
        throw new Error(`History fingerprint is required for ${tab}`)
    }
    if (!sheetsEnabled()) return { row: null, appended: false }

    await ensureTab(tab, sheetId)
    await ensureHeaders(tab, headers, sheetId)
    const rows = await readTabValues(sheetId, tab, "A1:ZZ10000")
    const header = Array.isArray(rows[0]) ? rows[0].map((cell) => String(cell ?? "").trim()) : []
    const missingColumn = fingerprintColumns.find((column) =>
        !header.some((cell) => cell.toLowerCase() === String(column).trim().toLowerCase())
    )
    if (missingColumn) {
        throw new Error(`History fingerprint column not found in ${tab}: ${missingColumn}`)
    }

    const matches: number[] = []
    for (let index = 1; index < rows.length; index++) {
        const row = Array.isArray(rows[index]) ? rows[index] : []
        if (rowMatchesColumnFingerprint(row, header, values, fingerprintColumns, headers)) {
            matches.push(index + 1)
        }
    }
    if (matches.length > 1) {
        throw new Error(`Multiple history Sheet rows match fingerprint in ${tab}`)
    }
    if (matches.length === 1) return { row: matches[0], appended: false }

    const row = await appendRow(sheetId, tab, values, headers)
    if (row) return { row, appended: true }

    const rechecked = await readTabValues(sheetId, tab, "A1:ZZ10000")
    const recheckedHeader = Array.isArray(rechecked[0])
        ? rechecked[0].map((cell) => String(cell ?? "").trim())
        : header
    const recheckedMatches: number[] = []
    for (let index = 1; index < rechecked.length; index++) {
        const candidate = Array.isArray(rechecked[index]) ? rechecked[index] : []
        if (
            rowMatchesColumnFingerprint(
                candidate,
                recheckedHeader,
                values,
                fingerprintColumns,
                headers,
            )
        ) {
            recheckedMatches.push(index + 1)
        }
    }
    if (recheckedMatches.length > 1) {
        throw new Error(`Multiple history Sheet rows match fingerprint in ${tab}`)
    }
    if (recheckedMatches.length === 1) return { row: recheckedMatches[0], appended: true }
    throw new Error(`History Sheet row append returned no row for ${tab}`)
}

export async function safeUpdateRow(
    sheetId: string,
    tab: string,
    row: number | null,
    values: (string | number | null)[],
    headers?: string[],
): Promise<number | null> {
    if (!row || row < 1) return null
    return updateRow(sheetId, tab, row, values, headers)
}
