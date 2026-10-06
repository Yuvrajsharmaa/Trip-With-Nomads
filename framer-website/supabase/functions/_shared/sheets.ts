import { importPKCS8, SignJWT } from "https://esm.sh/jose@4.15.4";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

type ServiceAccount = {
    client_email: string;
    private_key: string;
};

type TokenCache = {
    token: string;
    exp: number;
};

export type SheetTabMetadata = {
    title: string;
    sheetId: number;
};

const ensuredHeaders = new Map<string, Set<string>>(); // map sheetId -> Set of tab names
const ensuredTabs = new Map<string, Set<string>>();
const ensuredFormatting = new Map<string, Set<string>>();
let cachedToken: TokenCache | null = null;
let cachedServiceAccount: ServiceAccount | null = null;

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
}

export function sheetsEnabled(): boolean {
    return isTruthy(Deno.env.get("SHEETS_WRITE_ENABLED"));
}

export type CurrentRowAction = "append" | "update" | "fail"

export function currentRowAction(matchCount: number): CurrentRowAction {
    if (matchCount === 0) return "append";
    if (matchCount === 1) return "update";
    return "fail";
}

export function hasExactHeaders(actual: string[], expected: string[]): boolean {
    return actual.length === expected.length && expected.every((header, index) => actual[index] === header);
}

function getServiceAccount(): ServiceAccount {
    if (cachedServiceAccount) return cachedServiceAccount;
    const raw = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "").trim();
    if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
    const parsed = JSON.parse(raw);
    if (!parsed?.client_email || !parsed?.private_key) {
        throw new Error(
            "GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key",
        );
    }
    cachedServiceAccount = {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
    };
    return cachedServiceAccount;
}

async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Cache the token aggressively
    if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

    const { client_email, private_key } = getServiceAccount();
    const key = await importPKCS8(private_key, "RS256");
    const jwt = await new SignJWT({ scope: SHEETS_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setIssuer(client_email)
        .setAudience(TOKEN_URL)
        .sign(key);

    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    });

    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const token = String(data.access_token || "");
    const exp = now + Number(data.expires_in || 0);
    if (!token) throw new Error("Missing access_token in token response");
    cachedToken = { token, exp };
    return token;
}

async function sheetsFetch(path: string, sheetId: string, init?: RequestInit) {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    return fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`,
        {
            ...init,
            headers,
        }
    );
}

async function ensureTab(tab: string, sheetId: string) {
    if (!ensuredTabs.has(sheetId)) ensuredTabs.set(sheetId, new Set());
    if (ensuredTabs.get(sheetId)!.has(tab)) return;

    const metaRes = await sheetsFetch("?fields=sheets.properties.title", sheetId);
    if (!metaRes.ok) {
        const text = await metaRes.text();
        throw new Error(`Sheet metadata read failed: ${metaRes.status} ${text}`);
    }

    const meta = await metaRes.json();
    const exists = Array.isArray(meta?.sheets) &&
        meta.sheets.some((sheet: any) =>
            String(sheet?.properties?.title || "").trim() === tab
        );

    if (!exists) {
        throw new Error(`Managed Sheet tab not found: ${tab}`);
    }

    ensuredTabs.get(sheetId)!.add(tab);
}

async function ensureHeaders(tab: string, headers: string[], sheetId: string) {
    await ensureTab(tab, sheetId);
    if (!ensuredHeaders.has(sheetId)) ensuredHeaders.set(sheetId, new Set());
    if (ensuredHeaders.get(sheetId)!.has(tab)) return;

    const check = await sheetsFetch(`/values/${encodeURIComponent(tab)}!A1:ZZ1`, sheetId);
    if (!check.ok) {
        const text = await check.text();
        throw new Error(`Header check failed: ${check.status} ${text}`);
    }
    const data = await check.json();
    const actual = Array.isArray(data?.values?.[0])
        ? data.values[0].map((cell: any) => String(cell ?? "").trim())
        : [];
    const expected = headers.map((header) => String(header || "").trim());
    const matches = hasExactHeaders(actual, expected);
    if (!matches) {
        throw new Error(
            `Managed Sheet header drift in ${tab}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    }
    ensuredHeaders.get(sheetId)!.add(tab);
    await formatManagedTab(sheetId, tab, headers);
}

function parseRowIndex(range?: string | null): number | null {
    if (!range) return null;
    const match = /!A(\d+)/.exec(range);
    if (!match) return null;
    return Number(match[1]);
}

function columnNumberToName(columnNumber: number): string {
    let next = Math.max(1, Math.floor(columnNumber));
    let name = "";
    while (next > 0) {
        const remainder = (next - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        next = Math.floor((next - 1) / 26);
    }
    return name;
}

export async function getSpreadsheetTabs(sheetId: string): Promise<SheetTabMetadata[]> {
    if (!sheetsEnabled()) return [];
    const res = await sheetsFetch("?fields=sheets.properties(sheetId,title)", sheetId);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spreadsheet tabs read failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const sheets = Array.isArray(data?.sheets) ? data.sheets : [];
    return sheets
        .map((sheet: any) => ({
            title: String(sheet?.properties?.title || "").trim(),
            sheetId: Number(sheet?.properties?.sheetId),
        }))
        .filter((sheet: SheetTabMetadata) => sheet.title && Number.isFinite(sheet.sheetId));
}

export async function formatManagedTab(
    sheetId: string,
    tab: string,
    headers: string[],
): Promise<void> {
    if (!sheetsEnabled() || !headers.length) return;
    if (!ensuredFormatting.has(sheetId)) ensuredFormatting.set(sheetId, new Set());
    if (ensuredFormatting.get(sheetId)!.has(tab)) return;

    const metadata = await getSpreadsheetTabs(sheetId);
    const target = metadata.find((item) => item.title === tab);
    if (!target) throw new Error(`Managed Sheet tab not found: ${tab}`);

    const amountHeaders = new Set([
        "Subtotal", "Discount", "GST", "Trip Total", "Payable Now", "Paid Amount", "Balance Due",
        "Amount Received", "Expected Amount",
    ]);
    const wrapHeaders = new Set(["Traveller Summary", "Notes", "Reason", "Latest Page URL"]);
    const requests: any[] = [
        {
            updateSheetProperties: {
                properties: { sheetId: target.sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
            },
        },
        {
            setBasicFilter: {
                filter: {
                    range: { sheetId: target.sheetId, startRowIndex: 0, endColumnIndex: headers.length },
                },
            },
        },
        {
            repeatCell: {
                range: { sheetId: target.sheetId, startRowIndex: 0, endRowIndex: 1, endColumnIndex: headers.length },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.91, green: 0.94, blue: 0.98 },
                    },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
        },
    ];

    headers.forEach((header, index) => {
        const width = wrapHeaders.has(header) ? 280 : /url/i.test(header) ? 240 : 140;
        requests.push({
            updateDimensionProperties: {
                range: { sheetId: target.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
                properties: { pixelSize: width },
                fields: "pixelSize",
            },
        });
        if (amountHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: { sheetId: target.sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 },
                    cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "₹#,##0.00" } } },
                    fields: "userEnteredFormat.numberFormat",
                },
            });
        }
        if (wrapHeaders.has(header)) {
            requests.push({
                repeatCell: {
                    range: { sheetId: target.sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 },
                    cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
                    fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
                },
            });
        }
    });

    const sendFormatting = (batchRequests: any[]) => sheetsFetch(":batchUpdate", sheetId, {
        method: "POST",
        body: JSON.stringify({ requests: batchRequests }),
    });

    let res = await sendFormatting(requests);
    if (!res.ok) {
        const text = await res.text();
        const tableOwnsFilter = text.includes("setBasicFilter") &&
            text.includes("partially intersects a table");
        if (!tableOwnsFilter) {
            throw new Error(`Managed Sheet formatting failed: ${res.status} ${text}`);
        }

        // Some existing managed tabs already contain a Google Sheets table.
        // Google rejects a basic filter that intersects that table; the table
        // already supplies filtering, so preserve the other formatting and
        // retry without trying to replace the table's filter.
        res = await sendFormatting(requests.filter((request) => !request.setBasicFilter));
        if (!res.ok) {
            const retryText = await res.text();
            throw new Error(`Managed Sheet formatting failed: ${res.status} ${retryText}`);
        }
    }
    ensuredFormatting.get(sheetId)!.add(tab);
}

export async function clearTabValues(
    sheetId: string,
    tab: string,
): Promise<void> {
    if (!sheetsEnabled()) return;
    await ensureTab(tab, sheetId);
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A:ZZ:clear`,
        sheetId,
        {
            method: "POST",
            body: JSON.stringify({}),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Clear tab failed: ${res.status} ${text}`);
    }
}

export async function replaceTabValues(
    sheetId: string,
    tab: string,
    rows: (string | number | null)[][],
): Promise<number> {
    if (!sheetsEnabled()) return 0;
    await ensureTab(tab, sheetId);
    await clearTabValues(sheetId, tab);
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    const maxCols = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const endCol = columnNumberToName(Math.max(1, maxCols));
    const endRow = rows.length;
    const range = `${tab}!A1:${endCol}${endRow}`;
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        sheetId,
        {
            method: "PUT",
            body: JSON.stringify({ values: rows }),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Replace tab failed: ${res.status} ${text}`);
    }
    return rows.length;
}

export async function appendRow(
    sheetId: string,
    tab: string,
    values: (string | number | null)[],
    headers?: string[],
) {
    if (!sheetsEnabled()) return null;
    await ensureTab(tab, sheetId);
    if (headers?.length) await ensureHeaders(tab, headers, sheetId);

    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A:ZZ:append?valueInputOption=RAW`,
        sheetId,
        {
            method: "POST",
            body: JSON.stringify({ values: [values] }),
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Append failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return parseRowIndex(data?.updates?.updatedRange || null);
}

export async function updateRow(
    sheetId: string,
    tab: string,
    row: number,
    values: (string | number | null)[],
    headers?: string[],
) {
    if (!sheetsEnabled()) return null;
    await ensureTab(tab, sheetId);
    if (headers?.length) await ensureHeaders(tab, headers, sheetId);

    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!A${row}?valueInputOption=RAW`,
        sheetId,
        {
            method: "PUT",
            body: JSON.stringify({ values: [values] }),
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Update failed: ${res.status} ${text}`);
    }
    return row;
}

export async function readTabValues(
    sheetId: string,
    tab: string,
    range = "A:ZZ",
): Promise<any[][]> {
    if (!sheetsEnabled()) return [];
    await ensureTab(tab, sheetId);
    const res = await sheetsFetch(
        `/values/${encodeURIComponent(tab)}!${encodeURIComponent(range)}`,
        sheetId,
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Read values failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    return Array.isArray(data?.values) ? data.values : [];
}

export async function findRowByColumnValue(
    sheetId: string,
    tab: string,
    columnName: string,
    value: string,
    headers?: string[],
): Promise<number | null> {
    const matches = await findRowsByColumnValue(sheetId, tab, columnName, value, headers);
    if (currentRowAction(matches.length) === "fail") {
        throw new Error(
            `Multiple current-state Sheet rows match ${columnName}=${String(value || "").trim()} in ${tab}`,
        );
    }
    return matches[0] || null;
}

export async function findRowsByColumnValue(
    sheetId: string,
    tab: string,
    columnName: string,
    value: string,
    headers?: string[],
): Promise<number[]> {
    if (!sheetsEnabled()) return [];
    const needle = String(value || "").trim();
    if (!needle) return [];

    await ensureTab(tab, sheetId);
    if (headers?.length) await ensureHeaders(tab, headers, sheetId);

    const rows = await readTabValues(sheetId, tab, "A1:ZZ");
    if (rows.length === 0) return [];

    const header = Array.isArray(rows[0]) ? rows[0].map((cell) => String(cell || "").trim()) : [];
    const index = header.findIndex((cell) => cell.toLowerCase() === String(columnName || "").trim().toLowerCase());
    if (index < 0) return [];

    const matches: number[] = [];
    for (let i = 1; i < rows.length; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const cell = String(row[index] || "").trim();
        if (cell === needle) matches.push(i + 1);
    }

    return matches;
}

export async function upsertCurrentRow(
    sheetId: string,
    tab: string,
    keyColumn: string,
    keyValue: string,
    values: (string | number | null)[],
    headers?: string[],
): Promise<{ row: number; created: boolean }> {
    if (!String(keyValue || "").trim()) {
        throw new Error(`Current-state Sheet key is required for ${tab}`)
    }
    const matches = await findRowsByColumnValue(sheetId, tab, keyColumn, keyValue, headers);
    if (currentRowAction(matches.length) === "fail") {
        throw new Error(
            `Multiple current-state Sheet rows match ${keyColumn}=${String(keyValue || "").trim()} in ${tab}`,
        );
    }
    if (matches.length === 1) {
        await updateRow(sheetId, tab, matches[0], values, headers);
        return { row: matches[0], created: false };
    }
    const row = await appendRow(sheetId, tab, values, headers);
    if (!row) throw new Error(`Current-state Sheet row append returned no row for ${tab}`);
    return { row, created: true };
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
    const matches = await findRowsByColumnValue(sheetId, tab, eventIdColumn, eventId, headers);
    if (matches.length > 0) return { row: matches[0], appended: false };
    return { row: await appendRow(sheetId, tab, values, headers), appended: true };
}

export async function safeUpdateRow(
    sheetId: string,
    tab: string,
    row: number | null,
    values: (string | number | null)[],
    headers?: string[],
): Promise<number | null> {
    if (!row || row < 1) return null;
    return updateRow(sheetId, tab, row, values, headers);
}
