export type RetryState = {
    status?: unknown
    expiresAt?: string | null
}

export type PaymentAttemptInsertParams = {
    bookingId: string
    attemptNo: number
    idempotencyKey: string
    provider: string
    amount: number
    currency?: string
    providerOrderId?: string | null
    providerPaymentId?: string | null
    providerTransactionId?: string | null
    status?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): boolean {
    return UUID_PATTERN.test(String(value || "").trim())
}

export function normalizeIdempotencyKey(value: unknown, fieldName = "idempotency_key"): string {
    const candidate = String(value || "").trim()
    if (!isUuid(candidate)) {
        throw new Error(`Invalid ${fieldName}: expected a valid UUID`)
    }
    return candidate.toLowerCase()
}

function normalizeForFingerprint(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeForFingerprint)
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        return Object.fromEntries(
            Object.keys(record)
                .filter((key) => record[key] !== undefined)
                .sort()
                .map((key) => [key, normalizeForFingerprint(record[key])]),
        )
    }
    if (typeof value === "string") return value.trim()
    return value
}

export async function fingerprintBookingRequest(value: unknown): Promise<string> {
    const serialized = JSON.stringify(normalizeForFingerprint(value))
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(serialized),
    )
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

export function canStartPaymentRetry(
    state: RetryState,
    now = new Date(),
): boolean {
    const status = String(state?.status || "").trim().toLowerCase()
    if (status === "paid" || status === "succeeded") return false
    if (status === "failed" || status === "expired") return true
    // A stale pending attempt is not implicitly retryable. The provider or an
    // explicit reconciliation action must first move it to `expired`, so a
    // retry cannot race an in-flight payment.
    return false
}

export function isStalePaymentAttempt(
    state: RetryState,
    now = new Date(),
): boolean {
    const status = String(state?.status || "").trim().toLowerCase()
    if (status !== "pending" && status !== "creating") return false
    const expiresAt = String(state?.expiresAt || "").trim()
    if (!expiresAt) return false
    const expiry = new Date(expiresAt)
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()
}

export function nextPaymentAttemptNumber(attempts: Array<{ attempt_no?: unknown }>): number {
    const highest = (Array.isArray(attempts) ? attempts : []).reduce((max, attempt) => {
        const value = Number(attempt?.attempt_no)
        return Number.isFinite(value) ? Math.max(max, Math.floor(value)) : max
    }, 0)
    return highest + 1
}

export function amountToMinorUnits(value: unknown): number {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) return 0
    return Math.round((amount + Number.EPSILON) * 100)
}

export function buildPaymentAttemptInsert(params: PaymentAttemptInsertParams): Record<string, unknown> {
    const provider = String(params.provider || "unknown").trim().toLowerCase() || "unknown"
    const currency = String(params.currency || "INR").trim().toUpperCase() || "INR"

    return {
        booking_id: String(params.bookingId || "").trim(),
        attempt_no: Math.max(1, Math.floor(Number(params.attemptNo) || 1)),
        idempotency_key: normalizeIdempotencyKey(params.idempotencyKey, "idempotency_key"),
        provider,
        amount_minor: amountToMinorUnits(params.amount),
        currency,
        provider_order_id: params.providerOrderId ? String(params.providerOrderId).trim() : null,
        provider_payment_id: params.providerPaymentId ? String(params.providerPaymentId).trim() : null,
        provider_transaction_id: params.providerTransactionId ? String(params.providerTransactionId).trim() : null,
        status: String(params.status || "pending").trim().toLowerCase() || "pending",
    }
}

export function isCompatibleIdempotentReplay(
    existingFingerprint: unknown,
    requestedFingerprint: unknown,
): boolean {
    const existing = String(existingFingerprint || "").trim().toLowerCase()
    const requested = String(requestedFingerprint || "").trim().toLowerCase()
    return Boolean(existing && requested && existing === requested)
}
