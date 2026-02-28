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
