const BOOKING_STATUS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim()
    )
}

function timingSafeEqual(a: string, b: string): boolean {
    const aa = new TextEncoder().encode(String(a || ""))
    const bb = new TextEncoder().encode(String(b || ""))
    if (aa.length !== bb.length) return false
    let diff = 0
    for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]
    return diff === 0
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function signTokenPayload(payload: string, secret: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${payload}.${secret}`)
    )
    return bytesToBase64Url(new Uint8Array(digest))
}

export function resolveBookingStatusSecret(preferredFallback?: string): string {
    const envSecret = String(Deno.env.get("BOOKING_STATUS_TOKEN_SECRET") || "").trim()
    if (envSecret) return envSecret
    return String(preferredFallback || "").trim()
}

export function listBookingStatusSecrets(): string[] {
    const candidates = [
        Deno.env.get("BOOKING_STATUS_TOKEN_SECRET"),
        Deno.env.get("PAYU_LIVE_SALT"),
        Deno.env.get("PAYU_TEST_SALT"),
        Deno.env.get("PAYU_SALT"),
    ]
    const out: string[] = []
    for (const candidate of candidates) {
        const secret = String(candidate || "").trim()
        if (!secret) continue
        if (!out.includes(secret)) out.push(secret)
    }
    return out
}

export async function issueBookingStatusToken(
    bookingId: string,
    secret: string,
    ttlSeconds = BOOKING_STATUS_TOKEN_TTL_SECONDS
): Promise<{ token: string; expiresAt: string; expiresUnix: number }> {
    const normalizedId = String(bookingId || "").trim().toLowerCase()
    const normalizedSecret = String(secret || "").trim()

    if (!isUuid(normalizedId)) throw new Error("Invalid booking id for status token")
    if (!normalizedSecret) throw new Error("Missing status token secret")

    const now = Math.floor(Date.now() / 1000)
    const expiresUnix = now + Math.max(60, Math.floor(Number(ttlSeconds) || 0))
    const payload = `${normalizedId}.${expiresUnix}`
    const signature = await signTokenPayload(payload, normalizedSecret)
    return {
        token: `v1.${expiresUnix}.${signature}`,
        expiresAt: new Date(expiresUnix * 1000).toISOString(),
        expiresUnix,
    }
}

export async function verifyBookingStatusToken(
    token: string,
    bookingId: string,
    secret: string
): Promise<boolean> {
    const normalizedToken = String(token || "").trim()
    const normalizedId = String(bookingId || "").trim().toLowerCase()
    const normalizedSecret = String(secret || "").trim()
    if (!normalizedToken || !normalizedSecret || !isUuid(normalizedId)) return false

    const parts = normalizedToken.split(".")
    if (parts.length !== 3 || parts[0] !== "v1") return false

    const expiresUnix = Number(parts[1])
    const signature = String(parts[2] || "").trim()
    if (!Number.isFinite(expiresUnix) || expiresUnix <= 0 || !signature) return false

    const now = Math.floor(Date.now() / 1000)
    if (expiresUnix < now) return false

    const payload = `${normalizedId}.${expiresUnix}`
    const expected = await signTokenPayload(payload, normalizedSecret)
    return timingSafeEqual(expected, signature)
}
