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
let cachedToken: TokenCache | null = null;
let cachedServiceAccount: ServiceAccount | null = null;

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
}

export function sheetsEnabled(): boolean {
    return isTruthy(Deno.env.get("SHEETS_WRITE_ENABLED"));
}

function shouldBootstrapHeaders(): boolean {
    return isTruthy(Deno.env.get("SHEETS_BOOTSTRAP_HEADERS"));
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
        const createRes = await sheetsFetch(":batchUpdate", sheetId, {
            method: "POST",
            body: JSON.stringify({
                requests: [{ addSheet: { properties: { title: tab } } }],
            }),
        });
        if (!createRes.ok) {
            const text = await createRes.text();
            throw new Error(`Sheet tab create failed: ${createRes.status} ${text}`);
        }
    }

    ensuredTabs.get(sheetId)!.add(tab);
}

async function ensureHeaders(tab: string, headers: string[], sheetId: string) {
    await ensureTab(tab, sheetId);
    if (!shouldBootstrapHeaders()) return;

    if (!ensuredHeaders.has(sheetId)) ensuredHeaders.set(sheetId, new Set());
    if (ensuredHeaders.get(sheetId)!.has(tab)) return;

    const check = await sheetsFetch(`/values/${encodeURIComponent(tab)}!A1:A1`, sheetId);
    if (!check.ok) {
        const text = await check.text();
        throw new Error(`Header check failed: ${check.status} ${text}`);
    }
    const data = await check.json();
    const hasHeader = Array.isArray(data.values) && data.values.length > 0 &&
        data.values[0][0];
    if (!hasHeader) {
        await updateRow(sheetId, tab, 1, headers);
    }
    ensuredHeaders.get(sheetId)!.add(tab);
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

export async function duplicateTab(
    sheetId: string,
    sourceTab: string,
    newTab: string,
): Promise<void> {
    if (!sheetsEnabled()) return;
    const sourceTitle = String(sourceTab || "").trim();
    const targetTitle = String(newTab || "").trim();
    if (!sourceTitle || !targetTitle) {
        throw new Error("duplicateTab requires sourceTab and newTab");
    }

    const tabs = await getSpreadsheetTabs(sheetId);
    const source = tabs.find((tab) => tab.title === sourceTitle);
    if (!source) {
        throw new Error(`Source tab not found: ${sourceTitle}`);
    }
    const existing = tabs.find((tab) => tab.title === targetTitle);
    if (existing) return;

    const res = await sheetsFetch(":batchUpdate", sheetId, {
        method: "POST",
        body: JSON.stringify({
            requests: [
                {
                    duplicateSheet: {
                        sourceSheetId: source.sheetId,
                        newSheetName: targetTitle,
                    },
                },
            ],
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Duplicate tab failed: ${res.status} ${text}`);
    }
    if (!ensuredTabs.has(sheetId)) ensuredTabs.set(sheetId, new Set());
    ensuredTabs.get(sheetId)!.add(targetTitle);
}

export async function deleteTab(
    sheetId: string,
    tabTitle: string,
): Promise<boolean> {
    if (!sheetsEnabled()) return false;
    const title = String(tabTitle || "").trim();
    if (!title) return false;

    const tabs = await getSpreadsheetTabs(sheetId);
    const target = tabs.find((tab) => tab.title === title);
    if (!target) return false;

    const res = await sheetsFetch(":batchUpdate", sheetId, {
        method: "POST",
        body: JSON.stringify({
            requests: [
                {
                    deleteSheet: {
                        sheetId: target.sheetId,
                    },
                },
            ],
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete tab failed: ${res.status} ${text}`);
    }

    ensuredTabs.get(sheetId)?.delete(title);
    ensuredHeaders.get(sheetId)?.delete(title);
    return true;
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
        `/values/${encodeURIComponent(tab)}!A:Z:append?valueInputOption=RAW`,
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
    if (!sheetsEnabled()) return null;
    const needle = String(value || "").trim();
    if (!needle) return null;

    await ensureTab(tab, sheetId);
    if (headers?.length) await ensureHeaders(tab, headers, sheetId);

    const rows = await readTabValues(sheetId, tab, "A1:ZZ");
    if (rows.length === 0) return null;

    const header = Array.isArray(rows[0]) ? rows[0].map((cell) => String(cell || "").trim()) : [];
    const index = header.findIndex((cell) => cell.toLowerCase() === String(columnName || "").trim().toLowerCase());
    if (index < 0) return null;

    for (let i = 1; i < rows.length; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const cell = String(row[index] || "").trim();
        if (cell === needle) return i + 1;
    }

    return null;
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
